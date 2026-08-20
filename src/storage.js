'use strict';

const CONFIG = require('./config');
const {
  AD_COIN_DAILY_LIMIT,
  AD_COIN_REWARD,
  BOOSTER_VOUCHER_COSTS,
  MAX_BOOSTER_VOUCHERS,
  MAX_PAUSE_TICKETS,
  MAX_STORE_PURCHASE_QUANTITY,
  PAUSE_TICKET_STORE_COST,
  RESCUE_TICKET_STORE_COST,
  createAutoSellPlan,
  getCollectibleSellValue,
  getCollectionValue,
  getOwnedCount
} = require('./economy');
const { calculateAdventurePoints, getPointRank, getTotalPoints, normalizePoints } = require('./progression');
const {
  COLLECTIBLES,
  COLLECTIBLE_MAP,
  countAllDiscoveredCollectibles,
  getThemeProgress,
  isThemeComplete
} = require('./theme-collectibles');
const { THEMES, getNextTheme, getTheme, normalizeThemeId } = require('./themes');
const { dayKey } = require('./utils');

const DEFAULT_DATA = Object.freeze({
  version: 9,
  activeThemeId: 'fruit',
  unlockedThemes: ['fruit'],
  highestLevelByTheme: { fruit: 1 },
  bestByTheme: { fruit: {} },
  themePity: { fruit: 0 },
  lastCollectibleRollKeyByTheme: {},
  highestLevel: 1,
  totalStars: 0,
  coins: 100,
  boosterVouchers: { hint: 0, shuffle: 0, add_time: 0, auto_pack: 0 },
  bufferSlotsUnlocked: 1,
  adventurePoints: 0,
  collectionPoints: 0,
  fruitPoints: 0,
  totalPoints: 0,
  rescueTickets: 1,
  newcomerRescues: 2,
  rescueTicketsEarned: 0,
  pauseTickets: 0,
  adCoinDate: '',
  adCoinViews: 0,
  soundEnabled: true,
  musicEnabled: true,
  gamesPlayed: 0,
  boxesPacked: 0,
  bestDailyScore: 0,
  bestDailyDate: '',
  lastDailyClearDate: '',
  bestByLevel: {},
  rareFruits: {},
  collectibleTotal: 0,
  collectiblesSold: 0,
  rareFruitTotal: 0,
  lastCollectibleId: '',
  lastRareFruitId: '',
  tutorialSeen: false,
  tutorialVersion: 0,
  tutorialIntroSeen: false,
  seenMechanics: {},
  loginStreak: 0,
  lastLoginDate: '',
  lastDailyReward: 0,
  winStreak: 0,
  streakChestCount: 0,
  firstClearCount: 0,
  truckProgress: 0,
  upgradedTruckChests: 0,
  dailyTaskDate: '',
  dailyTaskProgress: { play: 0, win: 0, combo: 0 },
  dailyTaskCompleted: {},
  activityStamps: 0,
  activityCycles: 0,
  personalRecords: { bestCombo: 0, fastestClearMs: 0, bestWinStreak: 0, bestDailyScore: 0, endlessWave: 0 },
  warehouseDecorations: [],
  cosmeticTitles: [],
  warehouseStyle: 'warm',
  pendingDecorationNode: 0,
  reducedMotion: false,
  lastPlayedAt: 0
});

const DAILY_LOGIN_REWARDS = Object.freeze([5, 5, 8, 8, 10, 12, 20]);
const MAX_RESCUE_TICKETS = 3;
const COLLECTIBLE_COIN_REWARDS = Object.freeze({
  rare: Object.freeze({ first: 15, duplicate: 3 }),
  epic: Object.freeze({ first: 25, duplicate: 5 }),
  legendary: Object.freeze({ first: 40, duplicate: 8 }),
  mythic: Object.freeze({ first: 60, duplicate: 12 })
});
const DAILY_TASKS = Object.freeze([
  Object.freeze({ id: 'play', target: 3, label: '完成 3 局' }),
  Object.freeze({ id: 'win', target: 2, label: '通关 2 次' }),
  Object.freeze({ id: 'combo', target: 10, label: '达成 10 连击' })
]);

class Storage {
  constructor(platform) {
    this.platform = platform;
    this.data = this.load();
  }

