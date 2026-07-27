'use strict';

const { clamp } = require('./utils');

const RARE_PREFIX = 'rare:';

const RARITY_COLORS = Object.freeze({
  rare: '#45A9DD',
  epic: '#9A64DD',
  legendary: '#E69A25',
  mythic: '#E34F86'
});

const RARITY_NAMES = Object.freeze({
  rare: '稀有',
  epic: '史诗',
  legendary: '传说',
  mythic: '神话'
});

const RARITY_WEIGHTS = Object.freeze({ rare: 30, epic: 18, legendary: 9, mythic: 4 });
const RARITY_FIRST_BONUS = Object.freeze({ rare: 40, epic: 70, legendary: 115, mythic: 180 });
const RARITY_DUPLICATE_BONUS = Object.freeze({ rare: 10, epic: 16, legendary: 25, mythic: 38 });
const RARITY_FIRST_POINTS = Object.freeze({ rare: 300, epic: 700, legendary: 1400, mythic: 2500 });
const RARITY_DUPLICATE_POINTS = Object.freeze({ rare: 30, epic: 80, legendary: 180, mythic: 360 });

const FRUIT_MASTERY = Object.freeze([
  { count: 1, name: '初次点亮', crown: 0 },
  { count: 3, name: '青铜珍藏', crown: 1 },
  { count: 7, name: '白银珍藏', crown: 2 },
  { count: 15, name: '黄金珍藏', crown: 3 },
  { count: 30, name: '星冠珍藏', crown: 4 }
]);

const ASSETS = Object.freeze({
  starlight_strawberry: 'starlight-strawberry.png',
  moon_grapes: 'moon-grapes.png',
  crystal_pear: 'crystal-pear.png',
  flame_dragonfruit: 'flame-dragonfruit.png',
  aurora_kiwi: 'aurora-kiwi.png',
  golden_pineapple: 'golden-pineapple.png',
  galaxy_watermelon: 'galaxy-watermelon.png',
  rainbow_mangosteen: 'rainbow-mangosteen.png'
});

const ORIGINAL_BONUSES = Object.freeze({
  starlight_strawberry: [40, 10],
  moon_grapes: [50, 12],
  crystal_pear: [70, 16],
  flame_dragonfruit: [90, 20],
  aurora_kiwi: [120, 26],
  golden_pineapple: [150, 32],
  galaxy_watermelon: [200, 42],
  rainbow_mangosteen: [260, 55]
});

