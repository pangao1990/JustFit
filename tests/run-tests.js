'use strict';

const assert = require('assert');
const { GameApp } = require('../src/app');
const {
  NEW_ITEM_INTERVAL,
  createCollectedTargetItemId,
  getItemById,
  getNewlyUnlockedItem,
  getThemeItems,
  getUnlockedItems
} = require('../src/catalog');
const CONFIG = require('../src/config');
const {
  AD_COIN_DAILY_LIMIT,
  AD_COIN_REWARD,
  BOOSTER_VOUCHER_COSTS,
  PAUSE_TICKET_STORE_COST,
  REVIVE_COIN_COST,
  createAutoSellPlan,
  getCollectibleSellValue,
  getCollectionValue,
  isFeatureUnlocked
} = require('../src/economy');
const { FriendRankManager } = require('../src/friend-rank');
const { GameModel } = require('../src/game-model');
const { createSpecialToken } = require('../src/item-rules');
const { generateLevel, getTimeLimitMs, removeRareFruitFromLevel } = require('../src/level-generator');
const {
  MECHANIC_TUTORIALS,
  getCollectionTargetMechanic,
  getMechanicForLevel
} = require('../src/mechanics');
const { RARE_FRUIT_MAP, RARE_FRUITS, createRareToken, getFruitMastery } = require('../src/rare-fruits');
const { getVisibleBoosterActions, normalizeFontWeight } = require('../src/renderer');
const { getJourneyInfo, getPointRank, getTotalPoints } = require('../src/progression');
const { createQuery, createTitle, parseChallenge, parseFruitShopEntry } = require('../src/share');
const { Storage } = require('../src/storage');
const {
  COLLECTIBLES,
  COLLECTIBLE_MAP,
  countDiscoveredCollectibles,
  createCollectibleToken,
  getSilhouetteKey,
  getThemeCollectibles,
  getVisibleCollectionEntries,
  rollCollectible
} = require('../src/theme-collectibles');
const { THEMES, getVisibleThemes } = require('../src/themes');
const { RNG } = require('../src/utils');

const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

function solveGeneratedLevel(config) {
  const model = new GameModel(config);
  let guard = 0;
  while (model.status === 'playing' && guard < 4000) {
    guard += 1;
    const hint = model.getHint();
    if (hint < 0 && model.getInteractionFrozenMs() > 0) {
      model.tick(model.getInteractionFrozenMs(), {
        pauseLevelTimer: false,
        allowCollectibleStart: true
      });
      continue;
    }
    assert(hint >= 0, `第 ${guard} 步没有安全目标`);
    const result = model.selectStack(hint);
    assert.strictEqual(result.accepted, true, `第 ${guard} 步未被接受`);
    assert(result.matched || result.collectible, `第 ${guard} 步未命中目标`);
    assert.strictEqual(model.getBufferUsage(), 0, `第 ${guard} 步不应产生旧暂存数据`);
  }
  assert(guard < 4000, '提示求解超过安全步数');
  assert.strictEqual(model.status, 'won');
  assert.strictEqual(model.boxesCompleted, config.orderQueue.length);
  assert.strictEqual(model.getRemainingTileCount(), 0);
  return model;
}

function randomClickWinRate(level, runs) {
  let wins = 0;
  const total = runs || 200;
  for (let seed = 1; seed <= total; seed += 1) {
    const config = generateLevel(level, { seed: seed * 104729, disableCollectible: true });
    const model = new GameModel(config);
    const rng = new RNG(seed * 8191);
    let guard = 0;
    while (model.status === 'playing' && guard < 1000) {
      const available = [];
      model.stacks.forEach((stack, index) => { if (stack.length) available.push(index); });
      if (!available.length) break;
      model.selectStack(available[rng.int(0, available.length - 1)]);
      guard += 1;
    }
    if (model.status === 'won') wins += 1;
  }
  return wins / total;
}

test('1–300 关都存在生成器保证解', () => {
  for (let level = 1; level <= 300; level += 1) {
    const config = generateLevel(level);
    const model = solveGeneratedLevel(config);
    assert.strictEqual(model.getStars(), 3);
  }
});

test('第 500、1000、5000 关仍能稳定生成并按保证解通关', () => {
  [500, 1000, 5000].forEach((level) => {
    const config = generateLevel(level);
    const model = solveGeneratedLevel(config);
    assert.strictEqual(model.level, level);
    assert.strictEqual(config.orderQueue.length, 16);
    assert.strictEqual(config.stackCount, 7);
  });
});

test('每日挑战的多组种子都可完成', () => {
  for (let seed = 1; seed <= 40; seed += 1) {
    const config = generateLevel(24, { daily: true, seed: seed * 104729 });
    const model = solveGeneratedLevel(config);
    assert.strictEqual(model.daily, true);
    assert.strictEqual(config.timeLimitMs, 90000);
  }
});

test('同一关卡与种子生成结果完全一致', () => {
  const first = generateLevel(37, { seed: 987654321 });
  const second = generateLevel(37, { seed: 987654321 });
  assert.deepStrictEqual(first, second);
});

test('珍果图鉴包含 56 种且仅 8 种占用独立 PNG', () => {
  assert.strictEqual(RARE_FRUITS.length, 56);
  assert.strictEqual(new Set(RARE_FRUITS.map((fruit) => fruit.id)).size, 56);
  assert.strictEqual(RARE_FRUITS.filter((fruit) => fruit.asset).length, 8);
  assert(RARE_FRUITS.every((fruit, index) => index === 0 || fruit.minLevel >= RARE_FRUITS[index - 1].minLevel));
  assert.strictEqual(new Set(RARE_FRUITS.map((fruit) => fruit.firstPoints)).size, 56);
});

test('珍果品质积分严格递增，重复收藏可持续提升珍藏等级', () => {
  const byRarity = (rarity, key) => RARE_FRUITS.filter((fruit) => fruit.rarity === rarity).map((fruit) => fruit[key]);
  const rarities = ['rare', 'epic', 'legendary', 'mythic'];
  ['firstPoints', 'duplicatePoints'].forEach((key) => {
    for (let i = 0; i < rarities.length - 1; i += 1) {
      assert(Math.max(...byRarity(rarities[i], key)) < Math.min(...byRarity(rarities[i + 1], key)));
    }
  });
  assert.strictEqual(getFruitMastery(1).name, '初次点亮');
  assert.strictEqual(getFruitMastery(3).name, '青铜珍藏');
  assert.strictEqual(getFruitMastery(30).name, '星冠珍藏');
});

test('十个主题共 272 个收藏目标，除首批珍果外均为低包体程序化素材', () => {
  assert.strictEqual(THEMES.length, 10);
  assert.strictEqual(COLLECTIBLES.length, 272);
  assert.deepStrictEqual(THEMES.map((theme) => getThemeCollectibles(theme.id).length), [56, 24, 24, 24, 24, 24, 24, 24, 24, 24]);
  assert.strictEqual(COLLECTIBLES.filter((collectible) => collectible.asset).length, 8);
  assert.strictEqual(new Set(COLLECTIBLES.map((collectible) => collectible.id)).size, COLLECTIBLES.length);
});

test('每个主题的普通目标不会串入其他主题物件', () => {
  THEMES.forEach((theme) => {
    const allowed = new Set(getThemeItems(theme.id).map((item) => item.id));
    [1, 20, 80].forEach((level) => {
      const config = generateLevel(level, { themeId: theme.id, disableCollectible: true });
      assert(config.orderQueue.every((id) => allowed.has(id)), `${theme.name}出现跨主题商品`);
      assert.strictEqual(config.themeId, theme.id);
    });
  });
});

