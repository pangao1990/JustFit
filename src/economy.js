'use strict';

const { COLLECTIBLES, COLLECTIBLE_MAP } = require('./theme-collectibles');

const FEATURE_UNLOCK_LEVELS = Object.freeze({
  daily: 5,
  museum: 5,
  friendRank: 5,
  store: 8
});

const REVIVE_COIN_COST = 600;
const RESCUE_TICKET_STORE_COST = 540;
// 暂停现在永久免费。保留旧常量与存档读取只为兼容已经购买过暂停券的玩家。
const PAUSE_TICKET_STORE_COST = 0;
const MAX_PAUSE_TICKETS = 0;
const MAX_BOOSTER_VOUCHERS = 99;
const AD_COIN_REWARD = 60;
const AD_COIN_DAILY_LIMIT = 2;
const MAX_STORE_PURCHASE_QUANTITY = 10;

const BOOSTER_COIN_COSTS = Object.freeze({
  hint: 120,
  shuffle: 180,
  add_time: 260,
  auto_pack: 360
});

// 在商店提前备货会比关卡内临时购买略便宜，鼓励玩家主动规划，
// 但折扣不大到足以破坏金币消耗节奏。
const BOOSTER_VOUCHER_COSTS = Object.freeze({
  hint: 108,
  shuffle: 162,
  add_time: 234,
  auto_pack: 324
});

const RARITY_SELL_VALUES = Object.freeze({
  rare: 4,
  epic: 7,
  legendary: 12,
  mythic: 20
});

const STORE_PRODUCT_DEFINITIONS = Object.freeze({
  rescue_ticket: Object.freeze({
    id: 'rescue_ticket',
    label: '救援券',
    icon: 'ticket',
    color: '#FF786B',
    unitCost: RESCUE_TICKET_STORE_COST,
    maxOwned: 3,
    description: '失败后复活 1 次，每局最多使用 1 次。'
  }),
  voucher_hint: Object.freeze({
    id: 'voucher_hint',
    label: '提示券',
    icon: 'hint',
    color: '#D99D2D',
    unitCost: BOOSTER_VOUCHER_COSTS.hint,
    maxOwned: MAX_BOOSTER_VOUCHERS,
    description: '标出一个当前可以安全收集的物件。'
  }),
  voucher_shuffle: Object.freeze({
    id: 'voucher_shuffle',
    label: '整理券',
    icon: 'shuffle',
    color: '#D97846',
    unitCost: BOOSTER_VOUCHER_COSTS.shuffle,
    maxOwned: MAX_BOOSTER_VOUCHERS,
    description: '重新排列所有货架的顶层物件。'
  }),
  voucher_add_time: Object.freeze({
    id: 'voucher_add_time',
    label: '+15 秒',
    icon: 'time',
    color: '#278F82',
    unitCost: BOOSTER_VOUCHER_COSTS.add_time,
    maxOwned: MAX_BOOSTER_VOUCHERS,
    description: '关卡内立即增加 15 秒。'
  }),
  voucher_auto_pack: Object.freeze({
    id: 'voucher_auto_pack',
    label: '自动收集',
    icon: 'auto',
    color: '#7458C7',
    unitCost: BOOSTER_VOUCHER_COSTS.auto_pack,
    maxOwned: MAX_BOOSTER_VOUCHERS,
    description: '自动收集最多 4 件安全目标，不会虚增连击。'
  })
});

function getStoreProductDefinition(id) {
  return STORE_PRODUCT_DEFINITIONS[id] || null;
}

function getAccountProgressLevel(data) {
  const levels = Object.values(data && data.highestLevelByTheme || {});
  return Math.max(1, ...levels.map((value) => Math.max(1, Math.floor(Number(value) || 1))));
}

function isFeatureUnlocked(data, feature) {
  const required = FEATURE_UNLOCK_LEVELS[feature];
  if (!required) return true;
  return getAccountProgressLevel(data) >= required;
}

