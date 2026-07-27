'use strict';

const CONFIG = require('./config');
const { getItemById } = require('./catalog');
const { parseItemToken } = require('./item-rules');
const { ACTIVE_ORDER_COUNT } = require('./level-generator');
const { getCollectibleFromToken, isCollectibleToken } = require('./theme-collectibles');
const { normalizeThemeId } = require('./themes');
const { RNG } = require('./utils');

class GameModel {
  constructor(levelConfig) {
    this.reset(levelConfig);
  }

  reset(levelConfig) {
    this.config = levelConfig;
    this.themeId = normalizeThemeId(levelConfig.themeId || 'fruit');
    this.level = levelConfig.level;
    this.seed = levelConfig.seed;
    this.daily = Boolean(levelConfig.daily);
    this.status = 'playing';
    this.failureReason = '';
    this.stacks = levelConfig.stacks.map((stack) => stack.slice());
    this.orderQueue = levelConfig.orderQueue.slice();
    this.orderRules = (levelConfig.orderRules || []).map((rule) => rule && Object.assign({}, rule));
    this.activeOrderCount = levelConfig.activeOrderCount || ACTIVE_ORDER_COUNT;
    this.shelfShiftEnabled = levelConfig.shelfShiftEnabled !== false;
    this.targetPerBox = levelConfig.targetPerBox || 3;
    this.activeOrders = [];
    this.nextOrderCursor = 0;
    this.boxesCompleted = 0;
    this.moves = 0;
    this.combo = 0;
    this.bestCombo = 0;
    this.score = 0;
    this.itemPointsEarned = 0;
    this.packingCoinsEarned = 0;
    this.revived = false;
    this.elapsedMs = 0;
    this.remainingMs = levelConfig.timeLimitMs || 0;
    this.addedTimeMs = 0;
    this.interactionFrozenMs = 0;
    this.lastAction = null;
    this.rareCollected = [];
    this.collectiblesCollected = [];
    this.specialMatched = 0;
    this.priorityOrdersCompleted = 0;
    this.priorityBonusTotal = 0;
    this.shelfShiftCount = 0;
    this.totalMistakes = 0;
    this.collectibleTimer = null;
    this.lastCollectibleExpiry = null;

    // 旧存档与统计字段保留为只读兼容值；v1.9 起不再使用旧缓冲格与压力玩法。
    this.buffer = [];
    this.baseBufferCapacity = 0;
    this.maxBufferCapacity = 0;
    this.bufferCapacity = 0;
    this.reviveBonusCapacity = 0;
    this.maxBufferUsed = 0;
    this.mistakeStreak = 0;
    this.jamSlots = 0;
    this.jamSlotsCreated = 0;
    this.jamSlotsCleared = 0;
    this.precisionStreak = 0;
    this.precisionTarget = 0;
    this.precisionBursts = 0;
    this.mistakeShield = 0;

    while (this.activeOrders.length < this.activeOrderCount && this.nextOrderCursor < this.orderQueue.length) {
      this._appendNextOrder();
    }
    this._ensurePlayableTop();
  }

  _appendNextOrder() {
    if (this.nextOrderCursor >= this.orderQueue.length) return null;
    const id = this.nextOrderCursor;
    const ruleConfig = this.orderRules[id] || null;
    const order = {
      id,
      type: this.orderQueue[id],
      count: 0,
      target: this.targetPerBox,
      rule: ruleConfig ? Object.assign({}, ruleConfig, {
        remainingMoves: Math.max(0, ruleConfig.moves || 0),
        expired: false
      }) : null
    };
    this.nextOrderCursor += 1;
    this.activeOrders.push(order);
    return order;
  }

  _findOrder(type) {
    return this.activeOrders.find((order) => order.type === type && order.count < order.target);
  }

  _advanceTurnTimers() {
    this.activeOrders.forEach((order) => {
      if (!order.rule || order.rule.type !== 'rush' || order.rule.remainingMoves <= 0) return;
      order.rule.remainingMoves -= 1;
      if (order.rule.remainingMoves <= 0) order.rule.expired = true;
    });
  }

  _shiftShelves() {
    if (!this.shelfShiftEnabled || this.stacks.length < 2) return false;
    if (this.boxesCompleted % 3 === 0) this.stacks.reverse();
    else if (this.boxesCompleted % 2 === 0) this.stacks.unshift(this.stacks.pop());
    else this.stacks.push(this.stacks.shift());
    this.shelfShiftCount += 1;
    return true;
  }