  load() {
    let raw = null;
    try {
      raw = this.platform.getStorageSync(CONFIG.STORAGE_KEY);
    } catch (error) {
      raw = null;
    }
    if (!raw || typeof raw !== 'object') return cloneDefault();

    const data = Object.assign(cloneDefault(), raw, {
      rareFruits: cloneCollection(raw.rareFruits),
      highestLevelByTheme: Object.assign({}, raw.highestLevelByTheme || {}),
      bestByTheme: cloneBestByTheme(raw.bestByTheme),
      themePity: Object.assign({}, raw.themePity || {}),
      lastCollectibleRollKeyByTheme: Object.assign({}, raw.lastCollectibleRollKeyByTheme || {}),
      seenMechanics: Object.assign({}, raw.seenMechanics || {}),
      boosterVouchers: normalizeVouchers(raw.boosterVouchers),
      dailyTaskProgress: Object.assign({}, raw.dailyTaskProgress || {}),
      dailyTaskCompleted: Object.assign({}, raw.dailyTaskCompleted || {}),
      personalRecords: Object.assign({}, DEFAULT_DATA.personalRecords, raw.personalRecords || {}),
      warehouseDecorations: normalizeWarehouseDecorations(raw.warehouseDecorations),
      cosmeticTitles: Array.isArray(raw.cosmeticTitles) ? raw.cosmeticTitles.slice() : []
    });

    if (!Object.keys(data.highestLevelByTheme).length) data.highestLevelByTheme.fruit = Math.max(1, Math.floor(Number(raw.highestLevel) || 1));
    if (!data.highestLevelByTheme.fruit) data.highestLevelByTheme.fruit = Math.max(1, Math.floor(Number(raw.highestLevel) || 1));
    if (!Object.keys(data.bestByTheme).length) data.bestByTheme.fruit = Object.assign({}, raw.bestByLevel || {});
    if (!data.bestByTheme.fruit) data.bestByTheme.fruit = Object.assign({}, raw.bestByLevel || {});

    data.firstClearCount = raw.firstClearCount == null
      ? estimateFirstClearCount(data)
      : normalizePoints(raw.firstClearCount);
    data.unlockedThemes = normalizeUnlockedThemes(raw.unlockedThemes, data.rareFruits, data.firstClearCount, Number(raw.version) < 9);
    const requestedActive = raw.activeThemeId && data.unlockedThemes.indexOf(raw.activeThemeId) >= 0
      ? raw.activeThemeId
      : (data.unlockedThemes.indexOf(data.activeThemeId) >= 0 ? data.activeThemeId : 'fruit');
    data.activeThemeId = normalizeThemeId(requestedActive || 'fruit');
    if (data.unlockedThemes.indexOf(data.activeThemeId) < 0) data.activeThemeId = 'fruit';

    THEMES.forEach((theme) => {
      data.highestLevelByTheme[theme.id] = Math.max(1, Math.floor(Number(data.highestLevelByTheme[theme.id]) || 1));
      data.bestByTheme[theme.id] = Object.assign({}, data.bestByTheme[theme.id] || {});
      data.themePity[theme.id] = Math.max(0, Math.floor(Number(data.themePity[theme.id]) || 0));
    });

    data.version = DEFAULT_DATA.version;
    delete data.itemLegendSeen;
    if (raw.adventurePoints == null) data.adventurePoints = estimateLegacyAdventurePoints(raw);
    if (raw.collectionPoints == null && raw.fruitPoints == null) data.collectionPoints = calculateCollectionPoints(data.rareFruits);
    else data.collectionPoints = normalizePoints(raw.collectionPoints == null ? raw.fruitPoints : raw.collectionPoints);
    data.adventurePoints = normalizePoints(data.adventurePoints);
    data.coins = normalizePoints(data.coins);
    // 旧版本曾同时保存当前金币和历史累计金币。现在只保留可消费余额，
    // 不能让旧累计值覆盖玩家真实余额。
    delete data.lifetimeCoins;
    data.lastDailyClearDate = typeof raw.lastDailyClearDate === 'string' ? raw.lastDailyClearDate : '';
    data.collectibleTotal = normalizePoints(raw.collectibleTotal == null ? raw.rareFruitTotal : raw.collectibleTotal);
    if (!data.collectibleTotal) {
      data.collectibleTotal = Object.keys(data.rareFruits).reduce((sum, id) => (
        sum + Math.max(0, Math.floor(Number(data.rareFruits[id] && data.rareFruits[id].count) || 0))
      ), 0);
    }
    data.lastCollectibleId = raw.lastCollectibleId || raw.lastRareFruitId || '';
    data.collectiblesSold = normalizePoints(raw.collectiblesSold);
    data.rescueTickets = clampTickets(raw.rescueTickets == null ? DEFAULT_DATA.rescueTickets : raw.rescueTickets);
    data.newcomerRescues = Math.min(2, normalizePoints(raw.newcomerRescues == null ? DEFAULT_DATA.newcomerRescues : raw.newcomerRescues));
    data.rescueTicketsEarned = normalizePoints(data.rescueTicketsEarned);
    data.pauseTickets = 0;
    data.adCoinDate = typeof raw.adCoinDate === 'string' ? raw.adCoinDate : '';
    data.adCoinViews = Math.min(AD_COIN_DAILY_LIMIT, normalizePoints(raw.adCoinViews));
    data.bufferSlotsUnlocked = clampBufferSlots(raw.bufferSlotsUnlocked == null ? 1 : raw.bufferSlotsUnlocked);
    data.truckProgress = Math.min(2, normalizePoints(data.truckProgress));
    data.activityStamps = Math.min(6, normalizePoints(data.activityStamps));
    data.activityCycles = normalizePoints(data.activityCycles);
    data.dailyTaskDate = typeof data.dailyTaskDate === 'string' ? data.dailyTaskDate : '';
    data.pendingDecorationNode = Math.min(10, normalizePoints(data.pendingDecorationNode));
    data.warehouseStyle = data.warehouseStyle === 'fresh' ? 'fresh' : 'warm';
    if (data.warehouseDecorations.length && !data.warehouseDecorations.some((entry) => entry.style === data.warehouseStyle)) {
      data.warehouseStyle = data.warehouseDecorations[data.warehouseDecorations.length - 1].style;
    }
    data.reducedMotion = Boolean(data.reducedMotion);
    syncLegacyAliases(data);
    return data;
  }