function getOwnedCount(entry) {
  if (!entry) return 0;
  const value = entry.owned == null ? entry.count : entry.owned;
  return Math.max(0, Math.floor(Number(value) || 0));
}

function getCollectibleSellValue(collectibleOrId) {
  const collectible = typeof collectibleOrId === 'string'
    ? COLLECTIBLE_MAP[collectibleOrId]
    : collectibleOrId;
  if (!collectible) return 0;
  const base = RARITY_SELL_VALUES[collectible.rarity] || RARITY_SELL_VALUES.rare;
  const progressBonus = Math.min(4, Math.floor(Math.max(0, collectible.minLevel - 4) / 45));
  return base + progressBonus;
}

function getCollectionValue(collection) {
  const data = collection || {};
  return COLLECTIBLES.reduce((sum, collectible) => (
    sum + Math.max(0, getOwnedCount(data[collectible.id]) - 1) * getCollectibleSellValue(collectible)
  ), 0);
}

function getSellableCollectibles(collection) {
  const data = collection || {};
  return COLLECTIBLES
    .map((collectible) => {
      const entry = data[collectible.id] || null;
      return {
        collectible,
        entry,
        owned: getOwnedCount(entry),
        unitValue: getCollectibleSellValue(collectible)
      };
    })
    // 最后一件永远留在藏馆，只允许回收重复件，避免玩家误操作破坏收藏感。
    .filter((item) => item.owned > 1)
    .sort((a, b) => {
      const aDuplicate = a.owned > 1 ? 0 : 1;
      const bDuplicate = b.owned > 1 ? 0 : 1;
      return aDuplicate - bDuplicate ||
        Number(b.entry && b.entry.lastFoundAt || 0) - Number(a.entry && a.entry.lastFoundAt || 0) ||
        a.unitValue - b.unitValue;
    });
}

function createAutoSellPlan(collection, neededCoins) {
  const required = Math.max(0, Math.floor(Number(neededCoins) || 0));
  if (!required) return { required: 0, total: 0, entries: [] };

  const data = collection || {};
  const copies = [];
  getSellableCollectibles(data).forEach((item) => {
    for (let index = 0; index < item.owned - 1; index += 1) {
      copies.push({
        id: item.collectible.id,
        collectible: item.collectible,
        unitValue: item.unitValue,
        priority: 0
      });
    }
  });
  copies.sort((a, b) => a.priority - b.priority || a.unitValue - b.unitValue || a.collectible.minLevel - b.collectible.minLevel);

  const selected = [];
  let total = 0;
  for (let index = 0; index < copies.length && total < required; index += 1) {
    selected.push(copies[index]);
    total += copies[index].unitValue;
  }
  if (total < required) return null;

  const grouped = [];
  selected.forEach((copy) => {
    const existing = grouped.find((entry) => entry.id === copy.id);
    if (existing) existing.count += 1;
    else grouped.push({
      id: copy.id,
      collectible: copy.collectible,
      count: 1,
      unitValue: copy.unitValue,
      value: 0
    });
  });
  grouped.forEach((entry) => { entry.value = entry.count * entry.unitValue; });
  return { required, total, entries: grouped };
}

module.exports = {
  AD_COIN_DAILY_LIMIT,
  AD_COIN_REWARD,
  BOOSTER_COIN_COSTS,
  BOOSTER_VOUCHER_COSTS,
  FEATURE_UNLOCK_LEVELS,
  MAX_BOOSTER_VOUCHERS,
  MAX_PAUSE_TICKETS,
  MAX_STORE_PURCHASE_QUANTITY,
  PAUSE_TICKET_STORE_COST,
  RARITY_SELL_VALUES,
  RESCUE_TICKET_STORE_COST,
  REVIVE_COIN_COST,
  STORE_PRODUCT_DEFINITIONS,
  createAutoSellPlan,
  getAccountProgressLevel,
  getCollectibleSellValue,
  getCollectionValue,
  getOwnedCount,
  getSellableCollectibles,
  getStoreProductDefinition,
  isFeatureUnlocked
};