  _findVisibleCollectible() {
    for (let index = 0; index < this.stacks.length; index += 1) {
      const collectible = getCollectibleFromToken(this.stacks[index] && this.stacks[index][0]);
      if (collectible) return { collectible, stackIndex: index };
    }
    return null;
  }

  _hasPlayableTop() {
    const activeTypes = new Set(this.activeOrders.map((order) => order.type));
    return this.stacks.some((stack) => {
      if (!stack.length) return false;
      if (isCollectibleToken(stack[0])) return true;
      const parsed = parseItemToken(stack[0]);
      return !(parsed.rule && parsed.rule.trap) && activeTypes.has(parsed.type);
    });
  }

  _ensurePlayableTop() {
    if (this.status !== 'playing' || this._hasPlayableTop()) return null;
    const activeTypes = new Set(this.activeOrders.map((order) => order.type));
    for (let stackIndex = 0; stackIndex < this.stacks.length; stackIndex += 1) {
      const stack = this.stacks[stackIndex];
      for (let index = 1; index < stack.length; index += 1) {
        const token = stack[index];
        if (isCollectibleToken(token)) continue;
        const parsed = parseItemToken(token);
        if (parsed.rule && parsed.rule.trap || !activeTypes.has(parsed.type)) continue;
        stack.splice(index, 1);
        stack.unshift(token);
        return { stackIndex, fromDepth: index };
      }
    }
    return null;
  }

  _syncCollectibleTimer(allowStart) {
    const visible = this._findVisibleCollectible();
    if (!visible) {
      this.collectibleTimer = null;
      return null;
    }
    if (this.collectibleTimer && this.collectibleTimer.id === visible.collectible.id) {
      this.collectibleTimer.stackIndex = visible.stackIndex;
      return this.collectibleTimer;
    }
    if (!allowStart) return null;
    this.collectibleTimer = {
      id: visible.collectible.id,
      collectible: visible.collectible,
      stackIndex: visible.stackIndex,
      durationMs: CONFIG.RARE_VISIBLE_MS,
      remainingMs: CONFIG.RARE_VISIBLE_MS
    };
    return this.collectibleTimer;
  }

  _expireCollectible() {
    const timer = this.collectibleTimer;
    if (!timer) return null;
    const tokenId = timer.id;
    const token = this.stacks.reduce((found, stack, stackIndex) => {
      if (found) return found;
      const index = stack.findIndex((value) => {
        const collectible = getCollectibleFromToken(value);
        return collectible && collectible.id === tokenId;
      });
      return index >= 0 ? { stack, stackIndex, index } : null;
    }, null);
    if (token) token.stack.splice(token.index, 1);
    this.collectibleTimer = null;
    this.lastCollectibleExpiry = {
      id: tokenId,
      collectible: timer.collectible,
      stackIndex: token && token.stackIndex,
      expired: Boolean(token)
    };
    this._ensurePlayableTop();
    this._syncCollectibleTimer(true);
    return this.lastCollectibleExpiry;
  }

  _settle() {
    const completed = [];
    let priorityBonus = 0;
    let shelfShift = 0;
    let changed = true;
    while (changed) {
      changed = false;
      const readyIndex = this.activeOrders.findIndex((order) => order.count >= order.target);
      if (readyIndex < 0) continue;
      const order = this.activeOrders.splice(readyIndex, 1)[0];
      this.boxesCompleted += 1;
      this.score += 160 + Math.min(200, this.combo * 12);
      if (order.rule && order.rule.type === 'rush' && order.rule.remainingMoves > 0) {
        order.priorityBonus = (order.rule.bonus || 100) + order.rule.remainingMoves * 8;
        priorityBonus += order.priorityBonus;
        this.priorityBonusTotal += order.priorityBonus;
        this.priorityOrdersCompleted += 1;
        this.score += order.priorityBonus;
      } else {
        order.priorityBonus = 0;
      }
      completed.push(order);
      if (this._shiftShelves()) shelfShift += 1;
      this._appendNextOrder();
      changed = true;
    }
    return { completed, movedFromBuffer: [], priorityBonus, shelfShift, jamCleared: 0 };
  }

  _consumeSweepTokens(type, limit) {
    let remaining = Math.max(0, Math.floor(Number(limit) || 0));
    let removed = 0;
    for (let stackIndex = 0; stackIndex < this.stacks.length && remaining > 0; stackIndex += 1) {
      const stack = this.stacks[stackIndex];
      for (let index = 0; index < stack.length && remaining > 0;) {
        const token = stack[index];
        if (isCollectibleToken(token)) {
          index += 1;
          continue;
        }
        const parsed = parseItemToken(token);
        if (parsed.type !== type || parsed.rule && parsed.rule.trap) {
          index += 1;
          continue;
        }
        stack.splice(index, 1);
        remaining -= 1;
        removed += 1;
      }
    }
    return removed;
  }