  save() {
    this.data.lastPlayedAt = Date.now();
    this.data.version = DEFAULT_DATA.version;
    this.data.activeThemeId = normalizeThemeId(this.data.activeThemeId);
    this.data.adventurePoints = normalizePoints(this.data.adventurePoints);
    this.data.collectionPoints = normalizePoints(this.data.collectionPoints);
    this.data.coins = normalizePoints(this.data.coins);
    delete this.data.lifetimeCoins;
    this.data.boosterVouchers = normalizeVouchers(this.data.boosterVouchers);
    this.data.rescueTickets = clampTickets(this.data.rescueTickets);
    this.data.newcomerRescues = Math.min(2, normalizePoints(this.data.newcomerRescues));
    this.data.pauseTickets = 0;
    this.data.adCoinViews = Math.min(AD_COIN_DAILY_LIMIT, normalizePoints(this.data.adCoinViews));
    this.data.bufferSlotsUnlocked = clampBufferSlots(this.data.bufferSlotsUnlocked);
    syncLegacyAliases(this.data);
    try {
      this.platform.setStorageSync(CONFIG.STORAGE_KEY, this.data);
      return true;
    } catch (error) {
      return false;
    }
  }

  getActiveLevel() {
    return Math.max(1, Math.floor(Number(this.data.highestLevelByTheme[this.data.activeThemeId]) || 1));
  }

  getThemeLevel(themeId) {
    const id = normalizeThemeId(themeId);
    return Math.max(1, Math.floor(Number(this.data.highestLevelByTheme[id]) || 1));
  }

  getThemeBest(themeId, level) {
    const id = normalizeThemeId(themeId);
    return (this.data.bestByTheme[id] || {})[level] || null;
  }

  setActiveTheme(themeId) {
    const id = normalizeThemeId(themeId);
    if (this.data.unlockedThemes.indexOf(id) < 0) return false;
    this.data.activeThemeId = id;
    this.save();
    return true;
  }

  recordCollectibleRoll(themeId, level, hasDrop) {
    const id = normalizeThemeId(themeId);
    const key = `${id}:${Math.max(1, Math.floor(Number(level) || 1))}`;
    if (this.data.lastCollectibleRollKeyByTheme[id] === key) return false;
    this.data.lastCollectibleRollKeyByTheme[id] = key;
    this.data.themePity[id] = hasDrop ? 0 : Math.min(20, (this.data.themePity[id] || 0) + 1);
    this.save();
    return true;
  }

  recordResult(result) {
    const themeId = normalizeThemeId(result.themeId || this.data.activeThemeId || 'fruit');
    const themeBest = this.data.bestByTheme[themeId] || (this.data.bestByTheme[themeId] = {});
    const rankBefore = getPointRank(getTotalPoints(this.data));
    const summary = {
      gainedStars: 0,
      baseCoins: 0,
      boxCoins: 0,
      completionCoins: 0,
      starCoins: 0,
      dailyBonusCoins: 0,
      streakBonus: 0,
      repeatCoins: 0,
      consolationCoins: 0,
      earnedCoins: 0,
      winStreak: this.data.winStreak || 0,
      adventurePoints: 0,
      totalPoints: getTotalPoints(this.data),
      rescueTicketBonus: 0,
      newcomerRescueBonus: 0,
      truckChest: false,
      truckProgress: this.data.truckProgress || 0,
      unlockedTheme: null,
      dailyTaskStamps: 0,
      activityReward: false,
      decorationUnlocked: 0,
      firstClear: false,
      rankBefore,
      rankAfter: rankBefore,
      rankUp: false
    };
    const previousDailyBest = this.data.bestDailyScore || 0;
    const old = themeBest[result.level] || null;
    const firstMainClear = !result.daily && !result.challenge && !(
      old && old.cleared === true || result.level < this.getThemeLevel(themeId)
    );
    summary.firstClear = firstMainClear && result.status === 'won';
    this.data.gamesPlayed += 1;
    this.data.boxesPacked += result.boxesCompleted || 0;

    if (result.daily) {
      if (result.score > this.data.bestDailyScore) {
        this.data.bestDailyScore = result.score;
        this.data.bestDailyDate = dayKey();
      }
      if (result.status === 'won' && this.data.lastDailyClearDate !== dayKey()) {
        summary.dailyBonusCoins = 25;
        this.data.lastDailyClearDate = dayKey();
        this._creditCoins(summary.dailyBonusCoins);
      }
    } else if (result.status === 'won') {
      const oldBest = old || { stars: 0, score: 0 };
      const gainedStars = Math.max(0, result.stars - oldBest.stars);
      this.data.totalStars += gainedStars;
      summary.gainedStars = gainedStars;
      if (firstMainClear) {
        summary.boxCoins = Math.min(8, Math.max(0, Math.floor(Number(result.boxesCompleted) || 0)));
        summary.completionCoins = 8;
        summary.starCoins = result.stars >= 3 ? 8 : (result.stars >= 2 ? 4 : 0);
        this.data.firstClearCount = normalizePoints(this.data.firstClearCount) + 1;
        this.data.truckProgress = (normalizePoints(this.data.truckProgress) + 1) % 3;
        if (this.data.truckProgress === 0) {
          summary.truckChest = true;
          summary.streakBonus = 12;
          this.data.streakChestCount = normalizePoints(this.data.streakChestCount) + 1;
        }
        summary.baseCoins = summary.boxCoins + summary.completionCoins + summary.starCoins + summary.streakBonus;
        this._creditCoins(summary.baseCoins);
        if (this.data.firstClearCount % 25 === 0) {
          summary.rescueTicketBonus += this.addRescueTickets(1, false);
        }
        summary.unlockedTheme = this._syncThemeUnlocks();
      } else if (!result.challenge) {
        const fullReward = 8 + Math.min(8, Math.max(0, Math.floor(Number(result.boxesCompleted) || 0))) +
          (result.stars >= 3 ? 8 : (result.stars >= 2 ? 4 : 0));
        summary.repeatCoins = Math.max(1, Math.floor(fullReward * 0.25));
        summary.baseCoins = summary.repeatCoins;
        this._creditCoins(summary.repeatCoins);
      }
      if (!result.challenge) {
        this.data.winStreak = (this.data.winStreak || 0) + 1;
        summary.winStreak = this.data.winStreak;
      }
      if (!result.challenge || result.level <= this.getThemeLevel(themeId)) {
        this.data.highestLevelByTheme[themeId] = Math.max(this.getThemeLevel(themeId), result.level + 1);
      }
      themeBest[result.level] = {
        stars: Math.max(oldBest.stars, result.stars),
        score: Math.max(oldBest.score, result.score),
        maxBufferUsed: oldBest.maxBufferUsed == null
          ? result.maxBufferUsed
          : Math.min(oldBest.maxBufferUsed, result.maxBufferUsed),
        cleared: Boolean(oldBest.cleared || !result.challenge)
      };
    } else if (!result.daily && result.status === 'failed' && !result.challenge) {
      this.data.winStreak = 0;
      summary.winStreak = 0;
      const completed = Math.max(0, Math.floor(Number(result.boxesCompleted) || 0));
      const total = Math.max(1, Math.floor(Number(result.boxTotal) || completed || 1));
      summary.consolationCoins = completed > 0 ? Math.min(5, Math.max(1, Math.floor(completed / total * 5))) : 0;
      this._creditCoins(summary.consolationCoins);
    }

    summary.adventurePoints = calculateAdventurePoints(result, {
      firstClear: firstMainClear,
      dailyImproved: result.score > previousDailyBest
    });
    this.data.adventurePoints += summary.adventurePoints;

    const taskSummary = this._recordDailyTasks(result);
    summary.dailyTaskStamps = taskSummary.stamps;
    summary.activityReward = taskSummary.activityReward;
    summary.rescueTicketBonus += taskSummary.rescueTicketBonus;
    this._recordPersonalRecords(result);
    const unlockedNode = Math.min(10, Math.floor(normalizePoints(this.data.totalStars) / CONFIG.SHOP_NODE_STARS));
    const decorated = Array.isArray(this.data.warehouseDecorations) ? this.data.warehouseDecorations.length : 0;
    if (unlockedNode > decorated && !this.data.pendingDecorationNode) {
      this.data.pendingDecorationNode = decorated + 1;
      summary.decorationUnlocked = this.data.pendingDecorationNode;
    }
    summary.truckProgress = this.data.truckProgress || 0;
    summary.earnedCoins = summary.baseCoins + summary.dailyBonusCoins + summary.consolationCoins;
    summary.totalPoints = getTotalPoints(this.data);
    summary.rankAfter = getPointRank(summary.totalPoints);
    summary.rankUp = summary.rankAfter.index > summary.rankBefore.index;
    this.save();
    return summary;
  }

