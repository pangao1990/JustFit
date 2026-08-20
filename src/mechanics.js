'use strict';

const MECHANIC_TUTORIALS = Object.freeze([
  Object.freeze({
    id: 'basic_target',
    unlockLevel: 1,
    badge: '装',
    color: '#27A796',
    paleColor: '#E7FAF6',
    title: '只收目标中的物件',
    description: '只点目标箱中的同类物件，凑满 3 件。',
    tips: Object.freeze([
      '凑满 3 件完成一箱',
      '第一次点错扣 8 秒并获得警告'
    ])
  }),
  Object.freeze({
    id: 'dual_targets',
    unlockLevel: 2,
    badge: '双',
    color: '#7458C7',
    paleColor: '#F0EBFF',
    title: '同时收集 2 个目标',
    description: '两种目标都能收，优先完成更接近 3 件的。',
    tips: Object.freeze([
      '先完成 2/3 的目标',
      '每次点击前看一眼目标箱'
    ])
  }),
  Object.freeze({
    id: 'shelf_shift',
    unlockLevel: 3,
    badge: '换',
    color: '#D97846',
    paleColor: '#FFF1E7',
    title: '装满后，传送带会换位',
    description: '每完成一个目标箱，传送带会重新排列。',
    tips: Object.freeze([
      '装满后重新看顶层',
      '新目标会立刻补入'
    ])
  }),
  Object.freeze({
    id: 'collectible',
    unlockLevel: 4,
    badge: '藏',
    color: '#B579D5',
    paleColor: '#F7ECFF',
    title: '闪耀藏品混进货架',
    description: '彩虹光圈只停留 6 秒。',
    tips: Object.freeze([
      '彩虹光圈出现就点',
      '暂停、切后台和看广告都会停表'
    ])
  }),
  Object.freeze({
    id: 'sealed_item',
    unlockLevel: 6,
    badge: '封',
    color: '#3E9FD6',
    paleColor: '#EAF8FF',
    title: '先撕封条，再装箱',
    description: '封条物件需要点两次，但不会锁住其他操作。',
    tips: Object.freeze([
      '第一下只撕开封条',
      '可先处理其他目标再回来'
    ])
  }),
  Object.freeze({
    id: 'time_bonus_item',
    unlockLevel: 10,
    badge: '+',
    color: '#27A796',
    paleColor: '#E7FAF6',
    title: '“+”会补回时间',
    description: '正确收下立即增加 3 秒。',
    tips: Object.freeze([
      '低时间时优先收集',
      '仍要先确认它属于目标'
    ])
  }),
  Object.freeze({
    id: 'sweep_item',
    unlockLevel: 12,
    badge: '清',
    color: '#8063D8',
    paleColor: '#F2EEFF',
    title: '“清”会一次装满同类',
    description: '只要属于当前目标，一点就能完成这一箱。',
    tips: Object.freeze([
      '留给进度较低的目标更划算',
      '自动清除不会增加连击'
    ])
  }),
  Object.freeze({
    id: 'triple_targets',
    unlockLevel: 11,
    badge: '三',
    color: '#7458C7',
    paleColor: '#F0EBFF',
    title: '同时收集 3 个目标',
    description: '选择更多，也更考验观察顺序。',
    tips: Object.freeze([
      '优先完成 2/3 的目标',
      '同时留意特殊标记'
    ])
  }),
  Object.freeze({
    id: 'bomb_item',
    unlockLevel: 18,
    badge: '爆',
    color: '#D94257',
    paleColor: '#FFECEF',
    title: '看到“爆”不要点',
    description: '炸弹是伪装陷阱，点中会立即失败。',
    tips: Object.freeze([
      '即使图案相同也不能点',
      '提示道具会主动避开炸弹'
    ])
  }),
  Object.freeze({
    id: 'horizontal_conveyor',
    unlockLevel: 20,
    badge: '移',
    color: '#D97846',
    paleColor: '#FFF1E7',
    title: '传送带开始移动',
    description: '卡片会平稳左右移动，点击区域会跟着卡片走。',
    tips: Object.freeze(['先看清移动方向', '按住的卡片不会在松手时变成邻居'])
  }),
  Object.freeze({
    id: 'vertical_bob',
    unlockLevel: 30,
    badge: '跳',
    color: '#46A3C7',
    paleColor: '#EAF8FF',
    title: '货物上下浮动',
    description: '不同卡片按固定节奏上下浮动。',
    tips: Object.freeze(['节奏可预测', '开启舒缓动态可降低速度和幅度'])
  }),
  Object.freeze({
    id: 'lane_swap',
    unlockLevel: 40,
    badge: '换',
    color: '#E96572',
    paleColor: '#FFF0F1',
    title: '预告换道',
    description: '换道前会闪烁预告，移动期间暂停点击。',
    tips: Object.freeze(['看到预告先等一下', '换位结束后有短暂安全窗'])
  }),
  Object.freeze({
    id: 'shield_item',
    unlockLevel: 35,
    badge: '盾',
    color: '#46A77A',
    paleColor: '#E9F9EF',
    title: '护盾货物出现',
    description: '正确收下后，可抵消下一次普通误触。',
    tips: Object.freeze(['炸弹仍会立即失败', '护盾不会替你自动点击'])
  }),
  Object.freeze({
    id: 'sequence_orders',
    unlockLevel: 50,
    badge: '序',
    color: '#7458C7',
    paleColor: '#F0EBFF',
    title: '按顺序完成订单',
    description: '带钥匙的订单需要按从左到右的顺序装箱。',
    tips: Object.freeze(['先完成最左目标', '提示会自动寻找当前顺序'])
  }),
  Object.freeze({
    id: 'carousel',
    unlockLevel: 60,
    badge: '环',
    color: '#9277E5',
    paleColor: '#F3EFFF',
    title: '环形货架开启',
    description: '货物沿环形轨迹缓慢移动，大订单会分成三波。',
    tips: Object.freeze(['每波完成会保存检查点', '失败后可从最近一波继续'])
  }),
  Object.freeze({
    id: 'wildcard_item',
    unlockLevel: 55,
    badge: '万',
    color: '#B06ED8',
    paleColor: '#F7ECFF',
    title: '万能货物出现',
    description: '万能货物可补入当前任意目标箱。',
    tips: Object.freeze(['优先帮助限时目标', '万能货物同样计入正常连击'])
  }),
  Object.freeze({
    id: 'rush_target',
    unlockLevel: 15,
    badge: '急',
    color: '#E49B24',
    paleColor: '#FFF6DA',
    title: '限步目标出现',
    description: '金色目标会显示剩余点击步数。',
    tips: Object.freeze([
      '剩余步数少时优先完成',
      '按时完成可保留额外成绩'
    ])
  })
]);

