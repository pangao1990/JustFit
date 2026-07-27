'use strict';

const {
  createCollectedTargetItemId,
  getCollectedTargetCandidates,
  getNewlyUnlockedItem,
  getUnlockedItems,
  isCollectedTargetItemId
} = require('./catalog');
const { createSpecialToken, getUnlockedItemRules } = require('./item-rules');
const {
  COLLECTIBLE_MAP,
  createCollectibleToken,
  getThemeCollectibles,
  rollCollectible
} = require('./theme-collectibles');
const { getForcedItemRuleId } = require('./mechanics');
const { normalizeThemeId } = require('./themes');
const { RNG, clamp, dayKey, hashString } = require('./utils');

const TARGET_PER_BOX = 3;
const ACTIVE_ORDER_COUNT = 3;

function createOrderQueue(rng, itemIds, boxCount) {
  const queue = [];
  for (let i = 0; i < boxCount; i += 1) {
    const forbidden = new Set(queue.slice(Math.max(0, queue.length - 2)));
    const candidates = itemIds.filter((id) => !forbidden.has(id));
    const pool = candidates.length ? candidates : itemIds;
    queue.push(rng.pick(pool));
  }
  return queue;
}

function createValidSolution(rng, orderQueue, activeOrderCount) {
  const solution = [];
  const active = [];
  let cursor = 0;
  const activeCount = clamp(activeOrderCount || ACTIVE_ORDER_COUNT, 1, ACTIVE_ORDER_COUNT);

  while (active.length < activeCount && cursor < orderQueue.length) {
    active.push({ type: orderQueue[cursor], remaining: TARGET_PER_BOX });
    cursor += 1;
  }

  while (active.length) {
    const finishable = active.filter((order) => order.remaining === 1);
    const shouldFinish = finishable.length && rng.next() < 0.58;
    const selected = shouldFinish ? rng.pick(finishable) : rng.pick(active);
    solution.push(selected.type);
    selected.remaining -= 1;

    if (selected.remaining === 0) {
      const index = active.indexOf(selected);
      active.splice(index, 1);
      if (cursor < orderQueue.length) {
        active.push({ type: orderQueue[cursor], remaining: TARGET_PER_BOX });
        cursor += 1;
      }
    }
  }

  return solution;
}

function getActiveOrderCount(level, daily) {
  if (daily) return ACTIVE_ORDER_COUNT;
  if (level <= 1) return 1;
  return level < 15 ? 2 : ACTIVE_ORDER_COUNT;
}

function getTimeLimitMs(level, daily, boxCount, stackCount) {
  if (daily) return 90000;
  // 时间随目标箱数量增长，但后期会逐渐收紧。首关约 54 秒，长关卡约
  // 90–110 秒；既能制造失败压力，也不要求玩家疯狂连点。
  const seconds = 38
    + Math.max(1, boxCount) * 4.5
    + Math.max(1, stackCount) * 2.5
    - Math.min(80, Math.max(1, level)) * 0.35;
  return Math.round(clamp(seconds, 48, 118) * 1000);
}

function pickCollectedTargetItem(rng, themeId, level, daily, options) {
  const opts = options || {};
  if (opts.disableCollectedTargets) return null;
  const candidates = getCollectedTargetCandidates(themeId, opts.collection, level);
  if (!candidates.length) return null;

  const forcedId = opts.forceCollectedTargetId || '';
  if (forcedId) {
    return candidates.find((item) => (
      item.collectibleId === forcedId || item.id === forcedId
    )) || null;
  }

  // 点亮藏品后，每关有 34%–58% 概率回到目标箱；主线每 5 关再提供
  // 一次保底，让“收藏改变后续关卡”能够被玩家真实感知，同时每关最多
  // 只加入一种闪耀目标，避免稀有感被普通目标淹没。
  const chance = opts.collectedTargetChance == null
    ? (daily ? 0.68 : clamp(0.34 + candidates.length * 0.018, 0.34, 0.58))
    : clamp(Number(opts.collectedTargetChance) || 0, 0, 1);
  const guaranteed = !daily && level >= 5 && level % 5 === 0;
  if (!guaranteed && rng.next() >= chance) return null;
  return rng.pick(candidates);
}

