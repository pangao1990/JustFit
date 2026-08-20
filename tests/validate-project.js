'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const errors = [];
const warnings = [];

const requiredFiles = [
  'game.js',
  'game.json',
  'project.config.json',
  'readme.md',
  'open-data/index.js',
  'src/app.js',
  'src/economy.js',
  'src/friend-rank.js',
  'src/game-model.js',
  'src/item-rules.js',
  'src/mechanics.js',
  'src/progression.js',
  'src/rare-fruit-visuals.js',
  'src/collectible-visuals.js',
  'src/theme-collectibles.js',
  'src/themes.js',
  'src/renderer.js',
  'assets/game-icon.png',
  'assets/share-card.png',
  'assets/audio/tap.wav',
  'assets/audio/place.wav',
  'assets/audio/pack.wav',
  'assets/audio/combo.wav',
  'assets/audio/win.wav',
  'assets/audio/fail.wav',
  'assets/audio/rare.wav',
  'assets/audio/bgm.wav'
];

[
  'starlight-strawberry', 'moon-grapes', 'crystal-pear', 'flame-dragonfruit',
  'aurora-kiwi', 'golden-pineapple', 'galaxy-watermelon', 'rainbow-mangosteen'
].forEach((name) => requiredFiles.push(`assets/rare-fruits/${name}.png`));

requiredFiles.forEach((relative) => {
  if (!fs.existsSync(path.join(root, relative))) errors.push(`缺少文件：${relative}`);
});

function readJson(relative) {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));
  } catch (error) {
    errors.push(`${relative} 不是有效 JSON：${error.message}`);
    return {};
  }
}

const gameConfig = readJson('game.json');
const projectConfig = readJson('project.config.json');
const packageConfig = readJson('package.json');
const packageLock = readJson('package-lock.json');

if (gameConfig.deviceOrientation !== 'portrait') errors.push('game.json 必须锁定 portrait 竖屏');
if (gameConfig.openDataContext !== 'open-data') {
  errors.push('game.json openDataContext 必须指向 open-data，以加载开放数据域 index.js');
}
if (projectConfig.compileType !== 'game') errors.push('project.config.json compileType 必须为 game');
if (projectConfig.openDataContextRoot !== 'open-data') {
  errors.push('project.config.json openDataContextRoot 必须指向 open-data');
}
if (projectConfig.appid === 'touristappid') warnings.push('发布前需把 touristappid 替换为正式小游戏 AppID');
if (packageConfig.version !== '1.1.0') errors.push('package.json 版本号必须为 1.1.0');
if (packageLock.version !== '1.1.0' || !packageLock.packages || packageLock.packages[''].version !== '1.1.0') {
  errors.push('package-lock.json 版本号必须与 1.1.0 保持一致');
}
if (!packageConfig.scripts || !packageConfig.scripts.test || !packageConfig.scripts['build:web']) {
  errors.push('package.json 缺少 test 或 build:web 脚本');
}

const jsFiles = [];
function walk(directory) {
  fs.readdirSync(directory, { withFileTypes: true }).forEach((entry) => {
    if (entry.name === 'node_modules' || entry.name === 'web' && directory === root) return;
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(filename);
    else if (entry.name.endsWith('.js')) jsFiles.push(filename);
  });
}
walk(root);

jsFiles.forEach((filename) => {
  const check = spawnSync(process.execPath, ['--check', filename], { encoding: 'utf8' });
  if (check.status !== 0) errors.push(`JavaScript 语法错误：${path.relative(root, filename)}\n${check.stderr}`);

  const source = fs.readFileSync(filename, 'utf8');
  const requirePattern = /require\(['"](\.[^'"]+)['"]\)/g;
  let match = null;
  while ((match = requirePattern.exec(source))) {
    let target = path.resolve(path.dirname(filename), match[1]);
    if (!path.extname(target)) target += '.js';
    if (!fs.existsSync(target)) errors.push(`${path.relative(root, filename)} 引用了不存在的 ${match[1]}`);
  }
});

