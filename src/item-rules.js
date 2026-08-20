'use strict';

const SPECIAL_PREFIX = 'special:';

const ITEM_RULES = Object.freeze({
  sealed: Object.freeze({
    id: 'sealed',
    name: '封条',
    badge: '封',
    color: '#3E9FD6',
    fill: '#EAF8FF',
    unlockLevel: 6,
    directBonus: 12,
    sealed: true,
    description: '第一次点击撕开封条，第二次点击才装箱；不会强制等待'
  }),
  time_bonus: Object.freeze({
    id: 'time_bonus',
    name: '加时',
    badge: '+',
    color: '#27A796',
    fill: '#E7FAF6',
    unlockLevel: 10,
    directBonus: 12,
    timeDeltaMs: 3000,
    description: '收下立即增加 3 秒'
  }),
  sweep: Object.freeze({
    id: 'sweep',
    name: '清除',
    badge: '清',
    color: '#8063D8',
    fill: '#F2EEFF',
    unlockLevel: 12,
    directBonus: 36,
    sweep: true,
    description: '收下会把当前同类目标一次装满'
  }),
  shield: Object.freeze({
    id: 'shield',
    name: '护盾',
    badge: '盾',
    color: '#46A77A',
    fill: '#E9F9EF',
    unlockLevel: 35,
    directBonus: 18,
    shield: true,
    description: '正确收下后抵消下一次普通误触，不影响炸弹'
  }),
  wildcard: Object.freeze({
    id: 'wildcard',
    name: '万能',
    badge: '万',
    color: '#B06ED8',
    fill: '#F7ECFF',
    unlockLevel: 55,
    directBonus: 24,
    wildcard: true,
    description: '可放入当前任意一个目标箱，优先帮助最紧急订单'
  }),
  bomb: Object.freeze({
    id: 'bomb',
    name: '炸弹',
    badge: '爆',
    color: '#D94257',
    fill: '#FFECEF',
    unlockLevel: 18,
    directBonus: 0,
    trap: true,
    description: '不要点击；点中立即失败'
  })
});

const ITEM_RULE_LIST = Object.freeze([
  ITEM_RULES.sealed,
  ITEM_RULES.time_bonus,
  ITEM_RULES.sweep,
  ITEM_RULES.shield,
  ITEM_RULES.wildcard,
  ITEM_RULES.bomb
]);

function createSpecialToken(type, ruleId) {
  if (!type || !ITEM_RULES[ruleId]) return type;
  return `${SPECIAL_PREFIX}${ruleId}:${type}`;
}

function parseItemToken(token) {
  if (typeof token !== 'string' || token.indexOf(SPECIAL_PREFIX) !== 0) {
    return { token, type: token, rule: null };
  }
  const parts = token.split(':');
  const rule = ITEM_RULES[parts[1]] || null;
  const type = parts.slice(2).join(':');
  if (!rule || !type) return { token, type: token, rule: null };
  return { token, type, rule };
}

function getUnlockedItemRules(level) {
  const currentLevel = Math.max(1, Number(level) || 1);
  return ITEM_RULE_LIST.filter((rule) => currentLevel >= rule.unlockLevel);
}

function isSpecialItemToken(token) {
  return typeof token === 'string' && token.indexOf(SPECIAL_PREFIX) === 0;
}

module.exports = {
  ITEM_RULES,
  ITEM_RULE_LIST,
  createSpecialToken,
  getUnlockedItemRules,
  isSpecialItemToken,
  parseItemToken
};