// 56 种珍果按最低关卡排序。只有最初 8 种使用独立 PNG，其余珍果由 Canvas
// 根据 shape + motif 实时绘制，避免收藏数量增长时包体同步膨胀。
const FRUIT_SPECS = Object.freeze([
  ['starlight_strawberry', '星辉草莓', 'rare', 4, '#F45B72', '#63BC75', '#FFD76A', 'strawberry', 'star'],
  ['moon_grapes', '月光葡萄', 'rare', 8, '#7469E8', '#76C79A', '#BDE8FF', 'grapes', 'moon'],
  ['comet_cherry', '彗星樱桃', 'rare', 10, '#ED4E68', '#62B875', '#FFD56C', 'cherry', 'comet'],
  ['crystal_pear', '水晶梨', 'epic', 13, '#77D9E1', '#F4CE63', '#FFF2A6', 'pear', 'crystal'],
  ['frost_persimmon', '霜糖柿子', 'rare', 16, '#F18A45', '#7FC36A', '#D7F6FF', 'round', 'frost'],
  ['flame_dragonfruit', '焰心火龙果', 'epic', 20, '#F35B72', '#FFB248', '#FFB248', 'dragonfruit', 'flame'],
  ['pearl_lychee', '珍珠荔枝', 'epic', 24, '#EF8799', '#FFF2D5', '#FFF1C7', 'cluster', 'pearl'],
  ['aurora_kiwi', '极光奇异果', 'legendary', 28, '#58C982', '#E5F29B', '#7BE7E4', 'kiwi', 'aurora'],
  ['cloud_peach', '云朵蜜桃', 'rare', 32, '#F69A9B', '#F7D7E8', '#FFF1F2', 'peach', 'cloud'],
  ['golden_pineapple', '皇冠金菠萝', 'legendary', 38, '#F3B83F', '#59B87B', '#FFF2A1', 'pineapple', 'crown'],
  ['jade_waxapple', '翡翠莲雾', 'epic', 42, '#58C99A', '#B7F1D1', '#A8F4D8', 'pear', 'jade'],
  ['amber_orange', '琥珀橙', 'rare', 46, '#EE9844', '#FFD27A', '#FFE7A4', 'citrus', 'amber'],
  ['galaxy_watermelon', '星河西瓜', 'mythic', 50, '#36488F', '#75E5D3', '#75E5D3', 'watermelon', 'galaxy'],
  ['laurel_mango', '月桂芒果', 'epic', 55, '#F3B543', '#79BC63', '#FFF1A2', 'pear', 'moon'],
  ['prism_plum', '棱镜青李', 'legendary', 60, '#7B68D8', '#78D8D2', '#D4C6FF', 'round', 'prism'],
  ['rainbow_mangosteen', '彩虹山竹', 'mythic', 65, '#8D55C7', '#FF9DCB', '#FF9DCB', 'mangosteen', 'rainbow'],
  ['ice_blueberry', '冰晶蓝莓', 'epic', 70, '#536ECA', '#A9E7FF', '#B9EEFF', 'cluster', 'frost'],
  ['corona_lemon', '日冕柠檬', 'legendary', 75, '#EFD248', '#FF9F45', '#FFF19A', 'citrus', 'sun'],
  ['tide_coconut', '海潮椰子', 'epic', 80, '#9B704F', '#57C7C6', '#A7F2ED', 'shell', 'ocean'],
  ['violet_fig', '紫晶无花果', 'legendary', 85, '#8A58C2', '#E2B7F5', '#E9C9FF', 'pear', 'violet'],
  ['phoenix_peach', '凤凰桃', 'mythic', 90, '#F06F79', '#FFB047', '#FFD16F', 'peach', 'flame'],
  ['nebula_fig', '星云无花果', 'epic', 95, '#6654AC', '#D77CD9', '#B9A7FF', 'pear', 'nebula'],
  ['meteor_starfruit', '流星杨桃', 'legendary', 100, '#E9B73B', '#FFED9C', '#FFF0A1', 'starfruit', 'comet'],
  ['white_jade_guava', '白玉番石榴', 'epic', 105, '#92D69D', '#FFF4E0', '#D8FFE1', 'pear', 'pearl'],
  ['dawn_papaya', '霞光木瓜', 'epic', 110, '#E98252', '#FFD05D', '#FFD3A0', 'pear', 'dawn'],
  ['thunder_durian', '雷鸣榴莲', 'mythic', 115, '#B7A34A', '#F2D95E', '#FFF08C', 'spiky', 'lightning'],
  ['coral_pomegranate', '珊瑚石榴', 'legendary', 120, '#D94E66', '#FF9C83', '#FFB5A5', 'shell', 'coral'],
  ['starsand_passionfruit', '星砂百香果', 'epic', 125, '#8C59B5', '#F1C85D', '#F4D98D', 'citrus', 'star'],
  ['moon_avocado', '月影牛油果', 'legendary', 130, '#5EA85D', '#D7E46F', '#DFF7A0', 'pear', 'moon'],
  ['ruby_raspberry', '红宝石树莓', 'epic', 135, '#CA375D', '#FF7F9D', '#FFB4C1', 'cluster', 'ruby'],
  ['blueflame_banana', '蓝焰香蕉', 'legendary', 140, '#E5C14B', '#5F99DF', '#8FD8FF', 'banana', 'flame'],
  ['snow_melon', '雪绒蜜瓜', 'epic', 145, '#9ACB8F', '#EAF8DF', '#F3FFF0', 'melon', 'snow'],
  ['oasis_melon', '绿洲哈密瓜', 'epic', 150, '#75B85F', '#F5DD7B', '#C9F2A3', 'melon', 'oasis'],
  ['night_mulberry', '夜光桑葚', 'legendary', 155, '#5B438D', '#B376D4', '#CEACFF', 'cluster', 'night'],
  ['golden_loquat', '金铃枇杷', 'epic', 160, '#EBAF3E', '#FFE59B', '#FFF0AC', 'round', 'gold'],
  ['neon_rambutan', '霓虹红毛丹', 'legendary', 165, '#E8527E', '#6BE0C1', '#FF9CC5', 'spiky', 'neon'],
  ['cloud_sugarapple', '云海释迦', 'mythic', 170, '#8DBF7B', '#E7F4D4', '#F2FFF0', 'shell', 'cloud'],
  ['azure_pomelo', '天青柚', 'epic', 175, '#6EBBA7', '#DDF2A1', '#C9FFF2', 'citrus', 'sky'],
  ['silver_citrus', '银月柑', 'legendary', 180, '#A6B4C8', '#F4EDC8', '#E7F0FF', 'citrus', 'moon'],
  ['stardust_blackberry', '星尘黑莓', 'mythic', 185, '#493B78', '#B3A1E5', '#C8B9FF', 'cluster', 'galaxy'],
  ['dragon_scale_apple', '龙鳞蛇果', 'legendary', 190, '#A9364D', '#E9A249', '#FFC66E', 'round', 'dragon'],
  ['polar_blackcurrant', '极夜黑加仑', 'mythic', 195, '#332B60', '#7C79D8', '#9BA9FF', 'cluster', 'night'],
  ['dawn_apricot', '晨曦杏', 'legendary', 200, '#E99A57', '#FFD28A', '#FFE0A8', 'round', 'dawn'],
  ['dream_jujube', '梦境枣', 'epic', 205, '#9A4553', '#D998A6', '#F2B9D0', 'round', 'dream'],
  ['holy_olive', '圣光橄榄', 'mythic', 210, '#799A58', '#F2E99D', '#FFF5B9', 'pear', 'holy'],
  ['sky_mandarin', '天河蜜柑', 'legendary', 215, '#E98B3D', '#74BCD8', '#A9E8FF', 'citrus', 'sky'],
  ['mist_hawthorn', '仙雾山楂', 'mythic', 220, '#C8495B', '#E9C2D5', '#F4D9EA', 'round', 'mist'],
  ['diamond_honeydate', '钻石蜜枣', 'legendary', 225, '#B56D44', '#B9F3E6', '#DAFFF7', 'round', 'crystal'],
  ['ring_melon', '星环香瓜', 'mythic', 230, '#76B776', '#D6C6FF', '#D7F1FF', 'melon', 'ring'],
  ['chaos_durian', '混沌榴莲', 'mythic', 235, '#8E8A42', '#D66EA6', '#E5A5D1', 'spiky', 'chaos'],
  ['eternal_persimmon', '永夜黑柿', 'mythic', 240, '#4F314B', '#B25E77', '#DC91AF', 'round', 'eternal'],
  ['oracle_kumquat', '神谕金桔', 'legendary', 245, '#E7A42F', '#FFF0A8', '#FFF5C7', 'citrus', 'oracle'],
  ['firmament_coconut', '苍穹椰皇', 'mythic', 250, '#745743', '#75C9E5', '#A7E7FF', 'shell', 'cosmic'],
  ['time_apple', '时光苹果', 'mythic', 255, '#D74D65', '#7CD0B0', '#C8F8E9', 'round', 'time'],
  ['fantasy_raspberry', '幻彩覆盆子', 'mythic', 260, '#B14B91', '#78DBD3', '#E3A8EE', 'cluster', 'rainbow'],
  ['cosmic_kiwano', '宇宙火参果', 'mythic', 265, '#D8873B', '#7255AF', '#BBA6FF', 'spiky', 'cosmic']
]);