test('十个主题各有 24 种普通物件，并且每 4 关必定解锁一种新物件', () => {
  assert.strictEqual(NEW_ITEM_INTERVAL, 4);
  THEMES.forEach((theme) => {
    const items = getThemeItems(theme.id);
    assert.strictEqual(items.length, 24, `${theme.name}普通物件数量不足`);
    assert(items.every((item) => item.themeId === theme.id));
    assert.strictEqual(new Set(items.map((item) => item.id)).size, items.length);
    assert.strictEqual(getUnlockedItems(1, theme.id).length, 4);
    assert.strictEqual(getUnlockedItems(4, theme.id).length, 4);
    assert.strictEqual(getUnlockedItems(5, theme.id).length, 5);
    assert.strictEqual(getUnlockedItems(81, theme.id).length, 24);

    for (let level = 5; level <= 81; level += NEW_ITEM_INTERVAL) {
      const newlyUnlocked = getNewlyUnlockedItem(level, theme.id);
      assert(newlyUnlocked, `${theme.name}第 ${level} 关缺少新物件`);
      const config = generateLevel(level, {
        themeId: theme.id,
        disableCollectible: true,
        disableCollectedTargets: true
      });
      assert(config.orderQueue.includes(newlyUnlocked.id), `${newlyUnlocked.name}未进入当关目标箱`);
      assert.strictEqual(config.newItemId, newlyUnlocked.id);
    }
  });
});

test('已点亮闪耀藏品会回归后续目标箱，并保持同主题与保证解', () => {
  const collectible = getThemeCollectibles('fruit')[0];
  const collection = {
    [collectible.id]: { count: 1, owned: 0, themeId: 'fruit' }
  };
  const targetType = createCollectedTargetItemId(collectible.id);
  const config = generateLevel(9, {
    themeId: 'fruit',
    seed: 99173,
    collection,
    forceCollectedTargetId: collectible.id,
    disableCollectible: true
  });
  assert.strictEqual(config.promotedCollectibleTargetId, collectible.id);
  assert.strictEqual(config.collectedTargetType, targetType);
  assert.strictEqual(config.orderQueue.filter((type) => type === targetType).length, 1);
  assert.strictEqual(config._solutionTypes.filter((type) => type === targetType).length, 3);
  assert(config._solutionTypes.every((type) => type.indexOf(`special:frozen:${targetType}`) < 0));
  const targetItem = getItemById(targetType);
  assert.strictEqual(targetItem.collectibleId, collectible.id);
  assert.strictEqual(targetItem.themeId, 'fruit');
  assert(targetItem.coinValue >= 2);
  solveGeneratedLevel(config);

  const vegetable = generateLevel(15, {
    themeId: 'vegetable',
    collection,
    forceCollectedTargetId: collectible.id,
    disableCollectible: true
  });
  assert.strictEqual(vegetable.promotedCollectibleTargetId, null, '水果藏品不应混入菜园目标');
});

test('闪耀目标保持随机感且主线每 5 关有一次回归保底', () => {
  const collectible = getThemeCollectibles('fruit')[0];
  const collection = { [collectible.id]: { count: 1, themeId: 'fruit' } };
  [5, 10, 15, 20].forEach((level) => {
    const config = generateLevel(level, {
      themeId: 'fruit',
      collection,
      disableCollectible: true,
      collectedTargetChance: 0
    });
    assert.strictEqual(config.promotedCollectibleTargetId, collectible.id, `第 ${level} 关回归保底失效`);
  });
  const disabled = generateLevel(10, {
    themeId: 'fruit',
    collection,
    disableCollectible: true,
    disableCollectedTargets: true
  });
  assert.strictEqual(disabled.promotedCollectibleTargetId, null);
});

test('十个主题的高关都保留生成器保证解', () => {
  THEMES.forEach((theme) => {
    [1, 10, 31, 80, 160].forEach((level) => {
      const config = generateLevel(level, { themeId: theme.id, disableCollectible: true });
      const model = solveGeneratedLevel(config);
      assert.strictEqual(model.themeId, theme.id);
    });
  });
});

test('图鉴只揭示最近 4 个待收藏轮廓，远期内容保持封存', () => {
  const empty = getVisibleCollectionEntries('fruit', {}, 1, 4);
  assert.strictEqual(empty.filter((entry) => entry.status === 'revealed').length, 4);
  assert(empty.slice(4).every((entry) => entry.status === 'sealed'));

  const collection = { starlight_strawberry: { count: 1 } };
  const progressed = getVisibleCollectionEntries('fruit', collection, 38, 4);
  assert.strictEqual(progressed.find((entry) => entry.collectible.id === 'starlight_strawberry').status, 'discovered');
  assert.strictEqual(progressed.filter((entry) => entry.status === 'revealed').length, 4);
  assert(progressed.some((entry) => entry.status === 'sealed'));
});

test('所有收藏轮廓签名唯一，基础果形相同也不会再出现完全重复轮廓', () => {
  const keys = COLLECTIBLES.map(getSilhouetteKey);
  assert(keys.every(Boolean));
  assert.strictEqual(new Set(keys).size, COLLECTIBLES.length);
});

test('未收藏优先与连续未掉落保底会指向仍缺少的近期开锁藏品', () => {
  const eligible = getThemeCollectibles('toy').filter((collectible) => collectible.minLevel <= 20);
  const missing = eligible[eligible.length - 1];
  const collection = {};
  eligible.slice(0, -1).forEach((collectible) => { collection[collectible.id] = { count: 1 }; });
  const picked = rollCollectible(new RNG(99173), 'toy', 20, false, { collection, pity: 5 });
  assert.strictEqual(picked.id, missing.id);
});

test('目标数在第 1、2、15 关分三步增加，每日挑战直接使用 3 个目标', () => {
  assert.strictEqual(generateLevel(1).activeOrderCount, 1);
  [2, 3, 10, 14].forEach((level) => assert.strictEqual(generateLevel(level).activeOrderCount, 2));
  [15, 31, 99].forEach((level) => assert.strictEqual(generateLevel(level).activeOrderCount, 3));
  assert.strictEqual(generateLevel(24, { daily: true }).activeOrderCount, 3);
  assert.strictEqual(new GameModel(generateLevel(1)).activeOrders.length, 1);
  assert.strictEqual(new GameModel(generateLevel(15)).activeOrders.length, 3);
});

test('渐进教学节点唯一，并只在对应关卡首次展示', () => {
  assert.strictEqual(new Set(MECHANIC_TUTORIALS.map((entry) => entry.id)).size, MECHANIC_TUTORIALS.length);
  assert.strictEqual(new Set(MECHANIC_TUTORIALS.map((entry) => entry.unlockLevel)).size, MECHANIC_TUTORIALS.length);
  MECHANIC_TUTORIALS.forEach((entry) => {
    assert.strictEqual(getMechanicForLevel(entry.unlockLevel, {}, {}).id, entry.id);
    assert.strictEqual(getMechanicForLevel(entry.unlockLevel, { [entry.id]: Date.now() }, {}), null);
  });
  assert.strictEqual(getMechanicForLevel(7, {}, { daily: true }), null);
  assert.strictEqual(getMechanicForLevel(7, {}, { challenge: true }), null);
  const collectible = getThemeCollectibles('fruit')[0];
  const collectionTarget = getCollectionTargetMechanic(5, {}, collectible);
  assert.strictEqual(collectionTarget.id, 'collection_target');
  assert(collectionTarget.title.includes(collectible.name));
  assert.strictEqual(getCollectionTargetMechanic(5, { collection_target: Date.now() }, collectible), null);
});