function hasSignature(relative, signature) {
  const filename = path.join(root, relative);
  if (!fs.existsSync(filename)) return;
  const data = fs.readFileSync(filename);
  if (!data.subarray(0, signature.length).equals(signature)) errors.push(`${relative} 文件头无效`);
}

hasSignature('assets/game-icon.png', Buffer.from([0x89, 0x50, 0x4e, 0x47]));
hasSignature('assets/share-card.png', Buffer.from([0x89, 0x50, 0x4e, 0x47]));
['tap', 'place', 'pack', 'combo', 'rare', 'win', 'fail', 'bgm'].forEach((name) => {
  hasSignature(`assets/audio/${name}.wav`, Buffer.from('RIFF'));
});

let packageBytes = 0;
function measure(directory) {
  fs.readdirSync(directory, { withFileTypes: true }).forEach((entry) => {
    if (['node_modules', '.git', '.playwright-cli', 'tests', 'scripts', 'web', 'output'].includes(entry.name)) return;
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) measure(filename);
    else packageBytes += fs.statSync(filename).size;
  });
}
measure(root);
if (packageBytes > 20 * 1024 * 1024) errors.push(`运行包约 ${(packageBytes / 1024 / 1024).toFixed(2)}MB，超过 20MB 检查线`);

const configSource = fs.existsSync(path.join(root, 'src/config.js'))
  ? fs.readFileSync(path.join(root, 'src/config.js'), 'utf8')
  : '';