const MECHANIC_MAP = Object.freeze(MECHANIC_TUTORIALS.reduce((result, mechanic) => {
  result[mechanic.id] = mechanic;
  return result;
}, {}));

const COLLECTION_TARGET_TUTORIAL = Object.freeze({
  id: 'collection_target',
  badge: '耀',
  color: '#B06ED8',
  paleColor: '#F7ECFF',
  title: '藏品会回到目标箱',
  description: '点亮后的闪耀藏品，会随机成为后续关卡的收集目标。',
  tips: Object.freeze([
    '闪耀目标每关最多出现 1 种',
    '完成整箱可获得更多金币'
  ])
});

const FORCED_ITEM_RULE_BY_LEVEL = Object.freeze({
  6: 'sealed',
  10: 'time_bonus',
  12: 'sweep',
  18: 'bomb',
  35: 'shield',
  55: 'wildcard'
});

const MECHANIC_WEIGHTS = Object.freeze({
  horizontal: 1,
  bob: 1,
  sealed: 1,
  rush: 1,
  triple_targets: 1,
  bomb: 2,
  lane_swap: 2,
  sequence: 2,
  carousel: 3
});

function getDifficultyBudget(progressLevel, levelNumber) {
  const progress = Math.max(1, Math.floor(Number(progressLevel) || 1));
  const level = Math.max(1, Math.floor(Number(levelNumber) || progress));
  let max = progress < 20 ? (progress < 5 ? 0 : 1)
    : (progress < 40 ? 2 : (progress < 60 ? 3 : 4));
  const recovery = level > 20 && level % 5 === 1;
  // 大订单本身已有 12 箱与三波结构，不再把所有危险机制叠在一起。
  if (level % 10 === 0) max = Math.max(1, max - 1);
  if (recovery) max = Math.max(1, max - 1);
  return { min: Math.max(0, max - 1), max, recovery };
}