  _syncThemeUnlocks() {
    const allowedIndex = Math.min(THEMES.length - 1, Math.floor(normalizePoints(this.data.firstClearCount) / 20));
    let newest = null;
    for (let index = 0; index <= allowedIndex; index += 1) {
      const theme = THEMES[index];
      if (this.data.unlockedThemes.indexOf(theme.id) >= 0) continue;
      this.data.unlockedThemes.push(theme.id);
      this.data.highestLevelByTheme[theme.id] = Math.max(1, this.data.highestLevelByTheme[theme.id] || 1);
      this.data.bestByTheme[theme.id] = this.data.bestByTheme[theme.id] || {};
      this.data.activeThemeId = theme.id;
      newest = theme;
    }
    return newest;
  }

  _ensureDailyTasks(date) {
    const key = dayKey(date || new Date());
    if (this.data.dailyTaskDate === key) return;
    this.data.dailyTaskDate = key;
    this.data.dailyTaskProgress = { play: 0, win: 0, combo: 0 };
    this.data.dailyTaskCompleted = {};
  }

  _recordDailyTasks(result) {
    this._ensureDailyTasks();
    const progress = this.data.dailyTaskProgress;
    progress.play = normalizePoints(progress.play) + 1;
    if (result.status === 'won') progress.win = normalizePoints(progress.win) + 1;
    progress.combo = Math.max(normalizePoints(progress.combo), normalizePoints(result.bestCombo));
    let stamps = 0;
    let rescueTicketBonus = 0;
    let activityReward = false;
    DAILY_TASKS.forEach((task) => {
      if (this.data.dailyTaskCompleted[task.id] || normalizePoints(progress[task.id]) < task.target) return;
      this.data.dailyTaskCompleted[task.id] = true;
      stamps += 1;
      this.data.activityStamps = normalizePoints(this.data.activityStamps) + 1;
      if (this.data.activityStamps >= 7) {
        this.data.activityStamps = 0;
        this.data.activityCycles = normalizePoints(this.data.activityCycles) + 1;
        rescueTicketBonus += this.addRescueTickets(1, false);
        activityReward = true;
      }
    });
    return { stamps, rescueTicketBonus, activityReward };
  }