test('关内道具按第 1/5/8/10 关逐步出现，每日挑战直接开放全部道具', () => {
  assert.deepStrictEqual(getVisibleBoosterActions(1, false), ['hint']);
  assert.deepStrictEqual(getVisibleBoosterActions(5, false), ['hint', 'shuffle']);
  assert.deepStrictEqual(getVisibleBoosterActions(8, false), ['hint', 'shuffle', 'add_time']);
  assert.deepStrictEqual(getVisibleBoosterActions(10, false), ['hint', 'shuffle', 'add_time', 'auto_pack']);
  assert.deepStrictEqual(getVisibleBoosterActions(1, true), ['hint', 'shuffle', 'add_time', 'auto_pack']);
});

test('机制首次出现与实际关卡配置一致，不会只弹教学却没有内容', () => {
  assert.strictEqual(generateLevel(1).shelfShiftEnabled, false);
  assert.strictEqual(generateLevel(2).shelfShiftEnabled, false);
  assert.strictEqual(generateLevel(3).shelfShiftEnabled, true);
  assert.strictEqual(generateLevel(4, { collection: {} }).collectibleId, getThemeCollectibles('fruit')[0].id);
  assert.strictEqual(new GameModel(generateLevel(4)).getMistakeThreshold(), 0);
  assert(generateLevel(6, { disableCollectible: true })._solutionTypes.some((token) => token.indexOf('special:frozen:') === 0));
  assert(generateLevel(8, { disableCollectible: true })._solutionTypes.some((token) => token.indexOf('special:drain:') === 0));
  assert(generateLevel(10, { disableCollectible: true })._solutionTypes.some((token) => token.indexOf('special:time_bonus:') === 0));
  assert(generateLevel(12, { disableCollectible: true })._solutionTypes.some((token) => token.indexOf('special:sweep:') === 0));
  assert(generateLevel(18, { disableCollectible: true }).stacks.some((stack) => (
    stack.some((token) => token.indexOf('special:bomb:') === 0)
  )));
  const level22 = generateLevel(22, { disableCollectible: true });
  assert(level22.orderRules.slice(0, level22.activeOrderCount).some((rule) => rule && rule.type === 'rush'));
  [1, 4, 24, 99].forEach((level) => assert.strictEqual(generateLevel(level).bufferCapacity, 0));
});

test('Canvas 字重统一为真机可解析的标准 100 档', () => {
  assert.deepStrictEqual(
    [550, 650, 720, 750, 850, 950].map(normalizeFontWeight),
    [600, 700, 700, 800, 900, 900]
  );
  assert.strictEqual(normalizeFontWeight(), 600);
  assert.strictEqual(normalizeFontWeight(50), 100);
  assert.strictEqual(normalizeFontWeight(1200), 900);
});

test('收藏品只在达到等级后出现，每 10 关与连续未掉落保底', () => {
  for (let level = 1; level <= 3; level += 1) {
    assert.strictEqual(generateLevel(level).rareFruitId, null);
  }
  for (let level = 10; level <= 180; level += 10) {
    assert(generateLevel(level).rareFruitId, `第 ${level} 关应触发收藏品里程碑保底`);
  }
  assert(generateLevel(6, { pity: 5 }).rareFruitId, '连续 5 个关卡未掉落后应保底');
  for (let level = 4; level <= 180; level += 1) {
    const config = generateLevel(level);
    if (!config.rareFruitId) continue;
    const fruit = RARE_FRUIT_MAP[config.rareFruitId];
    assert(fruit, `未知稀有水果 ${config.rareFruitId}`);
    assert(level >= fruit.minLevel, `${fruit.name} 不应在第 ${level} 关出现`);
  }
});

test('稀有水果嵌入保证解并可直接收藏', () => {
  const config = generateLevel(20, { seed: 998877, forceRareId: 'flame_dragonfruit' });
  assert(config._solutionTypes.includes(createRareToken('flame_dragonfruit')));
  const model = new GameModel(config);
  let rareResult = null;
  let guard = 0;
  while (!rareResult && model.status === 'playing' && guard < 1000) {
    guard += 1;
    const hint = model.getHint();
    if (hint < 0 && model.getInteractionFrozenMs() > 0) {
      model.tick(model.getInteractionFrozenMs(), { pauseLevelTimer: false, allowCollectibleStart: true });
      continue;
    }
    assert(hint >= 0);
    const result = model.selectStack(hint);
    if (result.collectible) rareResult = result;
  }
  assert(rareResult);
  assert.strictEqual(rareResult.rareFruit.id, 'flame_dragonfruit');
  assert.strictEqual(model.buffer.length, 0);
  assert.deepStrictEqual(model.rareCollected, ['flame_dragonfruit']);
});

test('领取后的同一关重开不会重复刷稀有水果', () => {
  const config = generateLevel(8, { seed: 7654, forceRareId: 'moon_grapes' });
  assert.strictEqual(removeRareFruitFromLevel(config, 'moon_grapes'), true);
  assert.strictEqual(config.rareFruitId, null);
  assert.strictEqual(config._solutionTypes.includes(createRareToken('moon_grapes')), false);
  assert.strictEqual(config.stacks.some((stack) => stack.includes(createRareToken('moon_grapes'))), false);
});

test('难度参数按关卡上升并保持上限', () => {
  const level1 = generateLevel(1);
  const level20 = generateLevel(20);
  const level99 = generateLevel(99);
  assert.strictEqual(level1.orderQueue.length, 2);
  assert(level20.orderQueue.length > level1.orderQueue.length);
  assert.strictEqual(level99.orderQueue.length, 16);
  assert(level20.stackCount >= level1.stackCount);
  assert.strictEqual(level99.stackCount, 7);
  assert.strictEqual(level99.bufferCapacity, 0);
  assert(level1.timeLimitMs > 0);
  assert(level99.timeLimitMs > level1.timeLimitMs);
  assert(level99.timeLimitMs <= 118000);
});

test('所有关卡都有合理倒计时，加时与超时失败规则生效', () => {
  [1, 2, 10, 60, 5000].forEach((level) => {
    const config = generateLevel(level);
    assert(config.timeLimitMs >= 48000 && config.timeLimitMs <= 118000);
    assert.strictEqual(config.timeLimitMs, getTimeLimitMs(level, false, config.orderQueue.length, config.stackCount));
  });
  const model = new GameModel({
    themeId: 'fruit', level: 3, seed: 9, daily: false, activeOrderCount: 1,
    targetPerBox: 3, bufferCapacity: 1, timeLimitMs: 1000,
    orderQueue: ['apple'], stacks: [['apple']]
  });
  model.tick(999, { pauseLevelTimer: false, allowCollectibleStart: true });
  assert.strictEqual(model.status, 'playing');
  assert.strictEqual(model.remainingMs, 1);
  assert.strictEqual(model.addTime(15000), true);
  assert.strictEqual(model.remainingMs, 15001);
  model.tick(15001, { pauseLevelTimer: false, allowCollectibleStart: true });
  assert.strictEqual(model.status, 'failed');
  assert.strictEqual(model.getResult().failureReason, 'timeout');
  assert.strictEqual(model.revive(), true);
  assert.strictEqual(model.remainingMs, 15000);
});

test('第 1 关三步光圈引导暂停关卡计时，完成教学后恢复计时', () => {
  const tickOptions = [];
  const app = Object.create(GameApp.prototype);
  Object.assign(app, {
    running: true,
    hidden: false,
    lastFrameAt: Date.now(),
    view: {
      screen: 'game', overlay: null, helpOpen: false, tutorialStep: 1,
      rewardAvailable: false, activeRareTimerId: ''
    },
    model: {
      status: 'playing',
      tick(deltaMs, options) { tickOptions.push(options); return null; },
      getActiveCollectibleTimer() { return null; }
    },
    renderer: { update() {}, draw() {} },
    storage: { data: {} },
    ads: { canReward() { return false; } },
    platform: { requestAnimationFrame() { return 0; } }
  });

  app._loop();
  assert.strictEqual(tickOptions[0].pauseLevelTimer, true);
  assert.strictEqual(tickOptions[0].allowCollectibleStart, false);

  app.view.tutorialStep = 0;
  app.lastFrameAt = Date.now();
  app._loop();
  assert.strictEqual(tickOptions[1].pauseLevelTimer, false);
  assert.strictEqual(tickOptions[1].allowCollectibleStart, true);
});

