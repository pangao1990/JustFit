'use strict';

const SPECIAL_PREFIX = 'special:';

const ITEM_RULES = Object.freeze({
  frozen: Object.freeze({
    id: 'frozen',
    name: '冻结',
    badge: '冻',
    color: '#3E9FD6',
    fill: '#EAF8FF',
    unlockLevel: 6,
    directBonus: 18,
    freezeMs: 1500,
    description: '收下后操作冻结 1.5 秒，关卡时间继续流逝'
  }),
  drain: Object.freeze({
    id: 'drain',
    name: '耗时',
    badge: '耗',
    color: '#E96572',
    fill: '#FFF0F1',
    unlockLevel: 8,
    directBonus: 20,
    timeDeltaMs: -3000,
    description: '收下会扣除 3 秒，需要先判断剩余时间'
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
  ITEM_RULES.frozen,
  ITEM_RULES.drain,
  ITEM_RULES.time_bonus,
  ITEM_RULES.sweep,
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
