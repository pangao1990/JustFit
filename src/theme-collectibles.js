'use strict';

const { RARE_FRUITS, getFruitMastery } = require('./rare-fruits');
const { THEMES, getTheme, normalizeThemeId } = require('./themes');
const { clamp } = require('./utils');

const COLLECTIBLE_PREFIX = 'rare:';
const RARITY_NAMES = Object.freeze({ rare: '稀有', epic: '史诗', legendary: '传说', mythic: '神话' });
const RARITY_WEIGHTS = Object.freeze({ rare: 30, epic: 18, legendary: 9, mythic: 4 });
const RARITY_FIRST_POINTS = Object.freeze({ rare: 320, epic: 760, legendary: 1500, mythic: 2700 });
const RARITY_DUPLICATE_POINTS = Object.freeze({ rare: 36, epic: 92, legendary: 210, mythic: 420 });
const RARITY_FIRST_BONUS = Object.freeze({ rare: 42, epic: 74, legendary: 120, mythic: 190 });
const RARITY_DUPLICATE_BONUS = Object.freeze({ rare: 10, epic: 17, legendary: 27, mythic: 40 });

const MOTIFS = Object.freeze([
  'star', 'moon', 'comet', 'crystal', 'rainbow', 'cloud', 'crown', 'frost',
  'flame', 'pearl', 'aurora', 'galaxy', 'ocean', 'lightning', 'ring', 'time',
  'jade', 'prism', 'dawn', 'oracle', 'phoenix', 'nebula', 'cosmic', 'eternal'
]);