function createFruit(spec, index) {
  const [id, name, rarity, minLevel, color, accent, glow, shape, motif] = spec;
  const original = ORIGINAL_BONUSES[id];
  const tierGrowth = Math.floor(minLevel / 25) * 5;
  const assetName = ASSETS[id];
  return Object.freeze({
    id,
    name,
    rarity,
    rarityName: RARITY_NAMES[rarity],
    minLevel,
    weight: Math.max(2, RARITY_WEIGHTS[rarity] - Math.floor(index / 18)),
    color,
    accent,
    glow,
    shape,
    motif,
    firstBonus: original ? original[0] : RARITY_FIRST_BONUS[rarity] + tierGrowth,
    duplicateBonus: original ? original[1] : RARITY_DUPLICATE_BONUS[rarity] + Math.floor(minLevel / 45) * 2,
    firstPoints: RARITY_FIRST_POINTS[rarity] + minLevel * 2,
    duplicatePoints: RARITY_DUPLICATE_POINTS[rarity] + Math.floor(minLevel / 5),
    asset: assetName ? `assets/rare-fruits/${assetName}` : ''
  });
}

const RARE_FRUITS = Object.freeze(FRUIT_SPECS.map(createFruit));

const RARE_FRUIT_MAP = RARE_FRUITS.reduce((map, fruit) => {
  map[fruit.id] = fruit;
  return map;
}, {});

