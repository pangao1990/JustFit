'use strict';

// 微信关系链数据只能在开放数据域读取。这里使用微信托管的好友数据，
// 绘制“永久积分 / 藏品数”双榜；消费金币不会再导致好友排名倒退。
const canvas = wx.getSharedCanvas();
const ctx = canvas.getContext('2d');
const FONT = '-apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif';
let currentMetric = 'total_points';
let currentRows = [];
let hidden = false;
let scrollOffset = 0;
let selfOpenId = '';
let selfProfile = null;
let selfLookupStarted = false;
const avatarCache = Object.create(null);

wx.onMessage((message) => {
  if (!message) return;
  if (message.type === 'hide_rank') {
    hidden = true;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    return;
  }
  if (message.type === 'rank_scroll') {
    if (hidden || !currentRows.length) return;
    scrollOffset = clamp(scrollOffset + (Number(message.delta) || 0), 0, getMaxScroll());
    render();
    return;
  }
  if (message.type !== 'show_rank') return;

  hidden = false;
  currentMetric = message.metric === 'collection_count' ? 'collection_count' : 'total_points';
  scrollOffset = 0;
  resolveSelfProfile();
  drawMessage('正在读取微信好友成绩…');
  wx.getFriendCloudStorage({
    keyList: ['total_points', 'collection_count'],
    success(result) {
      currentRows = (result.data || []).slice().sort((a, b) => valueOf(b, currentMetric) - valueOf(a, currentMetric));
      render();
    },
    fail() {
      currentRows = [];
      drawMessage('暂无好友成绩\n邀请好友玩一局后即可上榜');
    }
  });
});

function resolveSelfProfile() {
  if (selfLookupStarted || typeof wx.getUserInfo !== 'function') return;
  selfLookupStarted = true;
  try {
    wx.getUserInfo({
      openIdList: ['selfOpenId'],
      success(result) {
        const profile = result && result.data && result.data[0] || null;
        selfProfile = profile;
        selfOpenId = rowOpenId(profile);
        if (!hidden) render();
      },
      fail() {
        selfProfile = null;
        selfLookupStarted = false;
      }
    });
  } catch (_) {
    selfProfile = null;
    selfLookupStarted = false;
  }
}

function valueOf(row, key) {
  const list = row && row.KVDataList || [];
  const entry = list.find((item) => item.key === key);
  return entry ? Math.max(0, Math.floor(Number(entry.value) || 0)) : 0;
}

function render() {
  if (hidden) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!currentRows.length) {
    drawMessage('还没有好友上榜\n分享战绩，邀请第一位对手');
    return;
  }

  scrollOffset = clamp(scrollOffset, 0, getMaxScroll());
  const rowHeight = getRowHeight();
  const cardHeight = rowHeight - 12;
  const viewportTop = 8;
  const viewportBottom = canvas.height - 8;
  const selfIndex = findSelfIndex();
  let selfVisible = false;

  currentRows.forEach((row, index) => {
    const y = viewportTop + index * rowHeight - scrollOffset;
    if (y + cardHeight < viewportTop || y > viewportBottom) return;
    drawRankRow(row, index, y, cardHeight, false);
    if (index === selfIndex && y >= viewportTop - 2 && y + cardHeight <= viewportBottom + 2) selfVisible = true;
  });

  if (selfIndex >= 0 && !selfVisible) drawFloatingSelf(currentRows[selfIndex], selfIndex);
}

function getRowHeight() {
  return Math.max(78, Math.min(96, canvas.height / 7.1));
}

function getMaxScroll() {
  const contentHeight = currentRows.length * getRowHeight() + 4;
  return Math.max(0, contentHeight - canvas.height + 16);
}

function findSelfIndex() {
  if (selfOpenId) {
    const index = currentRows.findIndex((row) => rowOpenId(row) === selfOpenId);
    if (index >= 0) return index;
  }
  if (!selfProfile) return -1;
  return currentRows.findIndex((row) => (
    row.nickname === selfProfile.nickname && row.avatarUrl === selfProfile.avatarUrl
  ));
}

function rowOpenId(row) {
  return String(row && (row.openid || row.openId) || '');
}

