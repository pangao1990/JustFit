'use strict';

const { getTheme } = require('./themes');

const POINT_RANKS = Object.freeze([
  { id: 'basket_rookie', name: '装箱学徒', minPoints: 0, color: '#756A84' },
  { id: 'bronze_shelf', name: '青铜货架', minPoints: 800, color: '#A96E4B' },
  { id: 'silver_shelf', name: '白银货架', minPoints: 2500, color: '#7D8DA7' },
  { id: 'gold_shop', name: '黄金藏馆', minPoints: 6000, color: '#DB9D2D' },
  { id: 'jade_shop', name: '翡翠藏馆', minPoints: 12000, color: '#27A796' },
  { id: 'stellar_warehouse', name: '星耀仓库', minPoints: 22000, color: '#7458C7' },
  { id: 'legend_king', name: '传说馆长', minPoints: 40000, color: '#E67735' },
  { id: 'mythic_king', name: '神话馆长', minPoints: 70000, color: '#D74783' },
  { id: 'eternal_king', name: '永恒馆长', minPoints: 120000, color: '#5765C7' },
  { id: 'cosmic_king', name: '星海馆长', minPoints: 250000, color: '#493B78' }
]);

const ENDLESS_THEMES = Object.freeze([
  { name: '春日鲜果', color: '#46C7B7' },
  { name: '深海冰晶', color: '#45A9DD' },
  { name: '星空快递', color: '#9277E5' },
  { name: '黄金丰收', color: '#E5A62F' },
  { name: '霓虹夜市', color: '#E34F86' }
]);

function normalizePoints(value) {
  return Math.max(0, Math.floor(Number(value) || 0));
}

function getTotalPoints(data) {
  const source = data || {};
  const collectionPoints = source.collectionPoints == null ? source.fruitPoints : source.collectionPoints;
  return normalizePoints(source.adventurePoints) + normalizePoints(collectionPoints);
}

function getPointRank(points) {
  const value = normalizePoints(points);
  let rank = POINT_RANKS[0];
  for (let i = 1; i < POINT_RANKS.length; i += 1) {
    if (value < POINT_RANKS[i].minPoints) break;
    rank = POINT_RANKS[i];
  }
  const index = POINT_RANKS.indexOf(rank);
  const next = POINT_RANKS[index + 1] || null;
  const range = next ? Math.max(1, next.minPoints - rank.minPoints) : 1;
  return Object.assign({}, rank, {
    index,
    next,
    progress: next ? Math.min(1, (value - rank.minPoints) / range) : 1,
    pointsToNext: next ? Math.max(0, next.minPoints - value) : 0
  });
}

function calculateAdventurePoints(result, options) {
  const data = result || {};
  if (data.status !== 'won') return 0;
  const opts = options || {};
  const level = Math.max(1, Math.floor(Number(data.level) || 1));
  const boxes = Math.max(0, Math.floor(Number(data.boxesCompleted) || 0));
  const stars = Math.max(0, Math.floor(Number(data.stars) || 0));
  const score = Math.max(0, Math.floor(Number(data.score) || 0));
  const base = 120 + Math.min(level, 10000) * 3 + boxes * 14 + stars * 50 + Math.floor(score / 50);

  if (data.daily && opts.dailyImproved === false) return 0;
  if (data.challenge) return Math.max(1, Math.floor(base * 0.25));
  if (opts.firstClear === false) return Math.max(1, Math.floor(base * 0.2));
  return base;
}

function getJourneyInfo(levelNumber, themeId) {
  const level = Math.max(1, Math.floor(Number(levelNumber) || 1));
  if (themeId) {
    const theme = getTheme(themeId);
    if (level <= 10) return { endless: false, title: `${theme.shortName} · 第 ${level} 关`, subtitle: '轻松入门', wave: 0, season: 0, color: theme.color, themeId: theme.id };
    if (level <= 30) return { endless: false, title: `${theme.shortName} · 第 ${level} 关`, subtitle: '目标进阶', wave: 0, season: 0, color: theme.color, themeId: theme.id };
    if (level <= 60) return { endless: false, title: `${theme.shortName} · 第 ${level} 关`, subtitle: '收藏远征', wave: 0, season: 0, color: theme.color, themeId: theme.id };
    const wave = level - 60;
    const season = Math.floor((wave - 1) / 30) + 1;
    return {
      endless: true,
      title: `${theme.shortName}远征 · ${wave}波`,
      subtitle: `${theme.name}${season > 1 ? ` · 第${season}轮` : ''}`,
      wave,
      season,
      color: theme.color,
      themeId: theme.id
    };
  }
  if (level <= 10) return { endless: false, title: `第 ${level} 关`, subtitle: '新手装箱', wave: 0, season: 0, color: '#46C7B7' };
  if (level <= 30) return { endless: false, title: `第 ${level} 关`, subtitle: '进阶货架', wave: 0, season: 0, color: '#FF786B' };
  if (level <= 50) return { endless: false, title: `第 ${level} 关`, subtitle: '珍果远征', wave: 0, season: 0, color: '#9277E5' };

  const wave = level - 50;
  const themeIndex = Math.floor((wave - 1) / 20) % ENDLESS_THEMES.length;
  const season = Math.floor((wave - 1) / (20 * ENDLESS_THEMES.length)) + 1;
  const theme = ENDLESS_THEMES[themeIndex];
  return {
    endless: true,
    title: `无尽远征 · ${wave}波`,
    subtitle: `${theme.name}${season > 1 ? ` · 第${season}轮` : ''}`,
    wave,
    season,
    color: theme.color
  };
}

function formatPoints(value) {
  const points = normalizePoints(value);
  if (points >= 100000000) return `${trimDecimal(points / 100000000)}亿`;
  if (points >= 10000) return `${trimDecimal(points / 10000)}万`;
  return String(points);
}

function trimDecimal(value) {
  return value >= 100 ? String(Math.floor(value)) : value.toFixed(1).replace(/\.0$/, '');
}

module.exports = {
  ENDLESS_THEMES,
  POINT_RANKS,
  calculateAdventurePoints,
  formatPoints,
  getJourneyInfo,
  getPointRank,
  getTotalPoints,
  normalizePoints
};