if (!/VERSION:\s*['"]1\.1\.0['"]/.test(configSource)) {
  errors.push('src/config.js 版本号必须为 1.1.0');
}
if (/enabled:\s*true/.test(configSource) && /REPLACE_WITH/.test(configSource)) {
  errors.push('广告已启用，但广告位 ID 仍是占位符');
}

const rendererSource = fs.existsSync(path.join(root, 'src/renderer.js'))
  ? fs.readFileSync(path.join(root, 'src/renderer.js'), 'utf8')
  : '';
rendererSource.split('\n').forEach((line, index) => {
  if (line.indexOf('ctx.font =') < 0) return;
  if (!/readableWeight|normalizeFontWeight/.test(line)) {
    errors.push(`src/renderer.js:${index + 1} 的 Canvas 字体未经过标准字重归一化`);
  }
});
if (rendererSource.indexOf('接近后才显示轮廓') >= 0) {
  errors.push('图鉴封存卡片仍包含已要求删除的提示文案');
}
['点击查看说明', '看目标，再点顶层', '看目标 · 点顶层 · 限时收集', '下一组', '累计金币'].forEach((forbiddenText) => {
  if (rendererSource.indexOf(forbiddenText) >= 0) {
    errors.push(`src/renderer.js 仍包含已要求删除的“${forbiddenText}”`);
  }
});
if (rendererSource.indexOf('积分') >= 0) {
  errors.push('src/renderer.js 仍显示“积分”，玩家界面货币口径必须统一为金币');
}
if (/ctx\.textBaseline\s*=\s*['"]middle['"]/.test(rendererSource)) {
  errors.push('src/renderer.js 仍直接使用 textBaseline="middle"，真机 Tag 可能无法垂直居中');
}
if (/\.fillText\([^;\n]*,\s*maxWidth\s*\)/.test(rendererSource)) {
  errors.push('src/renderer.js 仍使用 fillText 的 maxWidth 横向压缩文字，真机会出现瘦高字形');
}
const scalePattern = /ctx\.scale\(([^,\n]+),\s*([^\)\n]+)\)/g;
let scaleMatch = null;
while ((scaleMatch = scalePattern.exec(rendererSource))) {
  const horizontal = scaleMatch[1].replace(/\s+/g, '');
  const vertical = scaleMatch[2].replace(/\s+/g, '');
  if (horizontal !== vertical) {
    const line = rendererSource.slice(0, scaleMatch.index).split('\n').length;
    errors.push(`src/renderer.js:${line} 使用了非等比 Canvas 缩放，可能造成文字或图标变形`);
  }
}
if (!/drawImageContained\(\s*ctx,\s*view\.friendRankCanvas/.test(rendererSource)) {
  errors.push('好友榜必须使用等比绘制，不得把开放数据画布拉伸到面板');
}
['仓库装饰', '装进仓库'].forEach((ambiguousText) => {
  if ((rendererSource + fs.readFileSync(path.join(root, 'src/app.js'), 'utf8')).indexOf(ambiguousText) >= 0) {
    errors.push(`玩家界面仍包含含糊文案“${ambiguousText}”，应统一为“装箱基地”`);
  }
});

const openDataSource = fs.existsSync(path.join(root, 'open-data/index.js'))
  ? fs.readFileSync(path.join(root, 'open-data/index.js'), 'utf8')
  : '';
if (/\bcanvas\.(?:width|height)\s*=/.test(openDataSource)) {
  errors.push('open-data/index.js 不得修改只读 sharedCanvas 尺寸，应由主域统一设置');
}
openDataSource.split('\n').forEach((line, index) => {
  if (line.indexOf('ctx.font =') < 0) return;
  if (!/readableWeight|\$\{weight\}/.test(line)) {
    errors.push(`open-data/index.js:${index + 1} 的 Canvas 字体未使用标准整百字重`);
  }
});
if (/ctx\.textBaseline\s*=\s*['"]middle['"]/.test(openDataSource)) {
  errors.push('open-data/index.js 不得使用 textBaseline="middle"，中文可能偏移或变形');
}
if (/\.fillText\([^;\n]*,\s*[^,\n]+\s*,\s*[^,\n]+\s*,\s*[^,\n]+\s*\)/.test(openDataSource)) {
  errors.push('open-data/index.js 不得使用 fillText 的 maxWidth 参数压缩文字');
}

const shareSource = fs.existsSync(path.join(root, 'src/share.js'))
  ? fs.readFileSync(path.join(root, 'src/share.js'), 'utf8')
  : '';
if (shareSource.indexOf('积分') >= 0) {
  errors.push('src/share.js 仍包含“积分”，分享文案货币口径必须统一为金币');
}
if (shareSource.indexOf('累计金币') >= 0) {
  errors.push('src/share.js 仍包含“累计金币”，分享必须只展示当前金币');
}

const friendRankSource = fs.existsSync(path.join(root, 'src/friend-rank.js'))
  ? fs.readFileSync(path.join(root, 'src/friend-rank.js'), 'utf8')
  : '';
if (/lifetime_coins|total_score|getLifetimeCoins/.test(friendRankSource + openDataSource)) {
  errors.push('好友榜仍残留历史累计字段，必须只读取 coins 与 collection_count');
}

const webBundleSource = fs.existsSync(path.join(root, 'web/game.bundle.js'))
  ? fs.readFileSync(path.join(root, 'web/game.bundle.js'), 'utf8')
  : '';
if (webBundleSource && !/VERSION:\s*['"]1\.1\.0['"]/.test(webBundleSource)) {
  errors.push('web/game.bundle.js 版本号不是 1.1.0，请重新执行 npm run build:web');
}

console.log(`检查了 ${jsFiles.length} 个 JavaScript 文件`);
console.log(`预计运行包体积：${(packageBytes / 1024 / 1024).toFixed(2)} MB`);
warnings.forEach((warning) => console.warn(`提醒：${warning}`));

if (errors.length) {
  errors.forEach((error) => console.error(`错误：${error}`));
  console.error(`\n项目校验失败，共 ${errors.length} 个问题`);
  process.exit(1);
}

console.log('项目结构、语法、资源签名和包体检查通过');