test('闪耀藏品到顶层才启动 6 秒，暂停只停关卡时间而不停藏品时间', () => {
  const collectible = getThemeCollectibles('fruit')[0];
  const model = new GameModel({
    themeId: 'fruit', level: 4, seed: 10, daily: false, activeOrderCount: 1,
    targetPerBox: 3, bufferCapacity: 1, timeLimitMs: 30000,
    orderQueue: ['apple'], stacks: [[createCollectibleToken(collectible.id)], ['apple']]
  });
  assert.strictEqual(model.getActiveCollectibleTimer(), null, '教学层未关闭前不应提前计时');
  const first = model.tick(1000, { pauseLevelTimer: true, allowCollectibleStart: true });
  assert.strictEqual(first.collectibleAppeared, true);
  assert.strictEqual(model.remainingMs, 30000);
  assert.strictEqual(model.getActiveCollectibleTimer().remainingMs, 5000);
  const expired = model.tick(5000, { pauseLevelTimer: true, allowCollectibleStart: false });
  assert.strictEqual(expired.collectibleExpired.id, collectible.id);
  assert.strictEqual(model.remainingMs, 30000);
  assert.strictEqual(model.stacks.some((stack) => stack.includes(createCollectibleToken(collectible.id))), false);
});

test('正确物件按品类产生不同积分和金币，错拿不产出', () => {
  const model = new GameModel({
    themeId: 'fruit', level: 8, seed: 19, daily: false, activeOrderCount: 2,
    targetPerBox: 3, bufferCapacity: 3, timeLimitMs: 60000,
    orderQueue: ['apple', 'pineapple'], stacks: [['apple'], ['pineapple'], ['bread']]
  });
  const apple = model.selectStack(0);
  const pineapple = model.selectStack(1);
  const wrong = model.selectStack(2);
  assert(apple.pointsGained > 0 && apple.coinsGained > 0);
  assert(pineapple.pointsGained > apple.pointsGained);
  assert(pineapple.coinsGained > apple.coinsGained);
  assert.strictEqual(wrong.pointsGained, 0);
  assert.strictEqual(wrong.coinsGained, 0);
});

test('收藏进度永久保留，购买暂停补给只扣当前金币', () => {
  let persisted = null;
  const storage = new Storage({
    getStorageSync() { return persisted; },
    setStorageSync(key, value) { persisted = JSON.parse(JSON.stringify(value)); }
  });
  const credited = storage.creditMatchedItem(50, 5);
  assert.strictEqual(credited.points, 50);
  assert.strictEqual(getTotalPoints(storage.data), 50);
  const coinsBefore = storage.data.coins;
  const bought = storage.buyPauseTickets(1);
  assert.strictEqual(bought.bought, true);
  assert.strictEqual(storage.data.coins, coinsBefore - PAUSE_TICKET_STORE_COST);
  assert.strictEqual(Object.prototype.hasOwnProperty.call(storage.data, 'lifetimeCoins'), false);
  assert.strictEqual(getTotalPoints(storage.data), 50);
});

test('今日挑战每天首胜额外获得 60 金币，重复通关不重复领取', () => {
  const storage = new Storage({ getStorageSync() { return null; }, setStorageSync() {} });
  const before = storage.data.coins;
  const first = storage.recordResult({
    level: 24, themeId: 'fruit', daily: true, status: 'won', stars: 3,
    score: 2200, boxesCompleted: 10, packingCoinsEarned: 18
  });
  assert.strictEqual(first.dailyBonusCoins, 60);
  assert.strictEqual(first.earnedCoins, 78);
  assert.strictEqual(storage.data.coins, before + 60);
  const replay = storage.recordResult({
    level: 24, themeId: 'fruit', daily: true, status: 'won', stars: 3,
    score: 2400, boxesCompleted: 10, packingCoinsEarned: 20
  });
  assert.strictEqual(replay.dailyBonusCoins, 0);
  assert.strictEqual(storage.data.coins, before + 60);
});

test('藏品出售只减少持有量，永久图鉴与累计积分不会倒退', () => {
  const storage = new Storage({ getStorageSync() { return null; }, setStorageSync() {} });
  const collectible = getThemeCollectibles('fruit')[0];
  storage.collectCollectible(collectible.id, collectible.minLevel);
  storage.collectCollectible(collectible.id, collectible.minLevel + 1);
  const value = getCollectibleSellValue(collectible);
  const pointsBefore = getTotalPoints(storage.data);
  const coinsBefore = storage.data.coins;
  assert.strictEqual(storage.data.rareFruits[collectible.id].owned, 2);
  assert.strictEqual(getCollectionValue(storage.data.rareFruits), value * 2);
  const firstSale = storage.sellCollectible(collectible.id, 1);
  assert.strictEqual(firstSale.sold, true);
  assert.strictEqual(firstSale.coins, value);
  assert.strictEqual(storage.data.rareFruits[collectible.id].owned, 1);
  assert.strictEqual(storage.data.rareFruits[collectible.id].count, 2);
  assert.strictEqual(storage.data.coins, coinsBefore + value);
  assert.strictEqual(getTotalPoints(storage.data), pointsBefore);
  storage.sellCollectible(collectible.id, 1);
  assert.strictEqual(storage.data.rareFruits[collectible.id].owned, 0);
  assert.strictEqual(countDiscoveredCollectibles(storage.data.rareFruits, 'fruit'), 1);
});

test('智能兑换优先使用重复藏品，道具券可提前购买并在关卡内消耗', () => {
  const storage = new Storage({ getStorageSync() { return null; }, setStorageSync() {} });
  const first = getThemeCollectibles('fruit')[0];
  const second = getThemeCollectibles('fruit')[1];
  storage.collectCollectible(first.id, first.minLevel);
  storage.collectCollectible(first.id, first.minLevel + 1);
  storage.collectCollectible(second.id, second.minLevel);
  const plan = createAutoSellPlan(storage.data.rareFruits, getCollectibleSellValue(first));
  assert(plan);
  assert.strictEqual(plan.entries[0].id, first.id);
  assert.strictEqual(plan.entries[0].count, 1);
  storage.addCoins(BOOSTER_VOUCHER_COSTS.hint);
  const bought = storage.buyBoosterVoucher('hint');
  assert.strictEqual(bought.bought, true);
  assert.strictEqual(storage.getBoosterVoucherCount('hint'), 1);
  assert.strictEqual(storage.consumeBoosterVoucher('hint'), true);
  assert.strictEqual(storage.getBoosterVoucherCount('hint'), 0);
  assert.strictEqual(REVIVE_COIN_COST, 180);
});