const THEME_SPECS = Object.freeze({
  vegetable: Object.freeze([
    ['starlight_tomato', '星灯番茄', 'tomato'], ['crystal_carrot', '水晶胡萝卜', 'carrot'],
    ['moon_eggplant', '月影茄子', 'eggplant'], ['rainbow_pepper', '彩虹甜椒', 'pepper'],
    ['cloud_broccoli', '云冠西兰花', 'broccoli'], ['golden_corn', '金穗玉米', 'corn'],
    ['galaxy_pumpkin', '星河南瓜', 'pumpkin'], ['dream_mushroom', '梦境蘑菇', 'mushroom'],
    ['jade_cucumber', '翡翠黄瓜', 'cucumber'], ['frost_cabbage', '霜晶卷心菜', 'cabbage'],
    ['pearl_onion', '珍珠洋葱', 'onion'], ['comet_potato', '彗星土豆', 'potato'],
    ['flame_chili', '焰尾辣椒', 'pepper'], ['aurora_radish', '极光萝卜', 'radish'],
    ['ocean_lotus', '潮汐莲藕', 'lotus'], ['crown_asparagus', '皇冠芦笋', 'asparagus'],
    ['prism_pea', '棱镜豌豆', 'pea'], ['thunder_garlic', '雷鸣大蒜', 'garlic'],
    ['dawn_beet', '晨曦甜菜', 'beet'], ['oracle_artichoke', '神谕洋蓟', 'artichoke'],
    ['phoenix_yam', '凤凰山药', 'yam'], ['time_bamboo', '时光竹笋', 'bamboo'],
    ['cosmic_gourd', '宇宙葫芦', 'gourd'], ['eternal_harvest', '永恒丰收心', 'harvest']
  ]),
  animal: Object.freeze([
    ['starlight_cat', '星尾猫', 'cat'], ['cloud_dog', '云耳犬', 'dog'],
    ['moon_rabbit', '月芽兔', 'rabbit'], ['crystal_panda', '水晶熊猫', 'panda'],
    ['flame_fox', '焰耳狐', 'fox'], ['crown_lion', '皇冠狮', 'lion'],
    ['rainbow_elephant', '彩虹象', 'elephant'], ['frost_penguin', '霜帽企鹅', 'penguin'],
    ['ocean_whale', '潮汐鲸', 'whale'], ['jade_turtle', '翡翠海龟', 'turtle'],
    ['oracle_owl', '神谕小鸮', 'owl'], ['comet_deer', '彗角鹿', 'deer'],
    ['pearl_otter', '珍珠水獭', 'otter'], ['aurora_bear', '极光熊', 'bear'],
    ['thunder_tiger', '雷纹虎', 'tiger'], ['prism_peacock', '棱镜孔雀', 'bird'],
    ['dawn_alpaca', '晨曦羊驼', 'alpaca'], ['galaxy_octopus', '星云章鱼', 'octopus'],
    ['dream_hedgehog', '梦刺猬', 'hedgehog'], ['time_dolphin', '时光海豚', 'dolphin'],
    ['phoenix_crane', '凤凰鹤', 'bird'], ['nebula_dragon', '星云幼龙', 'dragon'],
    ['cosmic_guardian', '星海守护兽', 'guardian'], ['eternal_beast', '永恒森之王', 'beast']
  ]),
  toy: Object.freeze([
    ['clockwork_bear', '发条小熊', 'bear'], ['rocket_rabbit', '火箭兔', 'rocket'],
    ['crystal_blocks', '水晶积木', 'blocks'], ['rainbow_train', '彩虹列车', 'train'],
    ['moon_kite', '月影风筝', 'kite'], ['thunder_drum', '雷鸣小鼓', 'drum'],
    ['galaxy_yoyo', '星环悠悠球', 'yoyo'], ['candy_robot', '糖果机器人', 'robot'],
    ['cloud_duck', '云朵小鸭', 'duck'], ['comet_car', '彗星赛车', 'car'],
    ['prism_puzzle', '棱镜拼图', 'puzzle'], ['dream_doll', '梦境布偶', 'doll'],
    ['aurora_dinosaur', '极光恐龙', 'dinosaur'], ['crown_top', '皇冠陀螺', 'top'],
    ['starlight_plane', '星辉飞机', 'plane'], ['ocean_horse', '海风木马', 'horse'],
    ['neon_slime', '霓虹软泥', 'slime'], ['oracle_capsule', '神谕扭蛋', 'capsule'],
    ['frost_pinwheel', '霜晶风车', 'pinwheel'], ['phoenix_marble', '凤凰弹珠', 'marble'],
    ['time_musicbox', '时光音乐盒', 'musicbox'], ['cosmic_spaceship', '宇宙飞船', 'spaceship'],
    ['eternal_castle', '永恒城堡', 'castle'], ['mythic_toychest', '万象玩具箱', 'chest']
  ]),
  dessert: Object.freeze([
    ['starlight_cake', '星辉蛋糕', 'cake'], ['rainbow_donut', '彩虹甜甜圈', 'donut'],
    ['crystal_cupcake', '水晶纸杯糕', 'cupcake'], ['cloud_icecream', '云朵冰淇淋', 'icecream'],
    ['moon_macaron', '月影马卡龙', 'macaron'], ['comet_cookie', '彗星曲奇', 'cookie'],
    ['golden_pudding', '黄金布丁', 'pudding'], ['dream_candy', '梦境糖果', 'candy'],
    ['galaxy_chocolate', '星河巧克力', 'chocolate'], ['frost_waffle', '霜晶华夫', 'waffle'],
    ['pearl_pie', '珍珠果派', 'pie'], ['aurora_jelly', '极光果冻', 'jelly'],
    ['flame_tart', '焰心蛋挞', 'tart'], ['jade_mousse', '翡翠慕斯', 'mousse'],
    ['ocean_soda', '潮汐苏打', 'soda'], ['crown_parfait', '皇冠芭菲', 'parfait'],
    ['prism_lollipop', '棱镜棒棒糖', 'lollipop'], ['thunder_popcorn', '雷鸣爆米花', 'popcorn'],
    ['dawn_bread', '晨曦面包', 'bread'], ['oracle_teapot', '神谕甜茶', 'teapot'],
    ['phoenix_candyhouse', '凤凰糖果屋', 'house'], ['time_bento', '时光甜点盒', 'bento'],
    ['cosmic_banquet', '宇宙甜宴', 'banquet'], ['eternal_dessert', '永恒甜梦心', 'dessertcore']
  ]),
  appliance: Object.freeze([
    ['aurora_fridge', '极光冰箱', 'fridge'], ['cloud_washer', '云泡洗衣机', 'washer'],
    ['comet_fan', '彗星风扇', 'fan'], ['crystal_kettle', '水晶热水壶', 'kettle'],
    ['rainbow_toaster', '彩虹烤箱', 'toaster'], ['moon_vacuum', '月影吸尘器', 'vacuum'],
    ['starlight_lamp', '星辉台灯', 'lamp'], ['jade_ricecooker', '翡翠电饭煲', 'cooker'],
    ['galaxy_microwave', '星河微波炉', 'microwave'], ['frost_iron', '霜晶熨斗', 'iron'],
    ['flame_hairdryer', '焰风吹风机', 'dryer'], ['pearl_mixer', '珍珠搅拌机', 'mixer'],
    ['tide_humidifier', '潮汐加湿器', 'humidifier'], ['dawn_heater', '晨曦暖风机', 'heater'],
    ['prism_scale', '棱镜体重秤', 'scale'], ['sky_purifier', '天青净化器', 'purifier'],
    ['crown_coffee', '皇冠咖啡机', 'coffee'], ['thunder_dishwasher', '雷鸣洗碗机', 'dishwasher'],
    ['nebula_oven', '星云烤炉', 'oven'], ['oracle_ac', '神谕空调', 'aircon'],
    ['phoenix_hood', '凤凰烟机', 'hood'], ['time_cleaner', '时光扫地机', 'cleaner'],
    ['cosmic_kitchen', '宇宙料理台', 'kitchen'], ['eternal_homecore', '永恒家居核心', 'homecore']
  ]),
  digital: Object.freeze([
    ['starlight_phone', '星辉手机', 'phone'], ['crystal_tablet', '水晶平板', 'tablet'],
    ['moon_laptop', '月影笔记本', 'laptop'], ['aurora_headphones', '极光耳机', 'headphones'],
    ['comet_camera', '彗星相机', 'camera'], ['rainbow_console', '彩虹掌机', 'console'],
    ['galaxy_watch', '星河手表', 'watch'], ['cloud_drone', '云端无人机', 'drone'],
    ['frost_keyboard', '霜晶键盘', 'keyboard'], ['flame_mouse', '焰光鼠标', 'mouse'],
    ['prism_projector', '棱镜投影仪', 'projector'], ['nebula_vr', '星云VR镜', 'vr'],
    ['pearl_chip', '珍珠芯片', 'chip'], ['tide_router', '潮汐路由器', 'router'],
    ['crown_speaker', '皇冠音箱', 'speaker'], ['dawn_earbuds', '晨曦耳豆', 'earbuds'],
    ['jade_powerbank', '翡翠能量块', 'powerbank'], ['oracle_reader', '神谕阅读器', 'reader'],
    ['thunder_gamepad', '雷鸣手柄', 'gamepad'], ['phoenix_glasses', '凤凰智镜', 'glasses'],
    ['time_hologram', '时光全息台', 'hologram'], ['cosmic_satellite', '宇宙卫星', 'satellite'],
    ['eternal_ai_core', '永恒智核', 'aicore'], ['mythic_quantum_cube', '万象量子方块', 'quantum']
  ]),
  vehicle: Object.freeze([
    ['starlight_car', '星辉跑车', 'car'], ['rainbow_bus', '彩虹巴士', 'bus'],
    ['crystal_train', '水晶列车', 'train'], ['cloud_plane', '云端客机', 'plane'],
    ['ocean_ship', '潮汐轮船', 'boat'], ['moon_bicycle', '月影单车', 'bicycle'],
    ['comet_rocket', '彗星火箭', 'rocket'], ['jade_scooter', '翡翠滑板车', 'scooter'],
    ['golden_truck', '黄金货车', 'truck'], ['frost_submarine', '霜晶潜艇', 'submarine'],
    ['flame_helicopter', '焰翼直升机', 'helicopter'], ['pearl_taxi', '珍珠出租车', 'taxi'],
    ['aurora_balloon', '极光热气球', 'balloon'], ['prism_metro', '棱镜地铁', 'metro'],
    ['thunder_motorcycle', '雷鸣摩托', 'motorcycle'], ['crown_carriage', '皇冠马车', 'carriage'],
    ['dawn_sailboat', '晨曦帆船', 'sailboat'], ['oracle_rover', '神谕探测车', 'rover'],
    ['nebula_ufo', '星云飞碟', 'ufo'], ['time_capsule', '时光胶囊车', 'capsulecar'],
    ['phoenix_airship', '凤凰飞艇', 'airship'], ['galaxy_gateway', '星河传送门', 'gateway'],
    ['cosmic_cruiser', '宇宙巡航舰', 'cruiser'], ['eternal_engine', '永恒交通核心', 'engine']
  ]),
  fashion: Object.freeze([
    ['starlight_hat', '星辉礼帽', 'hat'], ['cloud_shirt', '云纹衬衫', 'shirt'],
    ['moon_dress', '月影长裙', 'dress'], ['comet_shoes', '彗星潮鞋', 'shoe'],
    ['crystal_bag', '水晶手袋', 'bag'], ['rainbow_glasses', '彩虹眼镜', 'glasses'],
    ['galaxy_watch', '星河腕表', 'watch'], ['flame_scarf', '焰尾围巾', 'scarf'],
    ['golden_crown', '黄金皇冠', 'crown'], ['frost_socks', '霜晶短袜', 'sock'],
    ['jade_jacket', '翡翠外套', 'jacket'], ['pearl_umbrella', '珍珠雨伞', 'umbrella'],
    ['aurora_necklace', '极光项链', 'necklace'], ['ocean_boots', '潮汐长靴', 'boot'],
    ['prism_bow', '棱镜蝴蝶结', 'bow'], ['thunder_belt', '雷鸣腰带', 'belt'],
    ['dawn_gloves', '晨曦手套', 'glove'], ['oracle_mask', '神谕面具', 'mask'],
    ['phoenix_robe', '凤凰礼袍', 'robe'], ['time_handbag', '时光手提箱', 'suitcase'],
    ['nebula_wings', '星云披风', 'cape'], ['crown_set', '王冠礼服套装', 'outfit'],
    ['cosmic_wardrobe', '宇宙衣橱', 'wardrobe'], ['eternal_style', '永恒潮流核心', 'stylecore']
  ]),
  mascot: Object.freeze([
    ['star_mochi', '星团糯糯', 'mochi'], ['moon_rabbit', '月芽兔', 'rabbit'],
    ['cloud_cat', '云尾猫', 'cat'], ['flame_fox', '焰耳狐', 'fox'],
    ['crystal_blob', '晶晶团', 'blob'], ['rainbow_bird', '彩羽啾', 'bird'],
    ['aurora_dragon', '极光幼龙', 'dragon'], ['tide_whale', '潮汐小鲸', 'whale'],
    ['frost_penguin', '霜帽企鹅', 'penguin'], ['pearl_axolotl', '珍珠六角', 'axolotl'],
    ['honey_bee', '蜜光蜂', 'bee'], ['dream_mushroom', '梦菇仔', 'mushroom'],
    ['comet_deer', '彗角鹿', 'deer'], ['prism_ghost', '棱镜幽灵', 'ghost'],
    ['jade_turtle', '翡翠小龟', 'turtle'], ['thunder_lion', '雷绒狮', 'lion'],
    ['crown_bear', '皇冠团熊', 'bear'], ['nebula_octopus', '星云章鱼', 'octopus'],
    ['dawn_flower', '曦花灵', 'flower'], ['time_robot', '时针机仔', 'robot'],
    ['oracle_owl', '神谕小鸮', 'owl'], ['phoenix_sprite', '凤凰团子', 'sprite'],
    ['cosmic_guardian', '星海守护', 'guardian'], ['eternal_friend', '永恒店长', 'friend']
  ])
});

