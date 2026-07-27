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
      '点错会立即失败'
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
      '暂停不会停这 6 秒'
    ])
  }),
  Object.freeze({
    id: 'frozen_item',
    unlockLevel: 6,
    badge: '冻',
    color: '#3E9FD6',
    paleColor: '#EAF8FF',
    title: '“冻”会锁住操作',
    description: '正确收下后，短时间内不能继续点击。',
    tips: Object.freeze([
      '冻结约 1.5 秒',
      '关卡倒计时不会停'
    ])
  }),
  Object.freeze({
    id: 'drain_item',
    unlockLevel: 8,
    badge: '耗',
    color: '#E96572',
    paleColor: '#FFF0F1',
    title: '“耗”会扣掉时间',
    description: '正确收下也会损失 3 秒。',
    tips: Object.freeze([
      '时间很少时先绕开',
      '+15 秒道具同步解锁'
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
      '点错仍会立即失败'
    ])
  }),
  Object.freeze({
    id: 'triple_targets',
    unlockLevel: 15,
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
    id: 'rush_target',
    unlockLevel: 22,
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
  6: 'frozen',
  8: 'drain',
  10: 'time_bonus',
  12: 'sweep',
  18: 'bomb'
});

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
  getCollectionTargetMechanic,
  getForcedItemRuleId,
  getMechanicForLevel
};