  _createActionBase(token, parsed, stackIndex) {
    return {
      type: token,
      baseType: parsed && parsed.type || token,
      item: parsed ? getItemById(parsed.type) : null,
      rule: parsed && parsed.rule || null,
      stackIndex,
      matched: false,
      special: false,
      collectible: null,
      rareFruit: null,
      bomb: false,
      completed: [],
      movedFromBuffer: [],
      timerEffects: [],
      priorityBonus: 0,
      shelfShift: 0,
      jamAdded: 0,
      jamCleared: 0,
      precisionBurst: null,
      pointsGained: 0,
      coinsGained: 0,
      clearedCount: 0,
      timeDeltaMs: 0,
      frozenMs: 0,
      ruleBonus: 0,
      ruleEffect: '',
      failureReason: ''
    };
  }

  selectStack(stackIndex) {
    if (this.status !== 'playing') return { accepted: false, reason: 'not_playing' };
    if (this.interactionFrozenMs > 0) {
      return { accepted: false, reason: 'frozen', remainingMs: this.interactionFrozenMs };
    }
    const stack = this.stacks[stackIndex];
    if (!stack || !stack.length) return { accepted: false, reason: 'empty_stack' };

    const token = stack[0];
    const collectible = getCollectibleFromToken(token);
    this._advanceTurnTimers();

    if (collectible) {
      stack.shift();
      this.collectibleTimer = null;
      this.moves += 1;
      this.score += 120 + collectible.minLevel * 3;
      this.rareCollected.push(collectible.id);
      this.collectiblesCollected.push(collectible.id);
      this._ensurePlayableTop();
      this._syncCollectibleTimer(true);
      this.lastAction = Object.assign(this._createActionBase(token, null, stackIndex), {
        collectible,
        rareFruit: collectible,
        special: true,
        status: this.status
      });
      return Object.assign({ accepted: true }, this.lastAction);
    }

    const parsed = parseItemToken(token);
    const action = this._createActionBase(token, parsed, stackIndex);

    if (parsed.rule && parsed.rule.trap) {
      stack.shift();
      this.moves += 1;
      this.totalMistakes += 1;
      this.combo = 0;
      this.status = 'failed';
      this.failureReason = 'bomb';
      action.bomb = true;
      action.special = true;
      action.ruleEffect = '炸弹触发';
      action.failureReason = this.failureReason;
      action.status = this.status;
      this._syncCollectibleTimer(true);
      this.lastAction = action;
      return Object.assign({ accepted: true }, action);
    }

    const order = this._findOrder(parsed.type);
    if (!order) {
      // 普通点错立即失败，但物件留在原位。玩家复活后仍能选择正确目标，
      // 不会因为错拿永久丢失保证解所需物件。
      this.moves += 1;
      this.totalMistakes += 1;
      this.combo = 0;
      this.score = Math.max(0, this.score - 5);
      this.status = 'failed';
      this.failureReason = 'wrong';
      action.failureReason = this.failureReason;
      action.status = this.status;
      this.lastAction = action;
      return Object.assign({ accepted: true }, action);
    }

    stack.shift();
    order.count += 1;
    action.matched = true;
    this.combo += 1;
    this.bestCombo = Math.max(this.bestCombo, this.combo);
    const item = action.item;
    const rule = parsed.rule;
    const itemPoints = Math.max(1, item && item.pointValue || 20);
    const itemCoins = Math.max(1, item && item.coinValue || 1);
    let clearedCount = 0;

    if (rule) {
      this.specialMatched += 1;
      action.ruleBonus = rule.directBonus || 0;
      if (rule.freezeMs) {
        this.interactionFrozenMs = Math.max(this.interactionFrozenMs, rule.freezeMs);
        action.frozenMs = rule.freezeMs;
        action.ruleEffect = `冻结 ${(rule.freezeMs / 1000).toFixed(1)} 秒`;
      } else if (rule.timeDeltaMs) {
        const before = this.remainingMs;
        this.remainingMs = Math.max(0, this.remainingMs + rule.timeDeltaMs);
        const actualDelta = this.remainingMs - before;
        action.timeDeltaMs = actualDelta;
        if (actualDelta > 0) this.addedTimeMs += actualDelta;
        action.ruleEffect = actualDelta > 0 ? `时间 +${Math.round(actualDelta / 1000)} 秒` : `时间 ${Math.round(actualDelta / 1000)} 秒`;
      } else if (rule.sweep) {
        const needed = Math.max(0, order.target - order.count);
        clearedCount = this._consumeSweepTokens(parsed.type, needed);
        order.count += clearedCount;
        action.clearedCount = clearedCount;
        action.ruleEffect = `同类一键装满`;
      }
    }

    this.moves += 1;
    const settled = this._settle();
    const collectedCount = 1 + clearedCount;
    action.pointsGained = itemPoints * collectedCount + action.ruleBonus + settled.priorityBonus + settled.completed.length * 30;
    action.coinsGained = itemCoins * collectedCount + settled.completed.length * 2;
    this.itemPointsEarned += action.pointsGained;
    this.packingCoinsEarned += action.coinsGained;
    this.score += itemPoints * collectedCount + Math.min(80, this.combo * 4) + action.ruleBonus;

    action.completed = settled.completed;
    action.priorityBonus = settled.priorityBonus;
    action.shelfShift = settled.shelfShift;

    if (this.boxesCompleted >= this.orderQueue.length) {
      this.status = 'won';
      this.failureReason = '';
      this.score += this.getStars() * 300;
    } else if (this.remainingMs === 0) {
      this.status = 'failed';
      this.failureReason = 'timeout';
    }

    action.autoRevealed = this._ensurePlayableTop();
    this._syncCollectibleTimer(true);
    action.failureReason = this.failureReason;
    action.status = this.status;
    this.lastAction = action;
    return Object.assign({ accepted: true }, action);
  }