const THEME_PALETTES = Object.freeze({
  vegetable: ['#61A95B', '#8BC45D', '#E68A3F', '#B679B5', '#E5C34E', '#5D9D75'],
  animal: ['#D18B58', '#7D91B0', '#E57B54', '#8B72D3', '#5BA2C4', '#D0A34C'],
  toy: ['#EF6F79', '#F4B64E', '#63BFAE', '#7F6DDB', '#55A9D3', '#E879A7'],
  dessert: ['#E779A4', '#D39558', '#8B74D6', '#59B7B0', '#E9B94E', '#E06F70'],
  appliance: ['#56A8D0', '#65BBAF', '#8C79D7', '#EF8B68', '#E7BA4F', '#7187A5'],
  digital: ['#596B90', '#7B66D5', '#3FA6B4', '#E3688D', '#5E88C9', '#8E5BC1'],
  vehicle: ['#E36861', '#E7B643', '#57A2C8', '#5FA67B', '#826CD1', '#DE7D47'],
  fashion: ['#B56ED3', '#E16F9D', '#5C9FC5', '#D1A247', '#6E72BF', '#5CB1A3'],
  mascot: ['#EA7CA0', '#8F78DA', '#64B9C7', '#F09B5F', '#71B676', '#E8BE4D']
});

