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
  version: 8,
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
  rescueTickets: 3,
  rescueTicketsEarned: 0,
  pauseTickets: 2,
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
  lastPlayedAt: 0
});

const DAILY_LOGIN_REWARDS = Object.freeze([20, 25, 30, 35, 45, 60, 90]);
const MAX_RESCUE_TICKETS = 9;

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
      boosterVouchers: normalizeVouchers(raw.boosterVouchers)
    });

    if (!Object.keys(data.highestLevelByTheme).length) data.highestLevelByTheme.fruit = Math.max(1, Math.floor(Number(raw.highestLevel) || 1));
    if (!data.highestLevelByTheme.fruit) data.highestLevelByTheme.fruit = Math.max(1, Math.floor(Number(raw.highestLevel) || 1));
    if (!Object.keys(data.bestByTheme).length) data.bestByTheme.fruit = Object.assign({}, raw.bestByLevel || {});
    if (!data.bestByTheme.fruit) data.bestByTheme.fruit = Object.assign({}, raw.bestByLevel || {});

    data.unlockedThemes = normalizeUnlockedThemes(raw.unlockedThemes, data.rareFruits);
    const requestedActive = raw.activeThemeId && data.unlockedThemes.indexOf(raw.activeThemeId) >= 0
      ? raw.activeThemeId
      : data.unlockedThemes[data.unlockedThemes.length - 1];
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
    data.rescueTicketsEarned = normalizePoints(data.rescueTicketsEarned);
    data.pauseTickets = clampPauseTickets(raw.pauseTickets == null ? DEFAULT_DATA.pauseTickets : raw.pauseTickets);
    data.adCoinDate = typeof raw.adCoinDate === 'string' ? raw.adCoinDate : '';
    data.adCoinViews = Math.min(AD_COIN_DAILY_LIMIT, normalizePoints(raw.adCoinViews));
    data.bufferSlotsUnlocked = clampBufferSlots(raw.bufferSlotsUnlocked == null ? 1 : raw.bufferSlotsUnlocked);
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
    this.data.pauseTickets = clampPauseTickets(this.data.pauseTickets);
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
    const summary = {
      gainedStars: 0,
      baseCoins: 0,
      completionCoins: 0,
      starCoins: 0,
      dailyBonusCoins: 0,
      streakBonus: 0,
      earnedCoins: Math.max(0, Math.floor(Number(result.packingCoinsEarned) || 0)),
      winStreak: this.data.winStreak || 0,
      adventurePoints: 0,
      totalPoints: getTotalPoints(this.data),
      rescueTicketBonus: 0,
      rankBefore: getPointRank(this.data.coins),
      rankAfter: getPointRank(this.data.coins),
      rankUp: false
    };
    const previousDailyBest = this.data.bestDailyScore || 0;
    const old = themeBest[result.level] || null;
    const firstMainClear = !result.daily && !result.challenge && !(
      old && old.cleared === true || result.level < this.getThemeLevel(themeId)
    );
    this.data.gamesPlayed += 1;
    this.data.boxesPacked += result.boxesCompleted || 0;

    if (result.daily) {
      if (result.score > this.data.bestDailyScore) {
        this.data.bestDailyScore = result.score;
        this.data.bestDailyDate = dayKey();
      }
      if (result.status === 'won' && this.data.lastDailyClearDate !== dayKey()) {
        summary.dailyBonusCoins = 60;
        this.data.lastDailyClearDate = dayKey();
        this._creditCoins(summary.dailyBonusCoins);
      }
    } else if (result.status === 'won') {
      const oldBest = old || { stars: 0, score: 0 };
      const gainedStars = Math.max(0, result.stars - oldBest.stars);
      this.data.totalStars += gainedStars;
      summary.gainedStars = gainedStars;
      summary.completionCoins = 20;
      summary.starCoins = Math.max(0, Math.floor(Number(result.stars) || 0)) * 10;
      summary.baseCoins = summary.completionCoins + summary.starCoins;
      this._creditCoins(summary.baseCoins);
      if (!result.challenge) {
        this.data.winStreak = (this.data.winStreak || 0) + 1;
        summary.winStreak = this.data.winStreak;
        if (this.data.winStreak % 3 === 0) {
          summary.streakBonus = 50;
          this._creditCoins(summary.streakBonus);
          this.data.streakChestCount = (this.data.streakChestCount || 0) + 1;
        }
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
    }

    summary.adventurePoints = calculateAdventurePoints(result, {
      firstClear: firstMainClear,
      dailyImproved: result.score > previousDailyBest
    });
    this.data.adventurePoints += summary.adventurePoints;

    if (result.status === 'won' && firstMainClear && result.level % 10 === 0) {
      summary.rescueTicketBonus = this.addRescueTickets(1, false);
    }
    summary.earnedCoins += summary.baseCoins + summary.dailyBonusCoins + summary.streakBonus;
    summary.totalPoints = getTotalPoints(this.data);
    summary.rankAfter = getPointRank(this.data.coins);
    summary.rankUp = summary.rankAfter.index > summary.rankBefore.index;
    this.save();
    return summary;
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
      if (!collectible || !entry || getOwnedCount(entry) < count) {
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
    const amount = normalizePurchaseQuantity(quantity);
    const owned = this.getPauseTicketCount();
    if (owned + amount > MAX_PAUSE_TICKETS) {
      return { bought: false, reason: 'max', cost: PAUSE_TICKET_STORE_COST, count: owned, maxOwned: MAX_PAUSE_TICKETS };
    }
    const totalCost = PAUSE_TICKET_STORE_COST * amount;
    if (this.data.coins < totalCost) {
      return { bought: false, reason: 'coins', cost: totalCost, unitCost: PAUSE_TICKET_STORE_COST };
    }
    this.data.coins -= totalCost;
    this.data.pauseTickets = owned + amount;
    this.save();
    return { bought: true, quantity: amount, cost: totalCost, unitCost: PAUSE_TICKET_STORE_COST, count: this.data.pauseTickets };
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
    const gainedCoins = normalizePoints(coins);
    if (!gainedPoints && !gainedCoins) return { points: 0, coins: 0, totalPoints: getTotalPoints(this.data) };
    this.data.adventurePoints += gainedPoints;
    this._creditCoins(gainedCoins);
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

  spendRescueTicket() {
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
    const rankBefore = getPointRank(this.data.coins);
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
    if (!current && discoveredAfter % 10 === 0) rescueTicketBonus = this.addRescueTickets(1, false);

    const themeProgress = getThemeProgress(collectible.themeId, this.data.rareFruits);
    let unlockedTheme = null;
    if (!current && themeProgress.complete) {
      const nextTheme = getNextTheme(collectible.themeId);
      const themeIndex = THEMES.findIndex((theme) => theme.id === collectible.themeId);
      const previousComplete = THEMES.slice(0, themeIndex + 1).every((theme) => isThemeComplete(theme.id, this.data.rareFruits));
      if (nextTheme && previousComplete && this.data.unlockedThemes.indexOf(nextTheme.id) < 0) {
        this.data.unlockedThemes.push(nextTheme.id);
        this.data.activeThemeId = nextTheme.id;
        this.data.highestLevelByTheme[nextTheme.id] = Math.max(1, this.data.highestLevelByTheme[nextTheme.id] || 1);
        this.data.bestByTheme[nextTheme.id] = this.data.bestByTheme[nextTheme.id] || {};
        unlockedTheme = nextTheme;
      }
    }

    const totalPoints = getTotalPoints(this.data);
    const rankAfter = getPointRank(this.data.coins);
    this.save();
    return {
      isNew: !current,
      count: entry.count,
      entry,
      points,
      collectionPoints: this.data.collectionPoints,
      fruitPoints: this.data.collectionPoints,
      totalPoints,
      rescueTicketBonus,
      rankBefore,
      rankAfter,
      rankUp: rankAfter.index > rankBefore.index,
      themeProgress,
      themeCompleted: !current && themeProgress.complete,
      unlockedTheme
    };
  }

  collectRareFruit(id, level) {
    return this.collectCollectible(id, level);
  }

  setPreference(key, value) {
    if (key !== 'soundEnabled' && key !== 'musicEnabled') return;
    this.data[key] = Boolean(value);
    this.save();
  }
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

function normalizeUnlockedThemes(source, collection) {
  const requested = Array.isArray(source) ? source : [];
  const unlocked = ['fruit'];
  // 早期存档只有 5 个主题。升级后如果旧存档已经开启了后段主题，补齐它
  // 前面的新主题，避免升级导致玩家突然失去已经获得的展馆访问权。
  const highestRequestedIndex = requested.reduce((highest, themeId) => {
    const index = THEMES.findIndex((theme) => theme.id === themeId);
    return Math.max(highest, index);
  }, 0);
  for (let i = 1; i < THEMES.length; i += 1) {
    const previous = THEMES[i - 1];
    const theme = THEMES[i];
    if (i <= highestRequestedIndex || requested.indexOf(theme.id) >= 0 || isThemeComplete(previous.id, collection)) unlocked.push(theme.id);
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
  return Math.min(MAX_PAUSE_TICKETS, Math.max(0, Math.floor(Number(value) || 0)));
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

module.exports = {
  DEFAULT_DATA,
  MAX_RESCUE_TICKETS,
  Storage
};