function drawRankRow(row, index, y, height, floating) {
  const rank = index + 1;
  const topThree = rank <= 3;
  const x = floating ? 18 : 12;
  const width = canvas.width - x * 2;
  const colors = ['#D99B20', '#7B8796', '#B56C42'];
  const backgrounds = [
    ['#FFF8D9', '#FFE7A3'],
    ['#F8FAFC', '#E5EBF1'],
    ['#FFF1E8', '#F4D1BA']
  ];

  ctx.save();
  if (floating) {
    ctx.shadowColor = 'rgba(61,49,82,0.28)';
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 6;
  } else if (topThree) {
    ctx.shadowColor = colorWithAlpha(colors[index], 0.22);
    ctx.shadowBlur = rank === 1 ? 16 : 10;
    ctx.shadowOffsetY = 4;
  }
  roundedRect(x, y, width, height, 22);
  if (floating) {
    const gradient = ctx.createLinearGradient(x, y, x + width, y + height);
    gradient.addColorStop(0, '#F1ECFF');
    gradient.addColorStop(1, '#FFF8DD');
    ctx.fillStyle = gradient;
  } else if (topThree) {
    const gradient = ctx.createLinearGradient(x, y, x + width, y + height);
    gradient.addColorStop(0, backgrounds[index][0]);
    gradient.addColorStop(1, backgrounds[index][1]);
    ctx.fillStyle = gradient;
  } else {
    ctx.fillStyle = 'rgba(255,255,255,0.82)';
  }
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.strokeStyle = floating ? '#9277E5' : (topThree ? colorWithAlpha(colors[index], 0.5) : 'rgba(61,49,82,0.08)');
  ctx.lineWidth = floating || rank === 1 ? 3 : 2;
  ctx.stroke();
  ctx.restore();

  const centerY = y + height / 2;
  const avatarSize = Math.min(58, height - 22);
  const avatarX = x + 68;
  const rankColor = topThree ? colors[index] : '#756A84';

  if (topThree) drawMedal(rank, x + 36, centerY, rankColor);
  else drawCentered(String(rank), x + 36, centerY, 23, rankColor, 'center', 900);

  if (topThree) drawGloryRing(avatarX, centerY - avatarSize / 2, avatarSize, rankColor, rank === 1);
  drawAvatar(row.avatarUrl, avatarX, centerY - avatarSize / 2, avatarSize, row.nickname || `好友${rank}`);
  if (rank === 1) drawCrown(avatarX + avatarSize / 2, centerY - avatarSize / 2 - 8, rankColor);

  const nameX = avatarX + avatarSize + 18;
  const nameWidth = Math.max(72, width - (nameX - x) - 166);
  drawCentered(trimName(row.nickname || `好友${rank}`, 7), nameX, centerY - (floating ? 8 : 0), 22, '#3D3152', 'left', 800, nameWidth);
  if (floating) drawCentered('我的排名', nameX, centerY + 20, 15, '#7458C7', 'left', 800, nameWidth);

  const suffix = currentMetric === 'collection_count' ? '件' : '分';
  const valueColor = currentMetric === 'collection_count' ? '#278F82' : '#D99B20';
  drawCentered(`${formatNumber(valueOf(row, currentMetric))}${suffix}`, x + width - 24, centerY, 23, valueColor, 'right', 900, 142);
}

function drawFloatingSelf(row, index) {
  const height = Math.min(86, getRowHeight() - 2);
  drawRankRow(row, index, canvas.height - height - 10, height, true);
}