function createRareToken(id) {
  return `${RARE_PREFIX}${id}`;
}

function isRareFruitToken(value) {
  return typeof value === 'string' && value.indexOf(RARE_PREFIX) === 0;
}

function getRareFruitFromToken(value) {
  if (!isRareFruitToken(value)) return null;
  return RARE_FRUIT_MAP[value.slice(RARE_PREFIX.length)] || null;
}

function getEligibleRareFruits(level) {
  return RARE_FRUITS.filter((fruit) => level >= fruit.minLevel);
}

function weightedPick(rng, fruits) {
  const totalWeight = fruits.reduce((sum, fruit) => sum + fruit.weight, 0);
  let cursor = rng.next() * totalWeight;
  for (let i = 0; i < fruits.length; i += 1) {
    cursor -= fruits[i].weight;
    if (cursor <= 0) return fruits[i];
  }
  return fruits[fruits.length - 1] || null;
}

function rollRareFruit(rng, level, daily) {
  const eligible = getEligibleRareFruits(level);
  if (!eligible.length) return null;

  const milestoneDrop = !daily && level >= 5 && level % 5 === 0;
  const chance = daily
    ? 0.44
    : clamp(0.14 + Math.max(0, level - 4) * 0.0038, 0.14, 0.4);
  if (!milestoneDrop && rng.next() >= chance) return null;

  const newest = eligible[eligible.length - 1];
  if (eligible.length > 1 && level <= newest.minLevel + 3 && rng.next() < 0.56) return newest;

  // 大图鉴下优先从最近解锁的 10 种中抽取，避免 50+ 收藏被早期水果稀释。
  const recent = eligible.slice(-Math.min(10, eligible.length));
  if (eligible.length > 10 && rng.next() < 0.64) return weightedPick(rng, recent);
  return weightedPick(rng, eligible);
}

function countDiscoveredRareFruits(collection) {
  const data = collection || {};
  return RARE_FRUITS.reduce((count, fruit) => count + (data[fruit.id] && data[fruit.id].count > 0 ? 1 : 0), 0);
}

function getRarestDiscoveredFruit(collection) {
  const data = collection || {};
  let found = null;
  RARE_FRUITS.forEach((fruit) => {
    if (!data[fruit.id] || data[fruit.id].count <= 0) return;
    if (!found || fruit.minLevel > found.minLevel) found = fruit;
  });
  return found;
}

function getFruitShopShowcase(collection, limit) {
  const data = collection || {};
  const size = Math.max(1, limit || 8);
  const discovered = RARE_FRUITS
    .filter((fruit) => data[fruit.id] && data[fruit.id].count > 0)
    .sort((a, b) => b.minLevel - a.minLevel);
  const result = discovered.slice(0, size);
  if (result.length >= size) return result;
  const used = new Set(result.map((fruit) => fruit.id));
  RARE_FRUITS.forEach((fruit) => {
    if (result.length >= size || used.has(fruit.id)) return;
    result.push(fruit);
    used.add(fruit.id);
  });
  return result;
}

function getFruitMastery(count) {
  const total = Math.max(0, Math.floor(Number(count) || 0));
  let mastery = { count: 0, name: '尚未点亮', crown: 0 };
  FRUIT_MASTERY.forEach((entry) => {
    if (total >= entry.count) mastery = entry;
  });
  return Object.assign({}, mastery, {
    next: FRUIT_MASTERY.find((entry) => entry.count > total) || null
  });
}

module.exports = {
  RARE_FRUITS,
  RARE_FRUIT_MAP,
  RARITY_COLORS,
  countDiscoveredRareFruits,
  createRareToken,
  getEligibleRareFruits,
  getFruitMastery,
  getFruitShopShowcase,
  getRareFruitFromToken,
  getRarestDiscoveredFruit,
  isRareFruitToken,
  rollRareFruit
};
