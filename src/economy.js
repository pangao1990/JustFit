'use strict';

const { COLLECTIBLES, COLLECTIBLE_MAP } = require('./theme-collectibles');

const FEATURE_UNLOCK_LEVELS = Object.freeze({
  daily: 5,
  museum: 5,
  friendRank: 5,
  store: 8
});

const REVIVE_COIN_COST = 180;
const RESCUE_TICKET_STORE_COST = 240;
const PAUSE_TICKET_STORE_COST = 70;
const MAX_PAUSE_TICKETS = 12;
const MAX_BOOSTER_VOUCHERS = 99;
const AD_COIN_REWARD = 30;
const AD_COIN_DAILY_LIMIT = 3;
const MAX_STORE_PURCHASE_QUANTITY = 10;

const BOOSTER_COIN_COSTS = Object.freeze({
  hint: 30,
  shuffle: 50,
  add_time: 90,
  auto_pack: 150
});

// 在商店提前备货会比关卡内临时购买略便宜，鼓励玩家主动规划，
// 但折扣不大到足以破坏金币消耗节奏。
const BOOSTER_VOUCHER_COSTS = Object.freeze({
  hint: 28,
  shuffle: 46,
  add_time: 82,
  auto_pack: 135
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
    maxOwned: 9,
    description: '失败后复活 1 次，每局最多使用 1 次。'
  }),
  pause_ticket: Object.freeze({
    id: 'pause_ticket',
    label: '暂停券',
    icon: 'pause',
    color: '#3E9FD6',
    unitCost: PAUSE_TICKET_STORE_COST,
    maxOwned: MAX_PAUSE_TICKETS,
    description: '每关首次暂停免费，之后每次暂停消耗 1 张。'
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
    description: '自动收集最多 4 件安全目标。'
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
    sum + getOwnedCount(data[collectible.id]) * getCollectibleSellValue(collectible)
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
    .filter((item) => item.owned > 0)
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
    // 先选择重复件，只有重复件不够时才选择最后一件。图鉴发现记录永久保留，
    // 因此出售最后一件也不会让已经点亮的轮廓重新变灰。
    for (let index = 0; index < item.owned; index += 1) {
      copies.push({
        id: item.collectible.id,
        collectible: item.collectible,
        unitValue: item.unitValue,
        priority: index < item.owned - 1 ? 0 : 1
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
