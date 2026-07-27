'use strict';

// 主题只保存轻量元数据。所有图标与收藏品都由 Canvas 程序化绘制，
// 这样可以持续扩充内容而不让微信小游戏上传包随 PNG 数量线性增长。
const THEMES = Object.freeze([
  Object.freeze({
    id: 'fruit',
    name: '奇幻果园',
    shortName: '果园',
    collectionName: '奇果藏册',
    shopName: '奇果展柜',
    itemLabel: '水果',
    icon: '果',
    color: '#46C7B7',
    darkColor: '#278F82',
    paleColor: '#E8FAF6',
    description: '收集 56 种会发光的奇幻珍果'
  }),
  Object.freeze({
    id: 'vegetable',
    name: '秘境菜园',
    shortName: '菜园',
    collectionName: '奇蔬藏册',
    shopName: '奇蔬展柜',
    itemLabel: '蔬菜',
    icon: '蔬',
    color: '#67B85E',
    darkColor: '#3F8A3A',
    paleColor: '#EFFAE9',
    description: '寻找会变色的秘境蔬菜'
  }),
  Object.freeze({
    id: 'animal',
    name: '萌兽森林',
    shortName: '萌兽',
    collectionName: '萌兽藏册',
    shopName: '萌兽展厅',
    itemLabel: '动物',
    icon: '兽',
    color: '#D18A57',
    darkColor: '#9B5C31',
    paleColor: '#FFF2E7',
    description: '结识森林里的原创萌兽'
  }),
  Object.freeze({
    id: 'toy',
    name: '玩具工坊',
    shortName: '玩具',
    collectionName: '奇趣玩具册',
    shopName: '玩具橱窗',
    itemLabel: '玩具',
    icon: '玩',
    color: '#F08A63',
    darkColor: '#C95B3E',
    paleColor: '#FFF0E8',
    description: '点亮发条、星舰与梦境玩具'
  }),
  Object.freeze({
    id: 'dessert',
    name: '甜点王国',
    shortName: '甜点',
    collectionName: '甜梦藏册',
    shopName: '甜梦橱窗',
    itemLabel: '甜点',
    icon: '甜',
    color: '#E878A5',
    darkColor: '#B94E7B',
    paleColor: '#FFF0F7',
    description: '收集不会融化的梦幻甜点'
  }),
  Object.freeze({
    id: 'appliance',
    name: '闪亮家电馆',
    shortName: '家电',
    collectionName: '未来家电册',
    shopName: '家电展厅',
    itemLabel: '家电',
    icon: '家',
    color: '#4DA7D9',
    darkColor: '#2D78A6',
    paleColor: '#EAF7FF',
    description: '收集会变色、会发光的未来家电'
  }),
  Object.freeze({
    id: 'digital',
    name: '数码星球',
    shortName: '数码',
    collectionName: '星际数码册',
    shopName: '数码舱',
    itemLabel: '电子产品',
    icon: '数',
    color: '#8B72E7',
    darkColor: '#6650B8',
    paleColor: '#F0ECFF',
    description: '解锁来自数码星球的未来装备'
  }),
  Object.freeze({
    id: 'vehicle',
    name: '交通博物馆',
    shortName: '交通',
    collectionName: '交通藏册',
    shopName: '交通展厅',
    itemLabel: '交通工具',
    icon: '行',
    color: '#E36F63',
    darkColor: '#B84840',
    paleColor: '#FFF0EB',
    description: '解锁陆海空的奇趣载具'
  }),
  Object.freeze({
    id: 'fashion',
    name: '梦幻衣橱',
    shortName: '衣橱',
    collectionName: '潮流藏册',
    shopName: '潮流展柜',
    itemLabel: '服饰',
    icon: '衣',
    color: '#B06ED8',
    darkColor: '#7D46A4',
    paleColor: '#F8EEFF',
    description: '点亮会发光的梦幻穿搭'
  }),
  Object.freeze({
    id: 'mascot',
    name: '原创萌友岛',
    shortName: '萌友',
    collectionName: '萌友相册',
    shopName: '萌友会客厅',
    itemLabel: '原创萌友',
    icon: '萌',
    color: '#E66FA5',
    darkColor: '#B9477B',
    paleColor: '#FFF0F7',
    description: '结识完全原创的岛屿萌友'
  })
]);

const THEME_MAP = THEMES.reduce((map, theme) => {
  map[theme.id] = theme;
  return map;
}, {});

function getTheme(themeId) {
  return THEME_MAP[themeId] || THEMES[0];
}

function getThemeIndex(themeId) {
  const index = THEMES.findIndex((theme) => theme.id === themeId);
  return index < 0 ? 0 : index;
}

function getNextTheme(themeId) {
  return THEMES[getThemeIndex(themeId) + 1] || null;
}

function normalizeThemeId(themeId) {
  return getTheme(themeId).id;
}

// 藏馆只展示已经开启的主题，以及紧随其后的一个锁定主题。
// 更远的主题连名字都不渲染，保留真正的未知感。
function getVisibleThemes(unlockedThemeIds) {
  const requested = new Set(Array.isArray(unlockedThemeIds) ? unlockedThemeIds : ['fruit']);
  let lastUnlockedIndex = 0;
  THEMES.forEach((theme, index) => {
    if (requested.has(theme.id)) lastUnlockedIndex = Math.max(lastUnlockedIndex, index);
  });
  return THEMES.slice(0, Math.min(THEMES.length, lastUnlockedIndex + 2));
}

module.exports = {
  THEMES,
  THEME_MAP,
  getNextTheme,
  getTheme,
  getThemeIndex,
  getVisibleThemes,
  normalizeThemeId
};