  getDailyTaskStatus(date) {
    this._ensureDailyTasks(date);
    const progress = this.data.dailyTaskProgress || {};
    const tasks = DAILY_TASKS.map((task) => ({
      id: task.id,
      label: task.label,
      target: task.target,
      progress: Math.min(task.target, normalizePoints(progress[task.id])),
      completed: Boolean(this.data.dailyTaskCompleted && this.data.dailyTaskCompleted[task.id])
    }));
    return {
      dateKey: this.data.dailyTaskDate,
      tasks,
      nearest: tasks.find((task) => !task.completed) || null,
      stamps: normalizePoints(this.data.activityStamps),
      cycles: normalizePoints(this.data.activityCycles)
    };
  }

  _recordPersonalRecords(result) {
    const records = this.data.personalRecords || (this.data.personalRecords = {});
    records.bestCombo = Math.max(normalizePoints(records.bestCombo), normalizePoints(result.bestCombo));
    records.bestWinStreak = Math.max(normalizePoints(records.bestWinStreak), normalizePoints(this.data.winStreak));
    records.bestDailyScore = Math.max(normalizePoints(records.bestDailyScore), result.daily ? normalizePoints(result.score) : 0);
    if (result.status === 'won' && !result.daily) {
      const elapsed = normalizePoints(result.elapsedMs);
      if (elapsed > 0 && (!records.fastestClearMs || elapsed < records.fastestClearMs)) records.fastestClearMs = elapsed;
      records.endlessWave = Math.max(normalizePoints(records.endlessWave), Math.max(0, normalizePoints(result.level) - 60));
    }
  }

  chooseWarehouseDecoration(style) {
    const node = normalizePoints(this.data.pendingDecorationNode);
    if (!node || node > 10) return false;
    const choice = style === 'fresh' ? 'fresh' : 'warm';
    if (!Array.isArray(this.data.warehouseDecorations)) this.data.warehouseDecorations = [];
    const existing = this.data.warehouseDecorations.findIndex((entry) => normalizePoints(entry && entry.node) === node);
    if (existing >= 0) this.data.warehouseDecorations[existing] = { node, style: choice };
    else this.data.warehouseDecorations.push({ node, style: choice });
    this.data.warehouseDecorations = normalizeWarehouseDecorations(this.data.warehouseDecorations);
    this.data.warehouseStyle = choice;
    this.data.pendingDecorationNode = 0;
    this.save();
    return true;
  }

  setWarehouseStyle(style) {
    const choice = style === 'fresh' ? 'fresh' : 'warm';
    const decorations = normalizeWarehouseDecorations(this.data.warehouseDecorations);
    if (!decorations.some((entry) => entry.style === choice)) return false;
    this.data.warehouseDecorations = decorations;
    this.data.warehouseStyle = choice;
    this.save();
    return true;
  }

  claimTruckChestUpgrade() {
    this.data.upgradedTruckChests = normalizePoints(this.data.upgradedTruckChests) + 1;
    this._creditCoins(60);
    this.save();
    return 60;
  }

  claimDailyLogin(date) {
    const currentDate = date || new Date();
    const key = dayKey(currentDate);
    if (this.data.lastLoginDate === key) {
      return {
        claimed: false,
        day: this.data.loginStreak || 1,
        reward: this.data.lastDailyReward || 0
      };
    }
    const previous = new Date(currentDate.getTime());
    previous.setDate(previous.getDate() - 1);
    const continuous = this.data.lastLoginDate === dayKey(previous);
    const day = continuous ? ((this.data.loginStreak || 0) % 7) + 1 : 1;
    const reward = DAILY_LOGIN_REWARDS[day - 1];
    this.data.loginStreak = day;
    this.data.lastLoginDate = key;
    const rescueTicketBonus = day === 7 ? this.addRescueTickets(1, false) : 0;
    this.data.lastDailyReward = reward;
    this._creditCoins(reward);
    this.save();
    return { claimed: true, day, reward, rescueTicketBonus };
  }

  setTutorialComplete(version) {
    this.data.tutorialSeen = true;
    this.data.tutorialVersion = Math.max(this.data.tutorialVersion || 0, Number(version) || 1);
    this.data.tutorialIntroSeen = true;
    this.save();
  }

  hasSeenMechanic(id) {
    return Boolean(id && this.data.seenMechanics && this.data.seenMechanics[id]);
  }

  markMechanicSeen(id) {
    if (!id) return false;
    if (!this.data.seenMechanics || typeof this.data.seenMechanics !== 'object') {
      this.data.seenMechanics = {};
    }
    if (this.data.seenMechanics[id]) return false;
    this.data.seenMechanics[id] = Date.now();
    this.save();
    return true;
  }

  spendCoins(amount) {
    if (this.data.coins < amount) return false;
    this.data.coins -= amount;
    this.save();
    return true;
  }

  addCoins(amount) {
    this._creditCoins(amount);
    this.save();
  }

  _creditCoins(amount) {
    const value = Math.max(0, Math.floor(Number(amount) || 0));
    if (!value) return 0;
    this.data.coins = normalizePoints(this.data.coins) + value;
    return value;
  }

  getCollectionValue() {
    return getCollectionValue(this.data.rareFruits);
  }

  getAutoSellPlan(neededCoins) {
    return createAutoSellPlan(this.data.rareFruits, neededCoins);
  }