test('补给商店支持批量购买并严格校验金币与持有上限', () => {
  const storage = new Storage({ getStorageSync() { return null; }, setStorageSync() {} });
  storage.addCoins(2000);
  const coinsBefore = storage.data.coins;
  const pauses = storage.buyStoreProduct('pause_ticket', 3);
  assert.strictEqual(pauses.bought, true);
  assert.strictEqual(pauses.quantity, 3);
  assert.strictEqual(storage.getPauseTicketCount(), 5);
  assert.strictEqual(storage.data.coins, coinsBefore - PAUSE_TICKET_STORE_COST * 3);

  const hints = storage.buyStoreProduct('voucher_hint', 4);
  assert.strictEqual(hints.bought, true);
  assert.strictEqual(hints.quantity, 4);
  assert.strictEqual(storage.getBoosterVoucherCount('hint'), 4);
  assert.strictEqual(hints.cost, BOOSTER_VOUCHER_COSTS.hint * 4);

  storage.data.coins = 0;
  const insufficient = storage.buyStoreProduct('voucher_shuffle', 2);
  assert.strictEqual(insufficient.bought, false);
  assert.strictEqual(insufficient.reason, 'coins');
});

test('每关首次暂停免费，后续暂停会消耗暂停券', () => {
  const storage = new Storage({ getStorageSync() { return null; }, setStorageSync() {} });
  const app = Object.create(GameApp.prototype);
  const toasts = [];
  Object.assign(app, {
    model: { status: 'playing', level: 9 },
    storage,
    view: { overlay: null, freePausesRemaining: 1 },
    renderer: { showToast(message) { toasts.push(message); } },
    analytics: { report() {} }
  });
  const ticketsBefore = storage.getPauseTicketCount();
  assert.strictEqual(app._pauseLevel(), true);
  assert.strictEqual(app.view.freePausesRemaining, 0);
  assert.strictEqual(storage.getPauseTicketCount(), ticketsBefore);
  app.view.overlay = null;
  assert.strictEqual(app._pauseLevel(), true);
  assert.strictEqual(storage.getPauseTicketCount(), ticketsBefore - 1);
  storage.data.pauseTickets = 0;
  app.view.overlay = null;
  assert.strictEqual(app._pauseLevel(), false);
  assert(toasts.some((message) => message.includes('暂停次数已用完')));
});

test('广告金币每天最多领取 3 次，跨日自动重置次数', () => {
  const storage = new Storage({ getStorageSync() { return null; }, setStorageSync() {} });
  const firstDay = new Date(2026, 6, 26, 12, 0, 0);
  const nextDay = new Date(2026, 6, 27, 12, 0, 0);
  const coinsBefore = storage.data.coins;
  for (let index = 0; index < AD_COIN_DAILY_LIMIT; index += 1) {
    const result = storage.claimAdCoinReward(firstDay);
    assert.strictEqual(result.claimed, true);
  }
  assert.strictEqual(storage.data.coins, coinsBefore + AD_COIN_REWARD * AD_COIN_DAILY_LIMIT);
  assert.strictEqual(storage.claimAdCoinReward(firstDay).claimed, false);
  assert.strictEqual(storage.getAdCoinStatus(firstDay).remaining, 0);
  assert.strictEqual(storage.getAdCoinStatus(nextDay).remaining, AD_COIN_DAILY_LIMIT);
  assert.strictEqual(storage.claimAdCoinReward(nextDay).claimed, true);
  assert.strictEqual(storage.getAdCoinStatus(nextDay).viewed, 1);
});

test('首页长期功能按关卡逐步解锁，首局不会同时暴露藏馆和商店', () => {
  const data = { highestLevelByTheme: { fruit: 1 } };
  assert.strictEqual(isFeatureUnlocked(data, 'daily'), false);
  assert.strictEqual(isFeatureUnlocked(data, 'museum'), false);
  assert.strictEqual(isFeatureUnlocked(data, 'store'), false);
  data.highestLevelByTheme.fruit = 5;
  assert.strictEqual(isFeatureUnlocked(data, 'daily'), true);
  assert.strictEqual(isFeatureUnlocked(data, 'museum'), true);
  assert.strictEqual(isFeatureUnlocked(data, 'friendRank'), true);
  assert.strictEqual(isFeatureUnlocked(data, 'store'), false);
  data.highestLevelByTheme.fruit = 8;
  assert.strictEqual(isFeatureUnlocked(data, 'store'), true);
});

test('藏馆只展示已开启主题和紧随其后的一个锁定主题', () => {
  assert.deepStrictEqual(getVisibleThemes(['fruit']).map((theme) => theme.id), ['fruit', 'vegetable']);
  assert.deepStrictEqual(
    getVisibleThemes(['fruit', 'vegetable', 'animal']).map((theme) => theme.id),
    ['fruit', 'vegetable', 'animal', 'toy']
  );
  assert.strictEqual(getVisibleThemes(THEMES.map((theme) => theme.id)).length, 10);
});

test('好友榜只写入当前金币与藏品数，消费后排名数值同步下降', () => {
  let written = null;
  const manager = new FriendRankManager({
    getOpenDataContext() { return null; },
    setUserCloudStorage(list) { written = list; return Promise.resolve(true); }
  });
  manager.sync({
    coins: 276,
    rareFruits: { starlight_strawberry: { count: 2 } }
  });
  assert.deepStrictEqual(written, [
    { key: 'coins', value: '276' },
    { key: 'collection_count', value: '1' }
  ]);
});

test('好友榜遇到只读开放数据画布时仍会发送展示消息', () => {
  const messages = [];
  const canvas = {};
  Object.defineProperty(canvas, 'width', {
    get() { return 300; },
    set() { throw new TypeError('readonly'); }
  });
  Object.defineProperty(canvas, 'height', {
    get() { return 150; },
    set() { throw new TypeError('readonly'); }
  });
  const manager = new FriendRankManager({
    getOpenDataContext() {
      return {
        canvas,
        postMessage(message) { messages.push(message); }
      };
    }
  });
  assert.strictEqual(manager.show('collection_count', 654, 820), canvas);
  assert.strictEqual(manager.scroll(96), true);
  assert.deepStrictEqual(messages, [
    { type: 'show_rank', metric: 'collection_count', width: 654, height: 820 },
    { type: 'rank_scroll', delta: 96 }
  ]);
});

test('藏馆连续翻页会在主题边界自然切换，反向滑动回到上一主题末页', () => {
  const app = {
    view: { collectionThemeId: 'fruit', fruitShopPage: Math.ceil(getThemeCollectibles('fruit').length / 6) - 1, fruitShopShareImage: '' },
    storage: { data: { unlockedThemes: ['fruit'], activeThemeId: 'fruit' } },
    renderer: { showToast() {} },
    _refreshFruitShopShareImage() { return Promise.resolve(''); }
  };
  GameApp.prototype._changeFruitShopPage.call(app, 1);
  assert.strictEqual(app.view.collectionThemeId, 'vegetable');
  assert.strictEqual(app.view.fruitShopPage, 0);
  GameApp.prototype._changeFruitShopPage.call(app, -1);
  assert.strictEqual(app.view.collectionThemeId, 'fruit');
  assert.strictEqual(app.view.fruitShopPage, Math.ceil(getThemeCollectibles('fruit').length / 6) - 1);
});

test('普通物件点错立即失败，物件保留且每局只允许复活一次', () => {
  const model = new GameModel({
    level: 8,
    seed: 12,
    daily: false,
    activeOrderCount: 1,
    targetPerBox: 3,
    timeLimitMs: 60000,
    orderQueue: ['apple'],
    stacks: [['bread'], ['apple'], ['apple'], ['apple']]
  });
  const wrong = model.selectStack(0);
  assert.strictEqual(wrong.accepted, true);
  assert.strictEqual(wrong.matched, false);
  assert.strictEqual(wrong.failureReason, 'wrong');
  assert.strictEqual(model.status, 'failed');
  assert.strictEqual(model.stacks[0][0], 'bread', '点错物件必须留在原位，复活后仍可重新判断');
  assert.strictEqual(model.getBufferUsage(), 0);
  assert.strictEqual(model.revive(), true);
  assert.strictEqual(model.status, 'playing');
  model.status = 'failed';
  assert.strictEqual(model.revive(), false);
});