  getBufferUsage() {
    return 0;
  }

  getBufferDisplaySlots() {
    return [];
  }

  getMistakeThreshold() {
    return 0;
  }

  getNextOrderPreview() {
    if (this.nextOrderCursor >= this.orderQueue.length) return null;
    return {
      type: this.orderQueue[this.nextOrderCursor],
      rule: this.orderRules[this.nextOrderCursor] || null
    };
  }

  getHint() {
    if (this.status !== 'playing' || this.interactionFrozenMs > 0) return -1;
    const activeTypes = new Set(this.activeOrders.map((order) => order.type));
    const rushTypes = new Set(this.activeOrders
      .filter((order) => order.rule && order.rule.type === 'rush' && order.rule.remainingMoves > 0)
      .map((order) => order.type));
    const rare = [];
    const rush = [];
    const special = [];
    const direct = [];
    this.stacks.forEach((stack, index) => {
      if (!stack.length) return;
      if (isCollectibleToken(stack[0])) {
        rare.push(index);
        return;
      }
      const parsed = parseItemToken(stack[0]);
      if (parsed.rule && parsed.rule.trap) return;
      if (!activeTypes.has(parsed.type)) return;
      if (rushTypes.has(parsed.type)) rush.push(index);
      else if (parsed.rule) special.push(index);
      else direct.push(index);
    });
    if (rare.length) return rare[0];
    if (rush.length) return rush[0];
    if (special.length) return special[0];
    if (direct.length) return direct[0];
    return -1;
  }

  shuffleVisible() {
    if (this.status !== 'playing' || this.interactionFrozenMs > 0) return false;
    const indices = [];
    const tops = [];
    this.stacks.forEach((stack, index) => {
      if (stack.length) {
        indices.push(index);
        tops.push(stack[0]);
      }
    });
    if (tops.length < 2) return false;
    const rng = new RNG((this.seed + this.moves * 7919 + 17) >>> 0);
    rng.shuffle(tops);
    indices.forEach((stackIndex, index) => { this.stacks[stackIndex][0] = tops[index]; });
    this.combo = 0;
    this._ensurePlayableTop();
    this._syncCollectibleTimer(true);
    return true;
  }

  autoPack() {
    if (this.status !== 'playing') return [];
    const results = [];
    for (let step = 0; step < 4 && this.status === 'playing'; step += 1) {
      const hint = this.stacks.findIndex((stack) => {
        if (!stack.length || isCollectibleToken(stack[0])) return false;
        const parsed = parseItemToken(stack[0]);
        return !(parsed.rule && parsed.rule.trap) && Boolean(this._findOrder(parsed.type));
      });
      if (hint < 0) break;
      const result = this.selectStack(hint);
      if (!result.accepted) break;
      results.push(result);
      if (result.completed.length || this.interactionFrozenMs > 0) break;
    }
    return results;
  }