  sellCollectibles(entries) {
    const requested = Array.isArray(entries) ? entries : [];
    if (!requested.length) return { sold: false, reason: 'empty', coins: 0 };
    let coins = 0;
    for (let index = 0; index < requested.length; index += 1) {
      const item = requested[index] || {};
      const collectible = COLLECTIBLE_MAP[item.id];
      const entry = this.data.rareFruits[item.id];
      const count = Math.max(1, Math.floor(Number(item.count) || 1));
      if (!collectible || !entry || getOwnedCount(entry) - count < 1) {
        return { sold: false, reason: 'inventory', coins: 0, id: item.id || '' };
      }
      coins += getCollectibleSellValue(collectible) * count;
    }
    requested.forEach((item) => {
      const entry = this.data.rareFruits[item.id];
      const count = Math.max(1, Math.floor(Number(item.count) || 1));
      entry.owned = getOwnedCount(entry) - count;
      entry.sold = normalizePoints(entry.sold) + count;
      this.data.collectiblesSold += count;
    });
    this._creditCoins(coins);
    this.save();
    return { sold: true, coins, collectionValue: this.getCollectionValue() };
  }

  sellCollectible(id, count) {
    return this.sellCollectibles([{ id, count: count || 1 }]);
  }

  getBoosterVoucherCount(type) {
    return normalizePoints(this.data.boosterVouchers && this.data.boosterVouchers[type]);
  }

  consumeBoosterVoucher(type) {
    const count = this.getBoosterVoucherCount(type);
    if (!count) return false;
    this.data.boosterVouchers[type] = count - 1;
    this.save();
    return true;
  }

  buyBoosterVouchers(type, quantity) {
    const cost = BOOSTER_VOUCHER_COSTS[type];
    if (!cost) return { bought: false, reason: 'unknown', cost: 0 };
    const amount = normalizePurchaseQuantity(quantity);
    const owned = this.getBoosterVoucherCount(type);
    if (owned + amount > MAX_BOOSTER_VOUCHERS) {
      return { bought: false, reason: 'max', cost, count: owned, maxOwned: MAX_BOOSTER_VOUCHERS };
    }
    const totalCost = cost * amount;
    if (this.data.coins < totalCost) return { bought: false, reason: 'coins', cost: totalCost, unitCost: cost };
    this.data.coins -= totalCost;
    this.data.boosterVouchers[type] = owned + amount;
    this.save();
    return { bought: true, type, quantity: amount, cost: totalCost, unitCost: cost, count: this.data.boosterVouchers[type] };
  }

  buyBoosterVoucher(type) {
    return this.buyBoosterVouchers(type, 1);
  }

  buyRescueTickets(quantity) {
    const amount = normalizePurchaseQuantity(quantity);
    const owned = clampTickets(this.data.rescueTickets);
    if (owned + amount > MAX_RESCUE_TICKETS) {
      return { bought: false, reason: 'max', cost: RESCUE_TICKET_STORE_COST };
    }
    const totalCost = RESCUE_TICKET_STORE_COST * amount;
    if (this.data.coins < totalCost) {
      return { bought: false, reason: 'coins', cost: totalCost, unitCost: RESCUE_TICKET_STORE_COST };
    }
    this.data.coins -= totalCost;
    this.addRescueTickets(amount, false);
    this.save();
    return { bought: true, quantity: amount, cost: totalCost, unitCost: RESCUE_TICKET_STORE_COST, count: this.data.rescueTickets };
  }

  buyRescueTicket() {
    return this.buyRescueTickets(1);
  }

  getPauseTicketCount() {
    return clampPauseTickets(this.data.pauseTickets);
  }

  consumePauseTicket() {
    const count = this.getPauseTicketCount();
    if (!count) return false;
    this.data.pauseTickets = count - 1;
    this.save();
    return true;
  }

  buyPauseTickets(quantity) {
    return { bought: false, reason: 'free_pause', cost: 0, count: 0, maxOwned: 0 };
  }

  buyStoreProduct(id, quantity) {
    if (id === 'rescue_ticket') return this.buyRescueTickets(quantity);
    if (id === 'pause_ticket') return this.buyPauseTickets(quantity);
    if (typeof id === 'string' && id.indexOf('voucher_') === 0) {
      return this.buyBoosterVouchers(id.slice('voucher_'.length), quantity);
    }
    return { bought: false, reason: 'unknown', cost: 0 };
  }

  getAdCoinStatus(date) {
    const key = dayKey(date || new Date());
    const viewed = this.data.adCoinDate === key
      ? Math.min(AD_COIN_DAILY_LIMIT, normalizePoints(this.data.adCoinViews))
      : 0;
    return {
      dateKey: key,
      viewed,
      remaining: Math.max(0, AD_COIN_DAILY_LIMIT - viewed),
      limit: AD_COIN_DAILY_LIMIT,
      reward: AD_COIN_REWARD
    };
  }

  claimAdCoinReward(date) {
    const status = this.getAdCoinStatus(date);
    if (!status.remaining) return { claimed: false, reason: 'limit', status };
    this.data.adCoinDate = status.dateKey;
    this.data.adCoinViews = status.viewed + 1;
    this._creditCoins(AD_COIN_REWARD);
    this.save();
    return { claimed: true, coins: AD_COIN_REWARD, status: this.getAdCoinStatus(date) };
  }

  creditMatchedItem(points, coins) {
    const gainedPoints = normalizePoints(points);
    const gainedCoins = 0;
    if (!gainedPoints) return { points: 0, coins: 0, totalPoints: getTotalPoints(this.data) };
    this.data.adventurePoints += gainedPoints;
    this.save();
    return { points: gainedPoints, coins: gainedCoins, totalPoints: getTotalPoints(this.data) };
  }