function rarityForIndex(index) {
  if (index < 7) return 'rare';
  if (index < 15) return 'epic';
  if (index < 20) return 'legendary';
  return 'mythic';
}

function buildThemeCollectibles(themeId, specs) {
  const theme = getTheme(themeId);
  const palette = THEME_PALETTES[themeId];
  return specs.map((spec, index) => {
    const rarity = rarityForIndex(index);
    const minLevel = 4 + index * 5;
    const color = palette[index % palette.length];
    const accent = palette[(index + 2) % palette.length];
    return Object.freeze({
      id: `${themeId}_${spec[0]}`,
      name: spec[1],
      themeId,
      themeName: theme.name,
      rarity,
      rarityName: RARITY_NAMES[rarity],
      minLevel,
      weight: Math.max(2, RARITY_WEIGHTS[rarity] - Math.floor(index / 10)),
      color,
      accent,
      glow: index % 2 ? accent : theme.color,
      shape: spec[2],
      motif: MOTIFS[index],
      variant: index,
      firstBonus: RARITY_FIRST_BONUS[rarity] + Math.floor(index / 4) * 4,
      duplicateBonus: RARITY_DUPLICATE_BONUS[rarity] + Math.floor(index / 8) * 2,
      firstPoints: RARITY_FIRST_POINTS[rarity] + minLevel * 3 + index,
      duplicatePoints: RARITY_DUPLICATE_POINTS[rarity] + Math.floor(minLevel / 4) + index,
      asset: '',
      silhouetteKey: `${themeId}:${spec[2]}:${MOTIFS[index]}:${index}`
    });
  });
}