function applyItemRules(rng, solutionTypes, level, daily, options) {
  const opts = options || {};
  if (opts.disableRules) return [];
  const unlocked = getUnlockedItemRules(level).filter((rule) => !rule.trap);
  if (!unlocked.length) return [];

  const candidates = [];
  for (let i = 3; i < solutionTypes.length - 2; i += 1) {
    if (!isCollectedTargetItemId(solutionTypes[i])) candidates.push(i);
  }
  if (!candidates.length) return [];
  rng.shuffle(candidates);

  const desired = opts.forceRuleId
    ? 1
    : (daily ? 7 : clamp(1 + Math.floor((level - 6) / 7), 1, 8));
  const chosen = [];
  const used = new Set();

  for (let i = 0; i < candidates.length && chosen.length < desired; i += 1) {
    const index = candidates[i];
    if (used.has(index - 1) || used.has(index + 1)) continue;
    const rule = opts.forceRuleId
      ? unlocked.find((entry) => entry.id === opts.forceRuleId)
      : rng.pick(unlocked);
    if (!rule) continue;
    solutionTypes[index] = createSpecialToken(solutionTypes[index], rule.id);
    used.add(index);
    chosen.push({ index, ruleId: rule.id });
  }
  return chosen;
}

function createOrderRules(rng, boxCount, level, daily, options) {
  const opts = options || {};
  const rules = Array.from({ length: boxCount }, () => null);
  if (!daily && level < 22) return rules;
  if (!daily && (level === 22 || opts.forceRushOrder)) {
    rules[0] = {
      type: 'rush',
      moves: 9,
      bonus: 100 + Math.min(100, Math.floor(level / 10) * 10)
    };
    return rules;
  }
  const candidates = [];
  for (let i = 2; i < boxCount; i += 1) candidates.push(i);
  rng.shuffle(candidates);
  const count = daily ? 3 : clamp(1 + Math.floor((level - 22) / 28), 1, 3);
  candidates.slice(0, count).forEach((index) => {
    rules[index] = {
      type: 'rush',
      moves: daily ? 10 : 9,
      bonus: 100 + Math.min(100, Math.floor(level / 10) * 10)
    };
  });
  return rules;
}

function insertBombTraps(rng, distributed, orderQueue, level, daily, options) {
  const opts = options || {};
  if (opts.disableRules || opts.disableBombs) return [];
  const forced = opts.forceBomb || opts.forceRuleId === 'bomb';
  if (!forced && !daily && level < 18) return [];
  const desired = forced ? 1 : (daily ? 2 : clamp(1 + Math.floor((level - 18) / 45), 1, 3));
  const availableStacks = rng.shuffle(distributed.stacks.map((_, index) => index));
  const safeOrderTypes = orderQueue.filter((type) => !isCollectedTargetItemId(type));
  const traps = [];
  for (let index = 0; index < Math.min(desired, availableStacks.length); index += 1) {
    const stackIndex = availableStacks[index];
    const baseType = rng.pick(safeOrderTypes.length ? safeOrderTypes : orderQueue);
    if (!baseType) continue;
    // 炸弹放在某条货架的最深处：这条货架提前清空时会露出陷阱，
    // 但保证解永远不需要点击它，避免生成强制死亡关。
    distributed.stacks[stackIndex].push(createSpecialToken(baseType, 'bomb'));
    traps.push({ stackIndex, ruleId: 'bomb', type: baseType });
  }
  return traps;
}

function distributeAcrossStacks(rng, solutionTypes, stackCount) {
  const stacks = Array.from({ length: stackCount }, () => []);
  const solutionStacks = [];

  solutionTypes.forEach((type, moveIndex) => {
    let candidates = stacks
      .map((stack, index) => ({ index, size: stack.length }))
      .sort((a, b) => a.size - b.size);

    const minSize = candidates[0].size;
    const spread = moveIndex < stackCount ? 0 : (rng.next() < 0.68 ? 1 : 2);
    candidates = candidates.filter((entry) => entry.size <= minSize + spread);

    let selected = rng.pick(candidates).index;
    if (solutionStacks.length >= 2) {
      const last = solutionStacks[solutionStacks.length - 1];
      const beforeLast = solutionStacks[solutionStacks.length - 2];
      if (selected === last && last === beforeLast && candidates.length > 1) {
        selected = rng.pick(candidates.filter((entry) => entry.index !== selected)).index;
      }
    }

    stacks[selected].push(type);
    solutionStacks.push(selected);
  });

  return { stacks, solutionStacks };
}