test('无脑乱点无法稳定通关，难度会在前几关迅速建立', () => {
  assert(randomClickWinRate(1, 300) < 0.5);
  assert(randomClickWinRate(2, 300) < 0.5);
  assert(randomClickWinRate(5, 300) < 0.05);
  assert(randomClickWinRate(10, 300) < 0.01);
});

test('冻、耗、+、清四种目标物件规则按说明生效', () => {
  const frozen = new GameModel({
    themeId: 'fruit', level: 6, seed: 1, daily: false, activeOrderCount: 1,
    targetPerBox: 3, timeLimitMs: 30000,
    orderQueue: ['apple'], stacks: [[createSpecialToken('apple', 'frozen')], ['apple']]
  });
  const frozenResult = frozen.selectStack(0);
  assert.strictEqual(frozenResult.matched, true);
  assert.strictEqual(frozenResult.frozenMs, 1500);
  assert.strictEqual(frozen.selectStack(1).reason, 'frozen');
  const thawed = frozen.tick(1500, { pauseLevelTimer: false, allowCollectibleStart: true });
  assert.strictEqual(thawed.frozenEnded, true);
  assert.strictEqual(frozen.getInteractionFrozenMs(), 0);

  const drain = new GameModel({
    themeId: 'fruit', level: 8, seed: 2, daily: false, activeOrderCount: 1,
    targetPerBox: 3, timeLimitMs: 10000,
    orderQueue: ['apple'], stacks: [[createSpecialToken('apple', 'drain')]]
  });
  const drainResult = drain.selectStack(0);
  assert.strictEqual(drainResult.timeDeltaMs, -3000);
  assert.strictEqual(drain.remainingMs, 7000);

  const bonus = new GameModel({
    themeId: 'fruit', level: 10, seed: 3, daily: false, activeOrderCount: 1,
    targetPerBox: 3, timeLimitMs: 10000,
    orderQueue: ['apple'], stacks: [[createSpecialToken('apple', 'time_bonus')]]
  });
  const bonusResult = bonus.selectStack(0);
  assert.strictEqual(bonusResult.timeDeltaMs, 3000);
  assert.strictEqual(bonus.remainingMs, 13000);

  const sweep = new GameModel({
    themeId: 'fruit', level: 12, seed: 4, daily: false, activeOrderCount: 1,
    targetPerBox: 3, timeLimitMs: 30000,
    orderQueue: ['apple'],
    stacks: [[createSpecialToken('apple', 'sweep')], ['apple'], ['apple']]
  });
  const sweepResult = sweep.selectStack(0);
  assert.strictEqual(sweepResult.clearedCount, 2);
  assert.strictEqual(sweepResult.completed.length, 1);
  assert.strictEqual(sweep.status, 'won');
  assert.strictEqual(sweep.getRemainingTileCount(), 0);
});

test('炸弹点击后立即失败并移除，复活后不会再次触发', () => {
  const model = new GameModel({
    themeId: 'fruit', level: 18, seed: 5, daily: false, activeOrderCount: 1,
    targetPerBox: 3, timeLimitMs: 30000,
    orderQueue: ['apple'],
    stacks: [[createSpecialToken('apple', 'bomb')], ['apple'], ['apple'], ['apple']]
  });
  const result = model.selectStack(0);
  assert.strictEqual(result.bomb, true);
  assert.strictEqual(result.failureReason, 'bomb');
  assert.strictEqual(model.status, 'failed');
  assert.strictEqual(model.stacks[0].length, 0);
  assert.strictEqual(model.revive(), true);
  assert.strictEqual(solveGeneratedLevel(Object.assign({}, model.config, {
    stacks: model.stacks.map((stack) => stack.slice())
  })).status, 'won');
});

test('限步目标奖励与完成目标后的货架换位生效', () => {
  const model = new GameModel({
    level: 22,
    seed: 4,
    daily: false,
    activeOrderCount: 2,
    targetPerBox: 3,
    timeLimitMs: 60000,
    orderQueue: ['apple', 'milk'],
    orderRules: [{ type: 'rush', moves: 6, bonus: 100 }, null],
    stacks: [['apple'], ['apple'], ['apple'], ['milk'], ['bread']]
  });
  model.selectStack(0);
  model.selectStack(1);
  const before = model.stacks.map((stack) => stack.slice());
  const result = model.selectStack(2);
  assert.strictEqual(result.completed.length, 1);
  assert.strictEqual(result.priorityBonus, 124);
  assert.strictEqual(model.priorityOrdersCompleted, 1);
  assert.strictEqual(result.shelfShift, 1);
  assert.strictEqual(model.shelfShiftCount, 1);
  assert.notDeepStrictEqual(model.stacks, before);
});

test('自动收集只选择当前目标物件', () => {
  const config = generateLevel(4, { seed: 24680 });
  const model = new GameModel(config);
  const before = model.getRemainingTileCount();
  const results = model.autoPack();
  assert(results.length >= 1);
  assert(results.length <= 4);
  assert(results.every((result) => result.matched));
  assert.strictEqual(model.getRemainingTileCount(), before - results.length);
});

test('整理商品不改变商品总数与可见商品多重集合', () => {
  const config = generateLevel(18, { seed: 13579 });
  const model = new GameModel(config);
  const beforeCount = model.getRemainingTileCount();
  const beforeTops = model.stacks.filter((stack) => stack.length).map((stack) => stack[0]).sort();
  assert.strictEqual(model.shuffleVisible(), true);
  const afterTops = model.stacks.filter((stack) => stack.length).map((stack) => stack[0]).sort();
  assert.strictEqual(model.getRemainingTileCount(), beforeCount);
  assert.deepStrictEqual(afterTops, beforeTops);
});

test('进度存档只补发新增星星并正确解锁下一关', () => {
  let persisted = null;
  const platform = {
    getStorageSync() { return persisted; },
    setStorageSync(key, value) { persisted = JSON.parse(JSON.stringify(value)); }
  };
  const storage = new Storage(platform);
  storage.recordResult({
    level: 1, daily: false, status: 'won', stars: 2, score: 800,
    maxBufferUsed: 4, boxesCompleted: 3
  });
  assert.strictEqual(storage.data.highestLevel, 2);
  assert.strictEqual(storage.data.totalStars, 2);
  assert.strictEqual(storage.data.coins, 140);
  storage.recordResult({
    level: 1, daily: false, status: 'won', stars: 3, score: 1000,
    maxBufferUsed: 2, boxesCompleted: 3
  });
  assert.strictEqual(storage.data.totalStars, 3);
  assert.strictEqual(storage.data.coins, 190);
  assert.strictEqual(storage.data.bestByLevel[1].score, 1000);
  assert.strictEqual(storage.data.bestByLevel[1].maxBufferUsed, 2);
  storage.recordResult({
    level: 20, daily: false, challenge: true, status: 'won', stars: 3, score: 5000,
    maxBufferUsed: 0, boxesCompleted: 12
  });
  assert.strictEqual(storage.data.highestLevel, 2, '高关好友挑战不应跳过主线进度');
  const first = storage.collectRareFruit('starlight_strawberry', 5);
  const duplicate = storage.collectRareFruit('starlight_strawberry', 10);
  assert.strictEqual(first.isNew, true);
  assert.strictEqual(duplicate.isNew, false);
  assert.strictEqual(duplicate.count, 2);
  assert.strictEqual(storage.data.rareFruitTotal, 2);
  assert.strictEqual(first.points, RARE_FRUIT_MAP.starlight_strawberry.firstPoints);
  assert.strictEqual(duplicate.points, RARE_FRUIT_MAP.starlight_strawberry.duplicatePoints);
  assert.strictEqual(storage.data.fruitPoints, first.points + duplicate.points);
  assert.strictEqual(storage.data.totalPoints, getTotalPoints(storage.data));
});