const FRUIT_COLLECTIBLES = Object.freeze(RARE_FRUITS.map((fruit, index) => Object.freeze(Object.assign({}, fruit, {
  themeId: 'fruit',
  themeName: getTheme('fruit').name,
  variant: index,
  silhouetteKey: `fruit:${fruit.shape}:${fruit.motif}:${fruit.id}`
}))));

const THEME_COLLECTIBLES = Object.freeze({
  fruit: FRUIT_COLLECTIBLES,
  vegetable: Object.freeze(buildThemeCollectibles('vegetable', THEME_SPECS.vegetable)),
  animal: Object.freeze(buildThemeCollectibles('animal', THEME_SPECS.animal)),
  toy: Object.freeze(buildThemeCollectibles('toy', THEME_SPECS.toy)),
  dessert: Object.freeze(buildThemeCollectibles('dessert', THEME_SPECS.dessert)),
  appliance: Object.freeze(buildThemeCollectibles('appliance', THEME_SPECS.appliance)),
  digital: Object.freeze(buildThemeCollectibles('digital', THEME_SPECS.digital)),
  vehicle: Object.freeze(buildThemeCollectibles('vehicle', THEME_SPECS.vehicle)),
  fashion: Object.freeze(buildThemeCollectibles('fashion', THEME_SPECS.fashion)),
  mascot: Object.freeze(buildThemeCollectibles('mascot', THEME_SPECS.mascot))
});