function insertCollectible(rng, distributed, solutionTypes, themeId, level, daily, options) {
  const opts = options || {};
  const collectible = rollCollectible(rng, themeId, level, daily, opts);
  if (!collectible || level < collectible.minLevel) return null;

  const candidates = distributed.stacks
    .map((stack, index) => ({ index, length: stack.length }))
    .filter((entry) => entry.length > 0);
  if (!candidates.length) return null;

  const selected = rng.pick(candidates);
  const maxDepth = Math.min(selected.length - 1, daily ? 5 : 4);
  const depth = maxDepth > 0 && rng.next() > 0.2 ? rng.int(1, maxDepth) : 0;
  let localOccurrence = 0;
  let globalIndex = distributed.solutionStacks.length;
  for (let i = 0; i < distributed.solutionStacks.length; i += 1) {
    if (distributed.solutionStacks[i] !== selected.index) continue;
    if (localOccurrence === depth) {
      globalIndex = i;
      break;
    }
    localOccurrence += 1;
  }

  const token = createCollectibleToken(collectible.id);
  distributed.stacks[selected.index].splice(depth, 0, token);
  distributed.solutionStacks.splice(globalIndex, 0, selected.index);
  solutionTypes.splice(globalIndex, 0, token);

  return {
    id: collectible.id,
    stackIndex: selected.index,
    depth,
    solutionIndex: globalIndex
  };
}

function insertRareFruit(rng, distributed, solutionTypes, level, daily, options) {
  const opts = options || {};
  return insertCollectible(rng, distributed, solutionTypes, opts.themeId || 'fruit', level, daily, opts);
}

function removeCollectibleFromLevel(levelConfig, collectibleId) {
  if (!levelConfig || !collectibleId || !COLLECTIBLE_MAP[collectibleId]) return false;
  const token = createCollectibleToken(collectibleId);
  let removed = false;
  levelConfig.stacks.forEach((stack) => {
    const index = stack.indexOf(token);
    if (index >= 0) {
      stack.splice(index, 1);
      removed = true;
    }
  });
  if (Array.isArray(levelConfig._solutionTypes)) {
    const solutionIndex = levelConfig._solutionTypes.indexOf(token);
    if (solutionIndex >= 0) {
      levelConfig._solutionTypes.splice(solutionIndex, 1);
      if (Array.isArray(levelConfig._solutionStacks)) levelConfig._solutionStacks.splice(solutionIndex, 1);
    }
  }
  if (removed) {
    levelConfig.collectibleId = null;
    levelConfig.rareFruitId = null;
  }
  return removed;
}

const removeRareFruitFromLevel = removeCollectibleFromLevel;