function getLevelMechanics(progressLevel, levelNumber, daily, rng) {
  const progress = Math.max(1, Math.floor(Number(progressLevel) || 1));
  const level = Math.max(1, Math.floor(Number(levelNumber) || 1));
  const budget = getDifficultyBudget(progress, level);
  const ids = [];
  let used = 0;
  let movement = null;

  const add = (id) => {
    const weight = MECHANIC_WEIGHTS[id] || 1;
    if (ids.indexOf(id) >= 0 || used + weight > budget.max) return false;
    ids.push(id);
    used += weight;
    return true;
  };

  if (progress >= 5 && (level === 6 || level % 7 === 0)) add('sealed');
  if (progress >= 15 && (level === 15 || level % 6 === 3)) add('rush');

  const largeOrder = !daily && level % 10 === 0;
  const sequenceUnlock = progress >= 50 && level === 50 && add('sequence');
  if (progress >= 60 && (level === 60 || (!largeOrder && level % 8 === 4)) && add('carousel')) {
    movement = {
      type: 'carousel',
      speed: Math.min(0.34, 0.18 + Math.max(0, progress - 60) * 0.002),
      amplitude: 18,
      periodMs: Math.max(5200, 7600 - Math.max(0, progress - 60) * 24)
    };
  } else if (progress >= 40 && (level === 40 || (!largeOrder && level % 7 === 5)) && add('lane_swap')) {
    movement = { type: 'lane_swap', periodMs: 7200, warningMs: 600, transitionMs: 820, safetyMs: 300 };
  } else if (!sequenceUnlock && progress >= 30 && (level === 30 || (!largeOrder && level % 4 === 2)) && add('bob')) {
    movement = {
      type: 'bob',
      amplitude: Math.min(19, 11 + Math.max(0, progress - 30) * 0.12),
      periodMs: Math.max(1400, 2100 - Math.max(0, progress - 30) * 9)
    };
  } else if (!sequenceUnlock && progress >= 20 && add('horizontal')) {
    movement = {
      type: 'horizontal',
      speed: Math.min(55, 24 + Math.max(0, progress - 20) * 0.42),
      amplitude: Math.min(30, 18 + Math.max(0, progress - 20) * 0.13),
      periodMs: Math.max(2400, 4300 - Math.max(0, progress - 20) * 18)
    };
  }

  const sequenceWanted = progress >= 50 && (level === 50 || level % 6 === 2);
  if (sequenceWanted) add('sequence');
  // 炸弹不会和高速换道或环形移动叠加，避免视觉误导造成不可控死亡。
  const dangerousMovement = Boolean(movement);
  if (!dangerousMovement && progress >= 15 && (level === 18 || level % 9 === 0)) add('bomb');

  return {
    ids,
    budget: Object.assign({}, budget, { used }),
    movement,
    sequenceMode: ids.indexOf('sequence') >= 0,
    sealedEnabled: ids.indexOf('sealed') >= 0,
    rushEnabled: ids.indexOf('rush') >= 0,
    bombEnabled: ids.indexOf('bomb') >= 0,
    strictMistakes: Boolean(daily && progress >= 80),
    reducedMotionScale: 0.7
  };
}

function getMechanicForLevel(level, seenMechanics, options) {
  const opts = options || {};
  if (opts.daily || opts.challenge) return null;
  const currentLevel = Math.max(1, Math.floor(Number(level) || 1));
  const seen = seenMechanics || {};
  return MECHANIC_TUTORIALS.find((mechanic) => (
    mechanic.unlockLevel === currentLevel && !seen[mechanic.id]
  )) || null;
}

function getForcedItemRuleId(level) {
  const currentLevel = Math.max(1, Math.floor(Number(level) || 1));
  return FORCED_ITEM_RULE_BY_LEVEL[currentLevel] || '';
}

function getCollectionTargetMechanic(level, seenMechanics, collectible) {
  const seen = seenMechanics || {};
  if (!collectible || seen[COLLECTION_TARGET_TUTORIAL.id]) return null;
  return Object.freeze(Object.assign({}, COLLECTION_TARGET_TUTORIAL, {
    unlockLevel: Math.max(1, Math.floor(Number(level) || 1)),
    title: `${collectible.name}加入目标箱`
  }));
}

module.exports = {
  COLLECTION_TARGET_TUTORIAL,
  FORCED_ITEM_RULE_BY_LEVEL,
  MECHANIC_MAP,
  MECHANIC_TUTORIALS,
  MECHANIC_WEIGHTS,
  getDifficultyBudget,
  getLevelMechanics,
  getCollectionTargetMechanic,
  getForcedItemRuleId,
  getMechanicForLevel
};