  revive() {
    if (this.status !== 'failed' || this.revived) return false;
    this.revived = true;
    const before = this.remainingMs;
    this.remainingMs = Math.max(15000, this.remainingMs);
    this.addedTimeMs += this.remainingMs - before;
    this.interactionFrozenMs = 0;
    this.status = 'playing';
    this.failureReason = '';
    this.combo = 0;
    return true;
  }

  unlockBufferSlot() {
    return false;
  }

  addTime(milliseconds) {
    if (this.status !== 'playing') return false;
    const amount = Math.max(0, Math.floor(Number(milliseconds) || 0));
    if (!amount) return false;
    this.remainingMs += amount;
    this.addedTimeMs += amount;
    return true;
  }

  getActiveCollectibleTimer() {
    return this.collectibleTimer && Object.assign({}, this.collectibleTimer);
  }

  getInteractionFrozenMs() {
    return Math.max(0, this.interactionFrozenMs || 0);
  }

  tick(deltaMs, options) {
    if (this.status !== 'playing') return null;
    const opts = options || {};
    const delta = Math.max(0, Number(deltaMs) || 0);
    const events = { collectibleAppeared: false, collectibleExpired: null, levelExpired: false, frozenEnded: false };
    const hadTimer = Boolean(this.collectibleTimer);
    this._syncCollectibleTimer(Boolean(opts.allowCollectibleStart));
    if (!hadTimer && this.collectibleTimer) events.collectibleAppeared = true;

    // 闪耀藏品和冻结窗口都使用真实时间；暂停只影响关卡主倒计时。
    if (this.collectibleTimer) {
      this.collectibleTimer.remainingMs = Math.max(0, this.collectibleTimer.remainingMs - delta);
      if (this.collectibleTimer.remainingMs === 0) events.collectibleExpired = this._expireCollectible();
    }
    if (this.interactionFrozenMs > 0) {
      const before = this.interactionFrozenMs;
      this.interactionFrozenMs = Math.max(0, this.interactionFrozenMs - delta);
      events.frozenEnded = before > 0 && this.interactionFrozenMs === 0;
    }

    if (!opts.pauseLevelTimer) {
      this.elapsedMs += delta;
      if (this.remainingMs > 0) {
        this.remainingMs = Math.max(0, this.remainingMs - delta);
        if (this.remainingMs === 0 && this.status === 'playing') {
          this.status = 'failed';
          this.failureReason = 'timeout';
          events.levelExpired = true;
        }
      }
    }
    return events;
  }

  getStars() {
    if (this.status !== 'won') return 0;
    const totalTime = Math.max(1, (this.config.timeLimitMs || 1) + this.addedTimeMs);
    const ratio = this.remainingMs / totalTime;
    if (!this.revived && this.totalMistakes === 0 && ratio >= 0.24) return 3;
    if (ratio >= 0.07) return 2;
    return 1;
  }

  getProgress() {
    return this.orderQueue.length ? this.boxesCompleted / this.orderQueue.length : 1;
  }

  getRemainingTileCount() {
    return this.stacks.reduce((sum, stack) => sum + stack.filter((token) => {
      if (isCollectibleToken(token)) return false;
      const parsed = parseItemToken(token);
      return !(parsed.rule && parsed.rule.trap);
    }).length, 0);
  }

  getResult() {
    return {
      level: this.level,
      themeId: this.themeId,
      daily: this.daily,
      seed: this.seed,
      status: this.status,
      stars: this.getStars(),
      score: this.score,
      moves: this.moves,
      revived: this.revived,
      maxBufferUsed: 0,
      boxesCompleted: this.boxesCompleted,
      boxTotal: this.orderQueue.length,
      bestCombo: this.bestCombo,
      rareCollected: this.rareCollected.slice(),
      collectiblesCollected: this.collectiblesCollected.slice(),
      specialMatched: this.specialMatched,
      priorityOrdersCompleted: this.priorityOrdersCompleted,
      priorityBonusTotal: this.priorityBonusTotal,
      shelfShiftCount: this.shelfShiftCount,
      totalMistakes: this.totalMistakes,
      jamSlots: 0,
      jamSlotsCreated: 0,
      jamSlotsCleared: 0,
      precisionBursts: 0,
      elapsedMs: this.elapsedMs,
      itemPointsEarned: this.itemPointsEarned,
      packingCoinsEarned: this.packingCoinsEarned,
      addedTimeMs: this.addedTimeMs,
      failureReason: this.status === 'failed' ? (this.failureReason || 'wrong') : ''
    };
  }
}

module.exports = {
  GameModel
};