  getNextBufferSlotCost() {
    const current = clampBufferSlots(this.data.bufferSlotsUnlocked);
    if (current >= CONFIG.MAX_BUFFER_SLOTS) return null;
    return CONFIG.BUFFER_SLOT_COSTS[current];
  }

  unlockNextBufferSlot() {
    const current = clampBufferSlots(this.data.bufferSlotsUnlocked);
    const cost = this.getNextBufferSlotCost();
    if (cost == null) return { unlocked: false, reason: 'max', slots: current, cost: 0 };
    if (this.data.coins < cost) return { unlocked: false, reason: 'coins', slots: current, cost };
    this.data.coins -= cost;
    this.data.bufferSlotsUnlocked = current + 1;
    this.save();
    return { unlocked: true, slots: this.data.bufferSlotsUnlocked, cost };
  }

  getRescueStatus(level) {
    const newcomer = Math.max(0, Math.floor(Number(level) || 0)) <= 5
      ? Math.min(2, normalizePoints(this.data.newcomerRescues))
      : 0;
    return { newcomer, tickets: clampTickets(this.data.rescueTickets), total: newcomer + clampTickets(this.data.rescueTickets) };
  }

  spendRescueTicket(level) {
    const status = this.getRescueStatus(level);
    if (status.newcomer > 0) {
      this.data.newcomerRescues = Math.max(0, normalizePoints(this.data.newcomerRescues) - 1);
      this.save();
      return true;
    }
    if ((this.data.rescueTickets || 0) <= 0) return false;
    this.data.rescueTickets -= 1;
    this.save();
    return true;
  }

  addRescueTickets(amount, shouldSave) {
    const before = clampTickets(this.data.rescueTickets);
    const next = clampTickets(before + Math.max(0, Math.floor(Number(amount) || 0)));
    const gained = next - before;
    this.data.rescueTickets = next;
    this.data.rescueTicketsEarned = normalizePoints(this.data.rescueTicketsEarned) + gained;
    if (shouldSave !== false) this.save();
    return gained;
  }

  collectCollectible(id, level) {
    const collectible = COLLECTIBLE_MAP[id];
    if (!collectible) return null;
    const current = this.data.rareFruits[id] || null;
    const discoveredBefore = countAllDiscoveredCollectibles(this.data.rareFruits);
    const rankBefore = getPointRank(getTotalPoints(this.data));
    const now = Date.now();
    const entry = {
      count: (current && current.count || 0) + 1,
      owned: getOwnedCount(current) + 1,
      sold: normalizePoints(current && current.sold),
      firstFoundAt: current && current.firstFoundAt || now,
      lastFoundAt: now,
      firstFoundLevel: current && current.firstFoundLevel || Math.max(1, Number(level) || 1),
      themeId: collectible.themeId
    };
    this.data.rareFruits[id] = entry;
    this.data.collectibleTotal += 1;
    this.data.lastCollectibleId = id;
    const points = current ? collectible.duplicatePoints : collectible.firstPoints;
    this.data.collectionPoints += points;
    let rescueTicketBonus = 0;
    const discoveredAfter = discoveredBefore + (!current ? 1 : 0);
    if (!current && discoveredAfter % 20 === 0) rescueTicketBonus = this.addRescueTickets(1, false);

    const themeProgress = getThemeProgress(collectible.themeId, this.data.rareFruits);
    const unlockedTheme = null;
    let cosmeticTitle = '';
    if (!current && themeProgress.complete) {
      cosmeticTitle = `${getTheme(collectible.themeId).shortName}馆长`;
      if (this.data.cosmeticTitles.indexOf(cosmeticTitle) < 0) this.data.cosmeticTitles.push(cosmeticTitle);
    }

    const totalPoints = getTotalPoints(this.data);
    const rankAfter = getPointRank(totalPoints);
    const coinRule = COLLECTIBLE_COIN_REWARDS[collectible.rarity] || COLLECTIBLE_COIN_REWARDS.rare;
    const coinBonus = current ? coinRule.duplicate : coinRule.first;
    this.save();
    return {
      isNew: !current,
      count: entry.count,
      entry,
      points,
      coinBonus,
      collectionPoints: this.data.collectionPoints,
      fruitPoints: this.data.collectionPoints,
      totalPoints,
      rescueTicketBonus,
      rankBefore,
      rankAfter,
      rankUp: rankAfter.index > rankBefore.index,
      themeProgress,
      themeCompleted: !current && themeProgress.complete,
      cosmeticTitle,
      unlockedTheme
    };
  }

  collectRareFruit(id, level) {
    return this.collectCollectible(id, level);
  }

  setPreference(key, value) {
    if (key !== 'soundEnabled' && key !== 'musicEnabled' && key !== 'reducedMotion') return;
    this.data[key] = Boolean(value);
    this.save();
  }
}

function normalizeWarehouseDecorations(source) {
  const byNode = Object.create(null);
  (Array.isArray(source) ? source : []).forEach((entry) => {
    const node = Math.min(10, normalizePoints(entry && entry.node));
    if (!node) return;
    byNode[node] = { node, style: entry && entry.style === 'fresh' ? 'fresh' : 'warm' };
  });
  return Object.keys(byNode)
    .map((node) => byNode[node])
    .sort((a, b) => a.node - b.node)
    .slice(0, 10);
}