function generateLevel(levelNumber, options) {
  const opts = options || {};
  const level = Math.max(1, Math.floor(levelNumber || 1));
  const daily = Boolean(opts.daily);
  const themeId = normalizeThemeId(opts.themeId || 'fruit');
  const seed = opts.seed != null
    ? Number(opts.seed) >>> 0
    : hashString(`${themeId}:${daily ? 'daily' : 'level'}:${level}:${opts.variant || 0}`);
  const rng = new RNG(seed);
  const effectiveItemLevel = level + (daily ? 8 : 0);
  const unlocked = getUnlockedItems(effectiveItemLevel, themeId);
  const newlyUnlockedItem = daily ? null : getNewlyUnlockedItem(effectiveItemLevel, themeId);
  // 更早拉开可见品类差异：同时目标仍只有 2–3 个，但货架会出现更多未来目标物件，
  // 玩家必须看目标箱而不是从左到右乱点。保证解仍只走直接匹配路径。
  const typeCount = clamp(4 + Math.floor((level - 1) / 2), 4, Math.min(12, unlocked.length));
  const selectedItems = rng.shuffle(unlocked.slice()).slice(0, typeCount);
  if (newlyUnlockedItem && !selectedItems.some((item) => item.id === newlyUnlockedItem.id)) {
    selectedItems[selectedItems.length - 1] = newlyUnlockedItem;
  }
  const itemIds = selectedItems.map((item) => item.id);
  const collectedTargetItem = pickCollectedTargetItem(rng, themeId, level, daily, opts);
  const collectedTargetType = collectedTargetItem
    ? createCollectedTargetItemId(collectedTargetItem.collectibleId)
    : '';
  const newcomerBoxes = [2, 3, 4, 4, 6, 6, 7, 8, 8, 9];
  const newcomerStacks = [3, 3, 3, 4, 4, 4, 4, 5, 5, 5];
  const boxCount = daily
    ? 18
    : (level <= 10
      ? newcomerBoxes[level - 1]
      : (level < 15
        ? 8 + Math.floor((level - 11) / 2)
        : clamp(10 + Math.floor((level - 15) * 0.32), 10, 16)));
  const stackCount = daily
    ? 7
    : (level <= 10 ? newcomerStacks[level - 1] : clamp(5 + Math.floor((level - 10) / 7), 5, 7));
  const shelfShiftEnabled = daily || level >= 3;
  const activeOrderCount = getActiveOrderCount(level, daily);
  const reservedTargets = [];
  if (newlyUnlockedItem) reservedTargets.push(newlyUnlockedItem.id);
  if (collectedTargetType) reservedTargets.push(collectedTargetType);
  const reservedSet = new Set(reservedTargets);
  const regularPool = itemIds.filter((id) => !reservedSet.has(id));
  const orderQueue = createOrderQueue(rng, regularPool.length ? regularPool : itemIds, boxCount);
  const openingSlots = rng.shuffle(Array.from(
    { length: Math.min(activeOrderCount, orderQueue.length) },
    (_, index) => index
  ));
  reservedTargets.forEach((target, index) => {
    const slot = openingSlots[index] == null ? Math.min(index, orderQueue.length - 1) : openingSlots[index];
    if (slot >= 0) orderQueue[slot] = target;
  });
  const orderRules = createOrderRules(rng, boxCount, level, daily, opts);
  const solutionTypes = createValidSolution(rng, orderQueue, activeOrderCount);
  const forcedItemRuleId = opts.forceRuleId || getForcedItemRuleId(level);
  const ruleOptions = Object.assign({}, opts, {
    forceRuleId: opts.disableRules ? '' : forcedItemRuleId
  });
  const specialRules = applyItemRules(rng, solutionTypes, level, daily, ruleOptions);
  const distributed = distributeAcrossStacks(rng, solutionTypes, stackCount);
  const collectibleOptions = Object.assign({}, opts);
  if (!daily && level === 4 && !opts.disableCollectible && !opts.disableRare &&
      !opts.forceCollectibleId && !opts.forceRareId) {
    const firstCollectible = getThemeCollectibles(themeId)[0] || null;
    const collection = opts.collection || {};
    if (firstCollectible && (!collection[firstCollectible.id] || collection[firstCollectible.id].count <= 0)) {
      collectibleOptions.forceCollectibleId = firstCollectible.id;
    }
  }
  const collectible = insertCollectible(rng, distributed, solutionTypes, themeId, level, daily, collectibleOptions);
  const bombTraps = insertBombTraps(rng, distributed, orderQueue, level, daily, {
    disableRules: opts.disableRules,
    disableBombs: opts.disableBombs,
    forceRuleId: forcedItemRuleId,
    forceBomb: opts.forceBomb
  });

  return {
    id: daily ? `${themeId}-daily-${opts.dateKey || dayKey()}` : `${themeId}-level-${level}`,
    themeId,
    level,
    seed,
    daily,
    timeLimitMs: getTimeLimitMs(level, daily, boxCount, stackCount),
    targetPerBox: TARGET_PER_BOX,
    activeOrderCount,
    bufferCapacity: 0,
    maxBufferCapacity: 0,
    shelfShiftEnabled,
    stackCount,
    orderQueue,
    orderRules,
    stacks: distributed.stacks,
    specialRuleCount: specialRules.length + bombTraps.length,
    bombTrapCount: bombTraps.length,
    newItemId: newlyUnlockedItem && newlyUnlockedItem.id || null,
    promotedCollectibleTargetId: collectedTargetItem && collectedTargetItem.collectibleId || null,
    collectedTargetType: collectedTargetType || null,
    collectibleId: collectible && collectible.id || null,
    rareFruitId: collectible && collectible.id || null,
    _solutionTypes: solutionTypes,
    _solutionStacks: distributed.solutionStacks
  };
}

function getDailyLevel(date, options) {
  const opts = options || {};
  const key = dayKey(date);
  return generateLevel(24, {
    daily: true,
    themeId: opts.themeId || 'fruit',
    collection: opts.collection,
    pity: opts.pity,
    dateKey: key,
    seed: opts.seed == null ? hashString(`${opts.themeId || 'fruit'}:daily:${key}`) : opts.seed
  });
}

module.exports = {
  ACTIVE_ORDER_COUNT,
  TARGET_PER_BOX,
  applyItemRules,
  createOrderRules,
  getActiveOrderCount,
  getTimeLimitMs,
  generateLevel,
  getDailyLevel,
  insertBombTraps,
  insertCollectible,
  insertRareFruit,
  pickCollectedTargetItem,
  removeCollectibleFromLevel,
  removeRareFruitFromLevel
};