test('主题必须按顺序全收集后解锁，并自动从新主题第 1 关开始', () => {
  let persisted = null;
  const storage = new Storage({
    getStorageSync() { return persisted; },
    setStorageSync(key, value) { persisted = JSON.parse(JSON.stringify(value)); }
  });
  const fruits = getThemeCollectibles('fruit');
  fruits.slice(0, -1).forEach((collectible) => {
    storage.data.rareFruits[collectible.id] = { count: 1, themeId: 'fruit' };
  });
  const unlocked = storage.collectCollectible(fruits[fruits.length - 1].id, fruits[fruits.length - 1].minLevel);
  assert.strictEqual(unlocked.themeCompleted, true);
  assert.strictEqual(unlocked.unlockedTheme.id, 'vegetable');
  assert.deepStrictEqual(storage.data.unlockedThemes, ['fruit', 'vegetable']);
  assert.strictEqual(storage.data.activeThemeId, 'vegetable');
  assert.strictEqual(storage.getActiveLevel(), 1);
  assert.strictEqual(storage.setActiveTheme('digital'), false, '不得跳过家电主题直接进入数码主题');
});

test('v3 存档迁移到 v8 后保留水果关卡、收藏、积分与最佳纪录', () => {
  const legacy = {
    version: 3,
    highestLevel: 42,
    adventurePoints: 2345,
    fruitPoints: 678,
    rareFruits: { starlight_strawberry: { count: 1 } },
    bestByLevel: { 41: { stars: 3, score: 8000, cleared: true } },
    rescueTickets: 5
  };
  const storage = new Storage({ getStorageSync() { return legacy; }, setStorageSync() {} });
  assert.strictEqual(storage.data.version, 8);
  assert.strictEqual(storage.data.activeThemeId, 'fruit');
  assert.strictEqual(storage.data.highestLevelByTheme.fruit, 42);
  assert.strictEqual(storage.data.collectionPoints, 678);
  assert.strictEqual(storage.data.rareFruits.starlight_strawberry.count, 1);
  assert.strictEqual(storage.data.bestByTheme.fruit[41].score, 8000);
  assert.strictEqual(storage.data.rescueTickets, 5);
  assert.strictEqual(storage.data.bufferSlotsUnlocked, 1);
  assert.strictEqual(storage.data.pauseTickets, 2);
});

test('旧双金币存档只保留真实余额，不用历史累计值覆盖当前金币', () => {
  let persisted = null;
  const legacy = {
    version: 8,
    coins: 240,
    lifetimeCoins: 9200,
    highestLevelByTheme: { fruit: 12 },
    bestByTheme: { fruit: {} },
    rareFruits: {}
  };
  const storage = new Storage({
    getStorageSync() { return legacy; },
    setStorageSync(key, value) { persisted = JSON.parse(JSON.stringify(value)); }
  });
  assert.strictEqual(storage.data.coins, 240);
  assert.strictEqual(Object.prototype.hasOwnProperty.call(storage.data, 'lifetimeCoins'), false);
  assert.strictEqual(getPointRank(storage.data.coins).name, '装箱学徒');
  storage.save();
  assert.strictEqual(Object.prototype.hasOwnProperty.call(persisted, 'lifetimeCoins'), false);
});

test('v2 存档会迁移到 v8 主题积分与救援券且不丢失原珍果', () => {
  const fruit = RARE_FRUIT_MAP.starlight_strawberry;
  const legacy = {
    version: 2,
    highestLevel: 12,
    totalStars: 22,
    boxesPacked: 44,
    rareFruits: { starlight_strawberry: { count: 2 } },
    rareFruitTotal: 2,
    bestByLevel: {}
  };
  const storage = new Storage({
    getStorageSync() { return legacy; },
    setStorageSync() {}
  });
  assert.strictEqual(storage.data.version, 8);
  assert(storage.data.adventurePoints > 0);
  assert.strictEqual(storage.data.collectionPoints, fruit.firstPoints + fruit.duplicatePoints);
  assert.strictEqual(storage.data.totalPoints, getTotalPoints(storage.data));
  assert.strictEqual(storage.data.rescueTickets, 3);
});

test('v4 存档迁移到 v8 后新增机制教学记录且不丢原进度', () => {
  let persisted = null;
  const legacy = {
    version: 4,
    activeThemeId: 'fruit',
    unlockedThemes: ['fruit'],
    highestLevelByTheme: { fruit: 24 },
    bestByTheme: { fruit: { 23: { stars: 3, score: 9000, cleared: true } } },
    rareFruits: { starlight_strawberry: { count: 2, themeId: 'fruit' } },
    collectionPoints: 777,
    rescueTickets: 4
  };
  const platform = {
    getStorageSync() { return persisted || legacy; },
    setStorageSync(key, value) { persisted = JSON.parse(JSON.stringify(value)); }
  };
  const storage = new Storage(platform);
  assert.strictEqual(storage.data.version, 8);
  assert.deepStrictEqual(storage.data.seenMechanics, {});
  assert.strictEqual(storage.getThemeLevel('fruit'), 24);
  assert.strictEqual(storage.data.bestByTheme.fruit[23].score, 9000);
  assert.strictEqual(storage.markMechanicSeen('collectible'), true);
  assert.strictEqual(storage.hasSeenMechanic('collectible'), true);
  assert.strictEqual(new Storage(platform).hasSeenMechanic('collectible'), true);
});

test('v5 已开启旧主题的存档会补齐新增前置主题，不会失去原展馆', () => {
  const legacy = {
    version: 5,
    activeThemeId: 'toy',
    unlockedThemes: ['fruit', 'toy'],
    highestLevelByTheme: { fruit: 80, toy: 12 },
    bestByTheme: { fruit: {}, toy: {} },
    rareFruits: {},
    coins: 900
  };
  const storage = new Storage({ getStorageSync() { return legacy; }, setStorageSync() {} });
  assert.deepStrictEqual(storage.data.unlockedThemes, ['fruit', 'vegetable', 'animal', 'toy']);
  assert.strictEqual(storage.data.activeThemeId, 'toy');
  assert.strictEqual(storage.getThemeLevel('toy'), 12);
  assert.strictEqual(storage.data.bufferSlotsUnlocked, 1);
});

test('首次闯关累积积分，每 10 个主线关补发救援券', () => {
  let persisted = null;
  const storage = new Storage({
    getStorageSync() { return persisted; },
    setStorageSync(key, value) { persisted = JSON.parse(JSON.stringify(value)); }
  });
  const first = storage.recordResult({
    level: 1, daily: false, status: 'won', stars: 3, score: 1000,
    maxBufferUsed: 1, boxesCompleted: 3
  });
  const replay = storage.recordResult({
    level: 1, daily: false, status: 'won', stars: 3, score: 1000,
    maxBufferUsed: 1, boxesCompleted: 3
  });
  assert(first.adventurePoints > replay.adventurePoints);
  const milestone = storage.recordResult({
    level: 10, daily: false, status: 'won', stars: 3, score: 3000,
    maxBufferUsed: 1, boxesCompleted: 7
  });
  assert.strictEqual(milestone.rescueTicketBonus, 1);
  assert.strictEqual(storage.data.rescueTickets, 4);
});