function cloneDefault() {
  return Object.assign({}, DEFAULT_DATA, {
    unlockedThemes: ['fruit'],
    highestLevelByTheme: { fruit: 1 },
    bestByTheme: { fruit: {} },
    themePity: { fruit: 0 },
    lastCollectibleRollKeyByTheme: {},
    seenMechanics: {},
    boosterVouchers: normalizeVouchers(),
    dailyTaskProgress: { play: 0, win: 0, combo: 0 },
    dailyTaskCompleted: {},
    personalRecords: Object.assign({}, DEFAULT_DATA.personalRecords),
    warehouseDecorations: [],
    cosmeticTitles: [],
    bestByLevel: {},
    rareFruits: {}
  });
}

function cloneCollection(source) {
  const result = {};
  Object.keys(source || {}).forEach((id) => {
    const entry = source[id] || {};
    result[id] = Object.assign({}, entry, {
      count: normalizePoints(entry.count),
      owned: entry.owned == null ? normalizePoints(entry.count) : normalizePoints(entry.owned),
      sold: normalizePoints(entry.sold)
    });
  });
  return result;
}

function normalizeVouchers(source) {
  const data = source || {};
  return {
    hint: normalizePoints(data.hint),
    shuffle: normalizePoints(data.shuffle),
    add_time: normalizePoints(data.add_time),
    auto_pack: normalizePoints(data.auto_pack)
  };
}

function cloneBestByTheme(source) {
  const result = {};
  Object.keys(source || {}).forEach((themeId) => {
    result[themeId] = Object.assign({}, source[themeId] || {});
  });
  return result;
}

function normalizeUnlockedThemes(source, collection, firstClearCount, allowLegacyCollectionUnlock) {
  const requested = Array.isArray(source) ? source : [];
  const unlocked = ['fruit'];
  // 早期存档只有 5 个主题。升级后如果旧存档已经开启了后段主题，补齐它
  // 前面的新主题，避免升级导致玩家突然失去已经获得的展馆访问权。
  const highestRequestedIndex = requested.reduce((highest, themeId) => {
    const index = THEMES.findIndex((theme) => theme.id === themeId);
    return Math.max(highest, index);
  }, 0);
  const progressionIndex = Math.min(THEMES.length - 1, Math.floor(normalizePoints(firstClearCount) / 20));
  for (let i = 1; i < THEMES.length; i += 1) {
    const previous = THEMES[i - 1];
    const theme = THEMES[i];
    if (i <= Math.max(highestRequestedIndex, progressionIndex) || requested.indexOf(theme.id) >= 0 || (allowLegacyCollectionUnlock && isThemeComplete(previous.id, collection))) unlocked.push(theme.id);
    else break;
  }
  return unlocked;
}

function syncLegacyAliases(data) {
  const active = normalizeThemeId(data.activeThemeId || 'fruit');
  data.activeThemeId = active;
  data.highestLevel = Math.max(1, Math.floor(Number(data.highestLevelByTheme[active]) || 1));
  data.bestByLevel = data.bestByTheme[active] || {};
  data.collectionPoints = normalizePoints(data.collectionPoints);
  data.fruitPoints = data.collectionPoints;
  data.collectibleTotal = normalizePoints(data.collectibleTotal);
  data.rareFruitTotal = data.collectibleTotal;
  data.lastRareFruitId = data.lastCollectibleId || '';
  data.totalPoints = getTotalPoints(data);
}

function clampTickets(value) {
  return Math.min(MAX_RESCUE_TICKETS, Math.max(0, Math.floor(Number(value) || 0)));
}

function clampPauseTickets(value) {
  return 0;
}

function normalizePurchaseQuantity(value) {
  return Math.min(MAX_STORE_PURCHASE_QUANTITY, Math.max(1, Math.floor(Number(value) || 1)));
}

function clampBufferSlots(value) {
  return Math.min(CONFIG.MAX_BUFFER_SLOTS, Math.max(1, Math.floor(Number(value) || 1)));
}

function calculateCollectionPoints(collection) {
  const data = collection || {};
  return COLLECTIBLES.reduce((sum, collectible) => {
    const count = Math.max(0, Math.floor(Number(data[collectible.id] && data[collectible.id].count) || 0));
    if (!count) return sum;
    return sum + collectible.firstPoints + Math.max(0, count - 1) * collectible.duplicatePoints;
  }, 0);
}

function estimateLegacyAdventurePoints(raw) {
  const highest = Math.max(1, Math.floor(Number(raw.highestLevel) || 1));
  const stars = normalizePoints(raw.totalStars);
  const boxes = normalizePoints(raw.boxesPacked);
  return Math.max(0, (highest - 1) * 120 + stars * 40 + boxes * 8);
}

function estimateFirstClearCount(data) {
  const bestByTheme = data && data.bestByTheme || {};
  let cleared = 0;
  Object.keys(bestByTheme).forEach((themeId) => {
    cleared += Object.keys(bestByTheme[themeId] || {}).filter((level) => (
      bestByTheme[themeId][level] && bestByTheme[themeId][level].cleared !== false
    )).length;
  });
  const levels = Object.values(data && data.highestLevelByTheme || {});
  const highestProgress = Math.max(0, ...levels.map((value) => Math.max(0, Math.floor(Number(value) || 1) - 1)));
  return Math.max(cleared, highestProgress);
}

module.exports = {
  DEFAULT_DATA,
  DAILY_TASKS,
  MAX_RESCUE_TICKETS,
  Storage
};