const COLLECTIBLES = Object.freeze(THEMES.reduce((all, theme) => all.concat(THEME_COLLECTIBLES[theme.id]), []));
const COLLECTIBLE_MAP = COLLECTIBLES.reduce((map, collectible) => {
  map[collectible.id] = collectible;
  return map;
}, {});

function getThemeCollectibles(themeId) {
  return THEME_COLLECTIBLES[normalizeThemeId(themeId)] || THEME_COLLECTIBLES.fruit;
}

function createCollectibleToken(id) {
  return `${COLLECTIBLE_PREFIX}${id}`;
}

function isCollectibleToken(value) {
  return typeof value === 'string' && value.indexOf(COLLECTIBLE_PREFIX) === 0;
}

function getCollectibleFromToken(value) {
  if (!isCollectibleToken(value)) return null;
  return COLLECTIBLE_MAP[value.slice(COLLECTIBLE_PREFIX.length)] || null;
}

function getEligibleCollectibles(themeId, level) {
  const current = Math.max(1, Math.floor(Number(level) || 1));
  return getThemeCollectibles(themeId).filter((collectible) => current >= collectible.minLevel);
}

function weightedPick(rng, list) {
  const totalWeight = list.reduce((sum, collectible) => sum + collectible.weight, 0);
  let cursor = rng.next() * totalWeight;
  for (let i = 0; i < list.length; i += 1) {
    cursor -= list[i].weight;
    if (cursor <= 0) return list[i];
  }
  return list[list.length - 1] || null;
}

function rollCollectible(rng, themeId, level, daily, options) {
  const opts = options || {};
  if (opts.disableCollectible || opts.disableRare) return null;
  const theme = normalizeThemeId(themeId);
  const forced = opts.forceCollectibleId || opts.forceRareId;
  if (forced) {
    const collectible = COLLECTIBLE_MAP[forced] || null;
    return collectible && collectible.themeId === theme && level >= collectible.minLevel ? collectible : null;
  }

  const eligible = getEligibleCollectibles(theme, level);
  if (!eligible.length) return null;

  const pity = Math.max(0, Math.floor(Number(opts.pity) || 0));
  const milestoneDrop = !daily && level >= 10 && level % 10 === 0;
  const pityDrop = !daily && pity >= 5;
  const chance = daily ? 0.34 : clamp(0.1 + Math.max(0, level - 4) * 0.0012, 0.1, 0.24);
  if (!milestoneDrop && !pityDrop && rng.next() >= chance) return null;

  const collection = opts.collection || {};
  const undiscovered = eligible.filter((collectible) => !collection[collectible.id] || collection[collectible.id].count <= 0);
  if (undiscovered.length && (milestoneDrop || pityDrop || rng.next() < 0.78)) {
    const recentNew = undiscovered.slice(-Math.min(8, undiscovered.length));
    const newest = recentNew[recentNew.length - 1];
    if (newest && level <= newest.minLevel + 3 && rng.next() < 0.58) return newest;
    return weightedPick(rng, recentNew);
  }

  const recent = eligible.slice(-Math.min(12, eligible.length));
  return weightedPick(rng, recent);
}

function countDiscoveredCollectibles(collection, themeId) {
  const data = collection || {};
  return getThemeCollectibles(themeId).reduce((count, collectible) => (
    count + (data[collectible.id] && data[collectible.id].count > 0 ? 1 : 0)
  ), 0);
}