test('每点亮 10 种珍果补发救援券，广告关闭也能用券复活', () => {
  let persisted = null;
  const storage = new Storage({
    getStorageSync() { return persisted; },
    setStorageSync(key, value) { persisted = JSON.parse(JSON.stringify(value)); }
  });
  let tenth = null;
  RARE_FRUITS.slice(0, 10).forEach((fruit) => { tenth = storage.collectRareFruit(fruit.id, fruit.minLevel); });
  assert.strictEqual(tenth.rescueTicketBonus, 1);
  assert.strictEqual(storage.data.rescueTickets, 4);

  const model = new GameModel({
    level: 8,
    seed: 12,
    daily: false,
    targetPerBox: 3,
    bufferCapacity: 1,
    timeLimitMs: 0,
    orderQueue: ['apple', 'milk'],
    stacks: [['bread'], ['bread']]
  });
  model.selectStack(0);
  model.selectStack(1);
  assert.strictEqual(model.status, 'failed');
  const app = Object.create(GameApp.prototype);
  Object.assign(app, {
    model,
    storage,
    runId: 1,
    resultRecorded: false,
    view: { overlay: 'fail', result: model.getResult() },
    ads: { canReward() { return false; } },
    platform: { isDev: true },
    audio: { play() {} },
    renderer: { showToast() {} },
    analytics: { report() {} },
    lastFrameAt: 0
  });
  const beforeTickets = storage.data.rescueTickets;
  assert.strictEqual(app._canOfferReward(), false, '开发模式不应伪装成已开通广告');
  assert.strictEqual(app._revive(), true);
  assert.strictEqual(model.status, 'playing');
  assert.strictEqual(storage.data.rescueTickets, beforeTickets - 1);
});

test('金币不足时会先展示藏品兑换方案，确认后完成出售与复活', () => {
  const storage = new Storage({ getStorageSync() { return null; }, setStorageSync() {} });
  const collectible = getThemeCollectibles('fruit')[0];
  storage.collectCollectible(collectible.id, collectible.minLevel);
  storage.data.rareFruits[collectible.id].owned = 50;
  storage.data.coins = 20;
  const model = new GameModel({
    themeId: 'fruit', level: 9, seed: 88, daily: false, activeOrderCount: 1,
    targetPerBox: 3, bufferCapacity: 1, timeLimitMs: 0,
    orderQueue: ['apple'], stacks: [['bread'], ['bread']]
  });
  model.status = 'failed';
  model.remainingMs = 0;
  const app = Object.create(GameApp.prototype);
  Object.assign(app, {
    model,
    storage,
    runId: 1,
    resultRecorded: false,
    view: { overlay: 'fail', result: model.getResult(), revivePanel: 'choice', reviveExchangeOffer: null },
    ads: { canReward() { return false; } },
    platform: { isDev: true },
    audio: { play() {} },
    renderer: { showToast() {} },
    analytics: { report() {} },
    lastFrameAt: 0
  });
  assert.strictEqual(app._revive('coins'), false);
  assert.strictEqual(app.view.revivePanel, 'exchange');
  assert(app.view.reviveExchangeOffer.plan.total >= 160);
  const ownedBefore = storage.data.rareFruits[collectible.id].owned;
  assert.strictEqual(app._confirmReviveExchange(), true);
  assert.strictEqual(model.status, 'playing');
  assert.strictEqual(storage.data.coins, 0);
  assert(storage.data.rareFruits[collectible.id].owned < ownedBefore);
});

test('金币段位与无尽远征主题边界正确', () => {
  assert.strictEqual(getPointRank(0).name, '装箱学徒');
  assert.strictEqual(getPointRank(800).name, '青铜货架');
  assert.strictEqual(getPointRank(250000).name, '星海馆长');
  assert.strictEqual(getJourneyInfo(50).endless, false);
  assert.strictEqual(getJourneyInfo(51).wave, 1);
  assert.strictEqual(getJourneyInfo(71).subtitle, '深海冰晶');
  assert.strictEqual(getJourneyInfo(151).season, 2);
});

test('7 日签到循环与三连胜宝箱正确发奖', () => {
  let persisted = null;
  const platform = {
    getStorageSync() { return persisted; },
    setStorageSync(key, value) { persisted = JSON.parse(JSON.stringify(value)); }
  };
  const storage = new Storage(platform);
  let claim = null;
  for (let day = 0; day < 7; day += 1) {
    claim = storage.claimDailyLogin(new Date(2026, 6, 1 + day, 12, 0, 0));
    assert.strictEqual(claim.claimed, true);
    assert.strictEqual(claim.day, day + 1);
  }
  assert.strictEqual(claim.reward, 90);
  assert.strictEqual(storage.data.coins, 405);
  assert.strictEqual(storage.claimDailyLogin(new Date(2026, 6, 7, 20, 0, 0)).claimed, false);
  const loop = storage.claimDailyLogin(new Date(2026, 6, 8, 12, 0, 0));
  assert.strictEqual(loop.day, 1);
  assert.strictEqual(loop.reward, 20);

  let third = null;
  for (let level = 1; level <= 3; level += 1) {
    third = storage.recordResult({
      level,
      daily: false,
      status: 'won',
      stars: 1,
      score: 500,
      maxBufferUsed: 4,
      boxesCompleted: 3
    });
  }
  assert.strictEqual(third.winStreak, 3);
  assert.strictEqual(third.streakBonus, 50);
  assert.strictEqual(storage.data.streakChestCount, 1);
  storage.recordResult({ level: 4, daily: false, status: 'failed', stars: 0, score: 0, maxBufferUsed: 7, boxesCompleted: 0 });
  assert.strictEqual(storage.data.winStreak, 0);
});

test('分享参数可还原同一主题与同一好友挑战', () => {
  const queryString = createQuery({ themeId: 'toy', level: 12, seed: 4294967295, score: 3210, daily: true });
  const query = {};
  queryString.split('&').forEach((pair) => {
    const parts = pair.split('=');
    query[decodeURIComponent(parts[0])] = decodeURIComponent(parts[1] || '');
  });
  assert.deepStrictEqual(parseChallenge({ query }), {
    level: 12,
    themeId: 'toy',
    seed: 4294967295,
    score: 3210,
    daily: true
  });
  assert.strictEqual(parseChallenge({ query: { level: '12' } }), null);
  assert.strictEqual(parseFruitShopEntry({ query: { from: 'fruit_shop', shop: '1' } }), true);
});

test('分享文案会体现战绩与好友挑战结果', () => {
  assert(createTitle({ status: 'won', level: 3, maxBufferUsed: 2 }).includes('第3关'));
  assert(createTitle({ status: 'won', challengeScore: 900, challengeBeat: true }).includes('超过'));
  assert(createTitle({ daily: true, boxesCompleted: 11 }).includes('11箱'));
  assert(createTitle({ rareFruitName: '星辉草莓', rarityName: '稀有', level: 5 }).includes('星辉草莓'));
  assert(createTitle({ fruitShop: true, rareCount: 3, rarestFruitName: '水晶梨' }).includes('3/56'));
  assert(createTitle({ status: 'failed', level: 18, boxesCompleted: 8, boxTotal: 10, coins: 12345 }).includes('只差2箱'));
  assert(createTitle({ status: 'won', level: 51, coins: 8888, earnedCoins: 50 }).includes('金币'));
  const variants = [0, 1, 2].map((index) => createTitle({ status: 'won', level: 9, coins: 888 }, 'friend', index));
  assert.strictEqual(new Set(variants).size, 3, '同一场景应轮换多条分享文案');
  assert(variants.every((title) => !title.includes('积分')));
  assert(variants.every((title) => !title.includes('累计金币')));
});

let passed = 0;
for (const entry of tests) {
  try {
    entry.fn();
    passed += 1;
    console.log(`✓ ${entry.name}`);
  } catch (error) {
    console.error(`✗ ${entry.name}`);
    console.error(error && error.stack || error);
    process.exitCode = 1;
  }
}

console.log(`\n${passed}/${tests.length} 项测试通过`);