function drawMedal(rank, x, y, color) {
  ctx.save();
  ctx.fillStyle = colorWithAlpha(color, 0.16);
  ctx.beginPath();
  ctx.arc(x, y, 22, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.stroke();
  drawCentered(String(rank), x, y, 22, color, 'center', 900);
  ctx.restore();
}

function drawGloryRing(x, y, size, color, first) {
  ctx.save();
  ctx.strokeStyle = colorWithAlpha(color, first ? 0.75 : 0.52);
  ctx.lineWidth = first ? 6 : 4;
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, size / 2 + (first ? 5 : 3), 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawCrown(x, y, color) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x - 14, y + 9);
  ctx.lineTo(x - 10, y - 7);
  ctx.lineTo(x, y + 2);
  ctx.lineTo(x + 10, y - 7);
  ctx.lineTo(x + 14, y + 9);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawAvatar(url, x, y, size, fallback) {
  ctx.save();
  ctx.fillStyle = '#DDF6F3';
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
  ctx.fill();
  drawCentered(String(fallback || '友').slice(0, 1), x + size / 2, y + size / 2, Math.floor(size * 0.4), '#278F82', 'center', 800);
  ctx.restore();

  if (!url || typeof wx.createImage !== 'function') return;
  const cached = avatarCache[url];
  if (cached && cached.ready) {
    drawAvatarImage(cached.image, x, y, size);
    return;
  }
  if (cached) return;

  const image = wx.createImage();
  avatarCache[url] = { image, ready: false };
  image.onload = () => {
    avatarCache[url].ready = true;
    if (!hidden) render();
  };
  image.onerror = () => { avatarCache[url].failed = true; };
  image.src = url;
}

function drawAvatarImage(image, x, y, size) {
  const width = Math.max(1, Number(image.width) || size);
  const height = Math.max(1, Number(image.height) || size);
  let sx = 0;
  let sy = 0;
  let crop = Math.min(width, height);
  if (width > height) sx = (width - height) / 2;
  else if (height > width) sy = (height - width) / 2;
  crop = Math.min(width, height);
  ctx.save();
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
  ctx.clip();
  ctx.drawImage(image, sx, sy, crop, crop, x, y, size, size);
  ctx.restore();
}

function drawMessage(message) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const lines = String(message).split('\n');
  const size = Math.max(20, Math.min(24, Math.floor(canvas.width / 25)));
  const lineGap = size + 18;
  const startY = canvas.height / 2 - (lines.length - 1) * lineGap / 2;
  lines.forEach((line, index) => {
    drawCentered(line, canvas.width / 2, startY + index * lineGap, size, '#756A84', 'center', 700, canvas.width - 64);
  });
}

function drawCentered(text, x, y, size, color, align, weight, maxWidth) {
  const readableWeight = normalizeFontWeight(weight);
  const fitted = fitText(text, size, readableWeight, maxWidth);
  ctx.save();
  ctx.font = `${readableWeight} ${fitted.size}px ${FONT}`;
  ctx.fillStyle = color;
  ctx.textAlign = align || 'center';
  ctx.textBaseline = 'alphabetic';
  const metrics = ctx.measureText(fitted.text);
  const ascent = Number(metrics && metrics.actualBoundingBoxAscent);
  const descent = Number(metrics && metrics.actualBoundingBoxDescent);
  const hasBounds = Number.isFinite(ascent) && Number.isFinite(descent) && ascent + descent > 0;
  const baselineY = y + (hasBounds ? (ascent - descent) / 2 : fitted.size * 0.34);
  ctx.fillText(fitted.text, x, baselineY);
  ctx.restore();
}

function fitText(text, requestedSize, weight, maxWidth) {
  let content = String(text == null ? '' : text);
  let size = Math.max(12, Number(requestedSize) || 12);
  const width = Math.max(0, Number(maxWidth) || 0);
  if (!width) return { text: content, size };
  ctx.save();
  ctx.font = `${weight} ${size}px ${FONT}`;
  while (size > 15 && ctx.measureText(content).width > width) {
    size -= 1;
    ctx.font = `${weight} ${size}px ${FONT}`;
  }
  if (ctx.measureText(content).width > width) {
    const suffix = '…';
    while (content.length > 1 && ctx.measureText(`${content}${suffix}`).width > width) content = content.slice(0, -1);
    content += suffix;
  }
  ctx.restore();
  return { text: content, size };
}

function normalizeFontWeight(weight) {
  const value = Math.max(100, Math.min(900, Number(weight) || 700));
  return Math.round(value / 100) * 100;
}

function roundedRect(x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function trimName(value, limit) {
  const chars = Array.from(String(value || ''));
  return chars.length > limit ? `${chars.slice(0, limit - 1).join('')}…` : chars.join('');
}

function formatNumber(value) {
  if (value >= 100000000) return `${(value / 100000000).toFixed(1).replace(/\.0$/, '')}亿`;
  if (value >= 10000) return `${(value / 10000).toFixed(1).replace(/\.0$/, '')}万`;
  return String(value);
}

function colorWithAlpha(hex, alpha) {
  const value = String(hex || '#000000').replace('#', '');
  if (value.length !== 6) return `rgba(0,0,0,${alpha})`;
  return `rgba(${parseInt(value.slice(0, 2), 16)},${parseInt(value.slice(2, 4), 16)},${parseInt(value.slice(4, 6), 16)},${alpha})`;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