function countAllDiscoveredCollectibles(collection) {
  const data = collection || {};
  return COLLECTIBLES.reduce((count, collectible) => (
    count + (data[collectible.id] && data[collectible.id].count > 0 ? 1 : 0)
  ), 0);
}

function getThemeProgress(themeId, collection) {
  const list = getThemeCollectibles(themeId);
  const discovered = countDiscoveredCollectibles(collection, themeId);
  return {
    themeId: normalizeThemeId(themeId),
    discovered,
    total: list.length,
    complete: discovered >= list.length,
    ratio: list.length ? discovered / list.length : 1
  };
}

function isThemeComplete(themeId, collection) {
  return getThemeProgress(themeId, collection).complete;
}

function getRarestDiscoveredCollectible(collection, themeId) {
  const data = collection || {};
  let found = null;
  getThemeCollectibles(themeId).forEach((collectible) => {
    if (!data[collectible.id] || data[collectible.id].count <= 0) return;
    if (!found || collectible.minLevel > found.minLevel) found = collectible;
  });
  return found;
}

function getCollectionShowcase(collection, themeId, limit, level) {
  const data = collection || {};
  const size = Math.max(1, Math.floor(Number(limit) || 8));
  const discovered = getThemeCollectibles(themeId)
    .filter((collectible) => data[collectible.id] && data[collectible.id].count > 0)
    .sort((a, b) => b.minLevel - a.minLevel)
    .slice(0, size);
  if (discovered.length >= size) return discovered.map((collectible) => ({ collectible, status: 'discovered' }));
  const used = new Set(discovered.map((collectible) => collectible.id));
  const visible = getVisibleCollectionEntries(themeId, data, level, 4)
    .filter((entry) => !used.has(entry.collectible.id));
  const result = discovered.map((collectible) => ({ collectible, status: 'discovered' }));
  visible.forEach((entry) => {
    if (result.length < size) result.push(entry);
  });
  return result;
}

function getVisibleCollectionEntries(themeId, collection, level, revealLimit) {
  const data = collection || {};
  const currentLevel = Math.max(1, Math.floor(Number(level) || 1));
  const list = getThemeCollectibles(themeId);
  const locked = list.filter((collectible) => !data[collectible.id] || data[collectible.id].count <= 0);
  locked.sort((a, b) => {
    const aDistance = a.minLevel <= currentLevel ? (currentLevel - a.minLevel) * 0.85 : a.minLevel - currentLevel;
    const bDistance = b.minLevel <= currentLevel ? (currentLevel - b.minLevel) * 0.85 : b.minLevel - currentLevel;
    return aDistance - bDistance || a.minLevel - b.minLevel;
  });
  const revealIds = new Set(locked.slice(0, Math.max(0, revealLimit == null ? 4 : revealLimit)).map((entry) => entry.id));
  return list.map((collectible) => ({
    collectible,
    status: data[collectible.id] && data[collectible.id].count > 0
      ? 'discovered'
      : (revealIds.has(collectible.id) ? 'revealed' : 'sealed')
  }));
}

function getCollectibleMastery(count) {
  return getFruitMastery(count);
}

function getSilhouetteKey(collectible) {
  return collectible && collectible.silhouetteKey || '';
}

module.exports = {
  COLLECTIBLES,
  COLLECTIBLE_MAP,
  COLLECTIBLE_PREFIX,
  THEME_COLLECTIBLES,
  countAllDiscoveredCollectibles,
  countDiscoveredCollectibles,
  createCollectibleToken,
  getCollectibleFromToken,
  getCollectibleMastery,
  getCollectionShowcase,
  getEligibleCollectibles,
  getRarestDiscoveredCollectible,
  getSilhouetteKey,
  getThemeCollectibles,
  getThemeProgress,
  getVisibleCollectionEntries,
  isCollectibleToken,
  isThemeComplete,
  rollCollectible
};
