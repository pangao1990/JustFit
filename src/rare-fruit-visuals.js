'use strict';

// The first eight rare fruits use hand-authored PNGs. The remaining fruits are
// painted from this compact Canvas vocabulary so the 56-item collection does
// not add dozens of bitmap files to the WeChat upload package.

function drawRareFruitVisual(ctx, fruit, image, x, y, size) {
  if (!ctx || !fruit || !size) return;
  if (drawImageIfReady(ctx, image, x, y, size)) return;

  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 128, size / 128);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.shadowColor = fruit.glow || fruit.accent || fruit.color;
  ctx.shadowBlur = fruit.plain ? 3 : 10;
  drawFruitBase(ctx, fruit);
  if (!fruit.plain) drawFruitMotif(ctx, fruit);
  ctx.restore();
}

function drawImageIfReady(ctx, image, x, y, size) {
  if (!image) return false;
  try {
    ctx.drawImage(image, x - size / 2, y - size / 2, size, size);
    return true;
  } catch (_) {
    return false;
  }
}

function drawFruitBase(ctx, fruit) {
  const shape = fruit.shape || 'round';
  const dark = shade(fruit.color, -34);
  const light = shade(fruit.color, 34);
  const accent = fruit.accent || light;
  const leaf = leafColor(fruit);
  const body = ctx.createLinearGradient(-50, -54, 52, 58);
  body.addColorStop(0, light);
  body.addColorStop(0.42, fruit.color);
  body.addColorStop(1, dark);
  ctx.fillStyle = body;
  ctx.strokeStyle = dark;
  ctx.lineWidth = 5;

  if (shape === 'strawberry') {
    fruitLeaves(ctx, leaf, 0, -39, 1.05);
    ctx.fillStyle = body;
    ctx.strokeStyle = dark;
    ctx.beginPath();
    ctx.moveTo(0, 55);
    ctx.bezierCurveTo(-52, 28, -52, -30, -19, -34);
    ctx.bezierCurveTo(-7, -49, 7, -49, 19, -34);
    ctx.bezierCurveTo(52, -30, 52, 28, 0, 55);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (shape === 'grapes' || shape === 'cluster') {
    ctx.strokeStyle = shade(leaf, -30);
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(0, -38);
    ctx.quadraticCurveTo(5, -59, 29, -65);
    ctx.stroke();
    fruitLeaf(ctx, leaf, 28, -55, 0.45, 0.9);
    const berries = shape === 'grapes'
      ? [[-18,-30,19],[18,-30,19],[-34,0,20],[0,0,22],[34,0,20],[-18,30,21],[18,30,21],[0,57,18]]
      : [[-22,-25,20],[12,-31,19],[31,-6,19],[-34,5,20],[-6,4,21],[18,20,20],[-24,34,20],[5,45,20]];
    berries.forEach((berry, index) => drawBerry(ctx, fruit, berry[0], berry[1], berry[2], index));
  } else if (shape === 'pear') {
    stemAndLeaf(ctx, leaf, 4, -48);
    ctx.fillStyle = body;
    ctx.strokeStyle = dark;
    pearPath(ctx);
    ctx.fill();
    ctx.stroke();
  } else if (shape === 'mango') {
    stemAndLeaf(ctx, leaf, 10, -47);
    ctx.fillStyle = body;
    ctx.strokeStyle = dark;
    ctx.beginPath();
    ctx.ellipse(0, 7, 38, 56, -0.42, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = rgba(accent, 0.46);
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(-4, 4, 24, Math.PI * 0.75, Math.PI * 1.65); ctx.stroke();
  } else if (shape === 'avocado') {
    stemAndLeaf(ctx, leaf, 4, -48);
    ctx.fillStyle = body;
    ctx.strokeStyle = dark;
    pearPath(ctx);
    ctx.fill();
    ctx.stroke();
    ctx.save();
    ctx.scale(0.72, 0.76);
    ctx.fillStyle = '#D8E76F';
    ctx.strokeStyle = rgba(dark, 0.35);
    ctx.lineWidth = 4;
    pearPath(ctx);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = '#98623D';
    ctx.strokeStyle = '#70452D';
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(0, 22, 19, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.beginPath(); ctx.arc(-6, 15, 5, 0, Math.PI * 2); ctx.fill();
  } else if (shape === 'papaya') {
    ctx.fillStyle = body;
    ctx.strokeStyle = dark;
    ctx.beginPath(); ctx.ellipse(0, 6, 36, 58, -0.1, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#F5C95A';
    ctx.beginPath(); ctx.ellipse(0, 8, 21, 47, -0.1, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#4D4137';
    [[-6,-22],[7,-17],[-8,-6],[8,1],[-7,15],[6,24],[-3,38]].forEach(([seedX, seedY]) => {
      ctx.beginPath(); ctx.ellipse(seedX, seedY, 4, 6, 0.2, 0, Math.PI * 2); ctx.fill();
    });
    stemAndLeaf(ctx, leaf, 4, -49);
  } else if (shape === 'coconut') {
    ctx.fillStyle = body;
    ctx.strokeStyle = dark;
    ctx.beginPath(); ctx.arc(0, 8, 51, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = rgba(accent, 0.5);
    ctx.lineWidth = 4;
    [-22, 0, 22].forEach((offset) => {
      ctx.beginPath(); ctx.moveTo(offset - 14, -34); ctx.quadraticCurveTo(offset, 3, offset - 9, 46); ctx.stroke();
    });
    ctx.fillStyle = '#5A3B2B';
    [[-14,-7],[12,-9],[0,8]].forEach(([holeX, holeY]) => {
      ctx.beginPath(); ctx.arc(holeX, holeY, 6, 0, Math.PI * 2); ctx.fill();
    });
  } else if (shape === 'pomegranate') {
    ctx.fillStyle = body;
    ctx.strokeStyle = dark;
    ctx.beginPath(); ctx.arc(0, 11, 49, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-22, -31); ctx.lineTo(-14, -59); ctx.lineTo(0, -42);
    ctx.lineTo(15, -61); ctx.lineTo(22, -31); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.strokeStyle = rgba(accent, 0.62);
    ctx.lineWidth = 3;
    [-1, 0, 1].forEach((offset) => {
      ctx.beginPath(); ctx.arc(offset * 18, 13, 13, 0, Math.PI * 2); ctx.stroke();
    });
  } else if (shape === 'persimmon') {
    ctx.fillStyle = body;
    ctx.strokeStyle = dark;
    ctx.beginPath(); ctx.ellipse(0, 12, 52, 43, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    fruitLeaves(ctx, leaf, 0, -27, 1.18);
    ctx.strokeStyle = rgba(accent, 0.42);
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(0, 12, 32, Math.PI * 0.18, Math.PI * 0.82); ctx.stroke();
  } else if (shape === 'plum') {
    stemAndLeaf(ctx, leaf, 6, -45);
    ctx.fillStyle = body;
    ctx.strokeStyle = dark;
    ctx.beginPath(); ctx.ellipse(0, 8, 45, 52, -0.18, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = rgba(accent, 0.5);
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(3, -34); ctx.quadraticCurveTo(-9, 8, 4, 48); ctx.stroke();
  } else if (shape === 'dragonfruit') {
    dragonSpikes(ctx, accent, dark);
    ctx.fillStyle = body;
    ctx.strokeStyle = dark;
    ctx.beginPath();
    ctx.ellipse(0, 6, 42, 57, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  } else if (shape === 'kiwi') {
    ctx.fillStyle = '#8D6544';
    ctx.strokeStyle = '#65442E';
    ctx.beginPath();
    ctx.arc(0, 4, 56, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    const flesh = ctx.createRadialGradient(-8, -6, 4, 0, 4, 48);
    flesh.addColorStop(0, '#FFF2A6');
    flesh.addColorStop(0.22, shade(fruit.color, 35));
    flesh.addColorStop(1, fruit.color);
    ctx.fillStyle = flesh;
    ctx.beginPath();
    ctx.arc(0, 4, 47, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#F7F0A6';
    ctx.beginPath();
    ctx.arc(0, 4, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#263B3B';
    for (let i = 0; i < 16; i += 1) {
      const angle = i * Math.PI * 2 / 16;
      ctx.beginPath();
      ctx.ellipse(Math.cos(angle) * 31, 4 + Math.sin(angle) * 31, 2.4, 5.5, angle, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (shape === 'pineapple') {
    pineappleCrown(ctx, leaf);
    ctx.fillStyle = body;
    ctx.strokeStyle = dark;
    ctx.beginPath();
    ctx.ellipse(0, 13, 42, 53, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = rgba(dark, 0.58);
    ctx.lineWidth = 3;
    [-28, 0, 28].forEach((offset) => {
      ctx.beginPath(); ctx.moveTo(-38, -15 + offset); ctx.lineTo(30, 53 + offset); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(38, -15 + offset); ctx.lineTo(-30, 53 + offset); ctx.stroke();
    });
  } else if (shape === 'watermelon') {
    ctx.fillStyle = accent;
    ctx.strokeStyle = shade(accent, -35);
    watermelonPath(ctx, 59, 61);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = body;
    watermelonPath(ctx, 49, 50);
    ctx.fill();
  } else if (shape === 'mangosteen') {
    ctx.fillStyle = body;
    ctx.strokeStyle = dark;
    ctx.beginPath();
    ctx.arc(0, 8, 51, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    fruitLeaves(ctx, leaf, 0, -39, 1.05);
    ctx.fillStyle = 'rgba(255,255,255,0.88)';
    ctx.beginPath();
    ctx.arc(0, 15, 31, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = rgba(accent, 0.5);
    ctx.lineWidth = 3;
    for (let i = 0; i < 6; i += 1) {
      const angle = i * Math.PI / 3;
      ctx.beginPath();
      ctx.moveTo(0, 15);
      ctx.quadraticCurveTo(Math.cos(angle + 0.5) * 20, 15 + Math.sin(angle + 0.5) * 20, Math.cos(angle) * 30, 15 + Math.sin(angle) * 30);
      ctx.stroke();
    }
  } else if (shape === 'cherry') {
    ctx.strokeStyle = shade(leaf, -32);
    ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(-23, -4); ctx.quadraticCurveTo(-14, -42, 2, -54); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(24, -4); ctx.quadraticCurveTo(18, -41, 2, -54); ctx.stroke();
    fruitLeaf(ctx, leaf, 19, -50, 0.25, 0.85);
    drawCherry(ctx, fruit, -24, 18, false);
    drawCherry(ctx, fruit, 24, 18, true);
  } else if (shape === 'peach') {
    stemAndLeaf(ctx, leaf, 7, -48);
    ctx.fillStyle = body;
    ctx.strokeStyle = dark;
    peachPath(ctx);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = rgba(dark, 0.4);
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(0, -28); ctx.quadraticCurveTo(10, 10, 0, 52); ctx.stroke();
  } else if (shape === 'starfruit') {
    ctx.fillStyle = body;
    ctx.strokeStyle = dark;
    starPath(ctx, 0, 5, 57, 27, 5);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = rgba(accent, 0.58);
    ctx.lineWidth = 3;
    for (let i = 0; i < 5; i += 1) {
      const angle = -Math.PI / 2 + i * Math.PI * 2 / 5;
      ctx.beginPath(); ctx.moveTo(0, 5); ctx.lineTo(Math.cos(angle) * 51, 5 + Math.sin(angle) * 51); ctx.stroke();
    }
  } else if (shape === 'spiky') {
    spikyHalo(ctx, accent, dark);
    ctx.fillStyle = body;
    ctx.strokeStyle = dark;
    ctx.beginPath();
    ctx.ellipse(0, 5, 44, 50, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  } else if (shape === 'banana') {
    ctx.fillStyle = body;
    ctx.strokeStyle = dark;
    bananaPath(ctx);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = '#765036';
    ctx.lineWidth = 7;
    ctx.beginPath(); ctx.moveTo(-35, -39); ctx.lineTo(-42, -55); ctx.stroke();
  } else if (shape === 'melon') {
    ctx.fillStyle = body;
    ctx.strokeStyle = dark;
    ctx.beginPath();
    ctx.ellipse(0, 6, 53, 46, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = rgba(accent, 0.65);
    ctx.lineWidth = 4;
    [18, 35].forEach((radius) => {
      ctx.beginPath(); ctx.ellipse(0, 6, radius, 43, 0, 0, Math.PI * 2); ctx.stroke();
    });
    stemAndLeaf(ctx, leaf, 0, -41);
  } else if (shape === 'citrus') {
    stemAndLeaf(ctx, leaf, 7, -45);
    ctx.fillStyle = body;
    ctx.strokeStyle = dark;
    ctx.beginPath(); ctx.arc(0, 7, 50, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = rgba(accent, 0.52);
    ctx.lineWidth = 3;
    for (let i = 0; i < 8; i += 1) {
      const angle = i * Math.PI / 4;
      ctx.beginPath(); ctx.moveTo(0, 7); ctx.lineTo(Math.cos(angle) * 43, 7 + Math.sin(angle) * 43); ctx.stroke();
    }
  } else if (shape === 'shell') {
    ctx.fillStyle = body;
    ctx.strokeStyle = dark;
    ctx.beginPath(); ctx.arc(0, 7, 51, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = rgba(accent, 0.54);
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(0, 7, 35, -Math.PI * 0.9, Math.PI * 0.9); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-38, -24); ctx.quadraticCurveTo(0, -48, 38, -24); ctx.stroke();
    stemAndLeaf(ctx, leaf, 4, -43);
  } else {
    stemAndLeaf(ctx, leaf, 4, -45);
    ctx.fillStyle = body;
    ctx.strokeStyle = dark;
    ctx.beginPath(); ctx.arc(0, 7, 50, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }

  if (['grapes', 'cluster', 'kiwi', 'mangosteen'].indexOf(shape) < 0) {
    shine(ctx, -18, -18, 10, 21);
  }
}

function drawFruitMotif(ctx, fruit) {
  const motif = fruit.motif || 'star';
  const glow = fruit.glow || shade(fruit.accent || fruit.color, 30);
  const ink = rgba(glow, 0.97);
  ctx.save();
  ctx.shadowColor = glow;
  ctx.shadowBlur = 7;
  ctx.strokeStyle = ink;
  ctx.fillStyle = ink;
  ctx.lineWidth = 3.5;

  if (motif === 'star') {
    fillStar(ctx, -18, 2, 9, ink);
    fillStar(ctx, 17, 18, 7, ink);
    fillStar(ctx, 9, -20, 6, ink);
  } else if (motif === 'moon') {
    ctx.beginPath(); ctx.arc(2, 7, 21, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = shade(fruit.color, -20);
    ctx.beginPath(); ctx.arc(11, 0, 19, 0, Math.PI * 2); ctx.fill();
    fillStar(ctx, -24, -17, 5, ink);
  } else if (motif === 'comet') {
    fillStar(ctx, 17, -8, 10, ink);
    ctx.beginPath(); ctx.moveTo(-30, 27); ctx.quadraticCurveTo(-4, 10, 9, -1); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-34, 12); ctx.quadraticCurveTo(-9, 3, 6, -6); ctx.stroke();
  } else if (['crystal', 'prism', 'jade'].indexOf(motif) >= 0) {
    gemMotif(ctx);
  } else if (motif === 'frost' || motif === 'snow') {
    snowflakeMotif(ctx);
  } else if (motif === 'flame') {
    flameMotif(ctx, glow);
  } else if (motif === 'pearl') {
    pearlMotif(ctx, glow);
  } else if (['aurora', 'rainbow', 'nebula', 'galaxy', 'cosmic', 'chaos'].indexOf(motif) >= 0) {
    cosmicMotif(ctx, glow);
  } else if (motif === 'cloud' || motif === 'mist' || motif === 'dream') {
    cloudMotif(ctx, glow, motif === 'dream');
  } else if (motif === 'crown' || motif === 'oracle') {
    crownMotif(ctx, glow);
  } else if (motif === 'sun' || motif === 'dawn' || motif === 'holy') {
    sunMotif(ctx, glow, motif === 'holy');
  } else if (['ocean', 'coral', 'oasis', 'sky'].indexOf(motif) >= 0) {
    waveMotif(ctx, glow, motif === 'sky');
  } else if (motif === 'lightning') {
    lightningMotif(ctx, glow);
  } else if (motif === 'ring') {
    ringMotif(ctx, glow);
  } else if (motif === 'dragon') {
    scaleMotif(ctx);
  } else if (motif === 'time') {
    clockMotif(ctx);
  } else if (['amber', 'ruby', 'gold', 'violet', 'neon', 'night', 'eternal'].indexOf(motif) >= 0) {
    jewelMotif(ctx, glow);
  } else {
    fillStar(ctx, 0, 3, 12, ink);
    fillStar(ctx, -23, -17, 5, ink);
    fillStar(ctx, 24, 20, 5, ink);
  }
  ctx.restore();
}

function drawBerry(ctx, fruit, x, y, radius, index) {
  const dark = shade(fruit.color, -34);
  const highlight = index % 2 ? shade(fruit.accent, 30) : shade(fruit.color, 35);
  const middle = index % 2 ? fruit.accent : fruit.color;
  const gradient = ctx.createRadialGradient(x - 8, y - 9, 2, x, y, radius);
  gradient.addColorStop(0, highlight);
  gradient.addColorStop(0.48, middle);
  gradient.addColorStop(1, dark);
  ctx.fillStyle = gradient;
  ctx.strokeStyle = dark;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  shine(ctx, x - 7, y - 9, Math.max(4, radius * 0.23), Math.max(7, radius * 0.32));
}

function drawCherry(ctx, fruit, x, y, useAccent) {
  const color = useAccent ? fruit.accent : fruit.color;
  const dark = shade(fruit.color, -34);
  const gradient = ctx.createRadialGradient(x - 10, y - 12, 3, x, y, 35);
  gradient.addColorStop(0, shade(color, 32));
  gradient.addColorStop(0.45, color);
  gradient.addColorStop(1, dark);
  ctx.fillStyle = gradient;
  ctx.strokeStyle = dark;
  ctx.beginPath();
  ctx.arc(x, y, 33, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}

function pearPath(ctx) {
  ctx.beginPath();
  ctx.moveTo(0, -48);
  ctx.bezierCurveTo(-29, -45, -22, -12, -43, 8);
  ctx.bezierCurveTo(-66, 31, -45, 62, 0, 64);
  ctx.bezierCurveTo(45, 62, 66, 31, 43, 8);
  ctx.bezierCurveTo(22, -12, 29, -45, 0, -48);
  ctx.closePath();
}

function watermelonPath(ctx, width, bottom) {
  ctx.beginPath();
  ctx.moveTo(-width, -30);
  ctx.quadraticCurveTo(0, -67 + (59 - width) * 1.3, width, -30);
  ctx.quadraticCurveTo(width * 0.76, bottom - 7, 0, bottom);
  ctx.quadraticCurveTo(-width * 0.76, bottom - 7, -width, -30);
  ctx.closePath();
}

function peachPath(ctx) {
  ctx.beginPath();
  ctx.moveTo(0, 58);
  ctx.bezierCurveTo(-49, 46, -61, 3, -44, -27);
  ctx.bezierCurveTo(-28, -55, -5, -49, 0, -30);
  ctx.bezierCurveTo(5, -49, 28, -55, 44, -27);
  ctx.bezierCurveTo(61, 3, 49, 46, 0, 58);
  ctx.closePath();
}

function bananaPath(ctx) {
  ctx.beginPath();
  ctx.moveTo(-54, -31);
  ctx.bezierCurveTo(-35, 36, 16, 62, 58, 16);
  ctx.bezierCurveTo(32, 39, -4, 31, -31, -41);
  ctx.closePath();
}

function dragonSpikes(ctx, color, dark) {
  ctx.fillStyle = color;
  ctx.strokeStyle = shade(dark, -5);
  ctx.lineWidth = 4;
  [[0,-49,0,-72],[-35,-26,-59,-39],[-43,4,-69,5],[-33,36,-54,53],[35,-26,59,-39],[43,4,69,5],[33,36,54,53]].forEach((spike) => {
    const x1 = spike[0];
    const y1 = spike[1];
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(spike[2], spike[3]);
    ctx.lineTo(x1 + (x1 <= 0 ? 10 : -10), y1 + 14);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  });
}

function pineappleCrown(ctx, color) {
  ctx.fillStyle = color;
  ctx.strokeStyle = shade(color, -35);
  ctx.lineWidth = 4;
  [[0,-41,-5,-78],[-11,-39,-35,-68],[11,-39,35,-68],[-20,-34,-49,-51],[20,-34,49,-51]].forEach((leaf) => {
    const x1 = leaf[0];
    const y1 = leaf[1];
    const x2 = leaf[2];
    ctx.beginPath();
    ctx.moveTo(x1, y1 + 18);
    ctx.lineTo(x2, leaf[3]);
    ctx.lineTo(x1 + (x2 < 0 ? 12 : -12), y1 + 18);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  });
}

function spikyHalo(ctx, color, dark) {
  ctx.fillStyle = color;
  ctx.strokeStyle = shade(dark, -6);
  ctx.lineWidth = 3;
  for (let i = 0; i < 14; i += 1) {
    const angle = i * Math.PI * 2 / 14;
    const innerX = Math.cos(angle) * 39;
    const innerY = 5 + Math.sin(angle) * 44;
    const outerX = Math.cos(angle) * 64;
    const outerY = 5 + Math.sin(angle) * 66;
    const side = angle + Math.PI / 2;
    ctx.beginPath();
    ctx.moveTo(innerX + Math.cos(side) * 7, innerY + Math.sin(side) * 7);
    ctx.lineTo(outerX, outerY);
    ctx.lineTo(innerX - Math.cos(side) * 7, innerY - Math.sin(side) * 7);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
}

function fruitLeaf(ctx, color, x, y, rotation, scale) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation || 0);
  ctx.scale(scale || 1, scale || 1);
  ctx.fillStyle = color;
  ctx.strokeStyle = shade(color, -30);
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(-2, 0);
  ctx.quadraticCurveTo(16, -19, 35, -4);
  ctx.quadraticCurveTo(17, 12, -2, 0);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function fruitLeaves(ctx, color, x, y, scale) {
  fruitLeaf(ctx, color, x - 3, y, -2.65, scale || 1);
  fruitLeaf(ctx, color, x + 3, y, -0.5, scale || 1);
  fruitLeaf(ctx, color, x, y - 3, -1.55, (scale || 1) * 0.88);
}

function stemAndLeaf(ctx, color, x, y) {
  ctx.strokeStyle = '#775035';
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.moveTo(x, y + 8);
  ctx.quadraticCurveTo(x - 2, y - 10, x + 8, y - 21);
  ctx.stroke();
  fruitLeaf(ctx, color, x + 10, y - 9, -0.25, 0.82);
}

function shine(ctx, x, y, rx, ry) {
  ctx.save();
  ctx.shadowColor = 'transparent';
  ctx.fillStyle = 'rgba(255,255,255,0.38)';
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, -0.48, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function gemMotif(ctx) {
  ctx.beginPath();
  ctx.moveTo(0, -29);
  ctx.lineTo(27, -8);
  ctx.lineTo(15, 28);
  ctx.lineTo(-16, 28);
  ctx.lineTo(-28, -8);
  ctx.closePath();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-28, -8); ctx.lineTo(27, -8);
  ctx.moveTo(0, -29); ctx.lineTo(-2, 28);
  ctx.moveTo(-28, -8); ctx.lineTo(15, 28);
  ctx.moveTo(27, -8); ctx.lineTo(-16, 28);
  ctx.stroke();
}

function snowflakeMotif(ctx) {
  for (let i = 0; i < 3; i += 1) {
    const angle = i * Math.PI / 3;
    ctx.save();
    ctx.rotate(angle);
    ctx.beginPath(); ctx.moveTo(-30, 0); ctx.lineTo(30, 0); ctx.stroke();
    [-18, 18].forEach((offset) => {
      ctx.beginPath();
      ctx.moveTo(offset, 0); ctx.lineTo(offset + (offset < 0 ? 7 : -7), -7);
      ctx.moveTo(offset, 0); ctx.lineTo(offset + (offset < 0 ? 7 : -7), 7);
      ctx.stroke();
    });
    ctx.restore();
  }
}

function flameMotif(ctx, glow) {
  const gradient = ctx.createLinearGradient(0, -29, 0, 31);
  gradient.addColorStop(0, '#FFF2A1');
  gradient.addColorStop(0.48, glow);
  gradient.addColorStop(1, '#F0644E');
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.moveTo(0, 31);
  ctx.bezierCurveTo(-27, 17, -23, -7, -4, -28);
  ctx.bezierCurveTo(-6, -6, 4, -1, 8, -17);
  ctx.bezierCurveTo(30, 4, 25, 23, 0, 31);
  ctx.closePath();
  ctx.fill();
}

function pearlMotif(ctx, glow) {
  [[-18,-9,8],[2,-19,7],[20,-3,8],[-6,12,9],[15,20,6]].forEach((pearl) => {
    const gradient = ctx.createRadialGradient(pearl[0] - 3, pearl[1] - 3, 1, pearl[0], pearl[1], pearl[2]);
    gradient.addColorStop(0, '#FFFFFF');
    gradient.addColorStop(1, glow);
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(pearl[0], pearl[1], pearl[2], 0, Math.PI * 2);
    ctx.fill();
  });
}

function cosmicMotif(ctx, glow) {
  const band = ctx.createLinearGradient(-35, -15, 35, 20);
  band.addColorStop(0, '#74E6D1');
  band.addColorStop(0.5, glow);
  band.addColorStop(1, '#F28AD4');
  ctx.strokeStyle = band;
  ctx.lineWidth = 8;
  ctx.beginPath(); ctx.moveTo(-35, 14); ctx.quadraticCurveTo(-2, -20, 36, -2); ctx.stroke();
  ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(-30, 27); ctx.quadraticCurveTo(0, 4, 31, 15); ctx.stroke();
  fillStar(ctx, -14, -21, 5, '#FFF1A2');
  fillStar(ctx, 23, 24, 4, '#FFF1A2');
}

function cloudMotif(ctx, glow, dream) {
  ctx.fillStyle = 'rgba(255,255,255,0.84)';
  [[-18,8,12],[-3,1,16],[14,8,13],[27,12,9]].forEach((cloud) => {
    ctx.beginPath(); ctx.arc(cloud[0], cloud[1], cloud[2], 0, Math.PI * 2); ctx.fill();
  });
  roundRect(ctx, -31, 8, 62, 16, 8);
  ctx.fill();
  if (dream) fillStar(ctx, 14, -20, 6, glow);
}

function crownMotif(ctx, glow) {
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.moveTo(-30, 18);
  ctx.lineTo(-25, -18);
  ctx.lineTo(-8, 1);
  ctx.lineTo(0, -25);
  ctx.lineTo(10, 1);
  ctx.lineTo(27, -18);
  ctx.lineTo(30, 18);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#FFF7D1';
  [-17, 0, 17].forEach((x) => { ctx.beginPath(); ctx.arc(x, 12, 3, 0, Math.PI * 2); ctx.fill(); });
}

function sunMotif(ctx, glow, halo) {
  ctx.fillStyle = glow;
  ctx.beginPath(); ctx.arc(0, 4, 15, 0, Math.PI * 2); ctx.fill();
  for (let i = 0; i < 10; i += 1) {
    const angle = i * Math.PI / 5;
    ctx.beginPath();
    ctx.moveTo(Math.cos(angle) * 22, 4 + Math.sin(angle) * 22);
    ctx.lineTo(Math.cos(angle) * 32, 4 + Math.sin(angle) * 32);
    ctx.stroke();
  }
  if (halo) { ctx.beginPath(); ctx.ellipse(0, 4, 33, 15, 0, 0, Math.PI * 2); ctx.stroke(); }
}

function waveMotif(ctx, glow, star) {
  ctx.strokeStyle = glow;
  ctx.lineWidth = 5;
  for (let row = 0; row < 3; row += 1) {
    const y = -8 + row * 14;
    ctx.beginPath();
    ctx.moveTo(-31, y);
    ctx.quadraticCurveTo(-16, y - 11, 0, y);
    ctx.quadraticCurveTo(16, y + 11, 31, y);
    ctx.stroke();
  }
  if (star) fillStar(ctx, 17, -25, 5, '#FFF4A7');
}

function lightningMotif(ctx, glow) {
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.moveTo(7, -32);
  ctx.lineTo(-20, 5);
  ctx.lineTo(-3, 4);
  ctx.lineTo(-12, 33);
  ctx.lineTo(24, -10);
  ctx.lineTo(7, -8);
  ctx.closePath();
  ctx.fill();
}

function ringMotif(ctx, glow) {
  ctx.strokeStyle = glow;
  ctx.lineWidth = 7;
  ctx.beginPath(); ctx.ellipse(0, 5, 37, 14, -0.25, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = '#FFF3A4';
  ctx.beginPath(); ctx.arc(29, -3, 5, 0, Math.PI * 2); ctx.fill();
}

function scaleMotif(ctx) {
  ctx.lineWidth = 3;
  for (let row = 0; row < 3; row += 1) {
    for (let col = 0; col < 4; col += 1) {
      const x = -27 + col * 18 + (row % 2) * 9;
      const y = -12 + row * 17;
      ctx.beginPath(); ctx.arc(x, y, 10, Math.PI, 0); ctx.stroke();
    }
  }
}

function clockMotif(ctx) {
  ctx.beginPath(); ctx.arc(0, 5, 26, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, 5); ctx.lineTo(0, -13); ctx.moveTo(0, 5); ctx.lineTo(16, 15); ctx.stroke();
  [0, Math.PI / 2, Math.PI, Math.PI * 1.5].forEach((angle) => {
    ctx.beginPath(); ctx.arc(Math.cos(angle) * 21, 5 + Math.sin(angle) * 21, 2.5, 0, Math.PI * 2); ctx.fill();
  });
}

function jewelMotif(ctx, glow) {
  ctx.beginPath();
  ctx.moveTo(0, -29);
  ctx.lineTo(26, -7);
  ctx.lineTo(17, 27);
  ctx.lineTo(-17, 27);
  ctx.lineTo(-27, -7);
  ctx.closePath();
  ctx.fillStyle = rgba(glow, 0.72);
  ctx.fill();
  ctx.strokeStyle = '#FFF1BE';
  ctx.beginPath();
  ctx.moveTo(0, -29); ctx.lineTo(0, 27);
  ctx.moveTo(-27, -7); ctx.lineTo(26, -7);
  ctx.moveTo(-27, -7); ctx.lineTo(17, 27);
  ctx.moveTo(26, -7); ctx.lineTo(-17, 27);
  ctx.stroke();
}

function starPath(ctx, x, y, outer, inner, points) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i += 1) {
    const radius = i % 2 === 0 ? outer : inner;
    const angle = -Math.PI / 2 + Math.PI * i / points;
    const px = x + Math.cos(angle) * radius;
    const py = y + Math.sin(angle) * radius;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

function fillStar(ctx, x, y, radius, color) {
  ctx.save();
  ctx.fillStyle = color;
  starPath(ctx, x, y, radius, radius * 0.46, 5);
  ctx.fill();
  ctx.restore();
}

function roundRect(ctx, x, y, width, height, radius) {
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

function leafColor(fruit) {
  if (['jade', 'oasis', 'aurora'].indexOf(fruit.motif) >= 0) return shade(fruit.accent, -5);
  return '#5DBA72';
}

function shade(hex, amount) {
  const value = String(hex || '#777777').replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(value)) return hex || '#777777';
  const delta = Math.round(255 * amount / 100);
  const parts = [0, 2, 4].map((offset) => clamp(parseInt(value.slice(offset, offset + 2), 16) + delta, 0, 255));
  return `#${parts.map((channel) => Math.round(channel).toString(16).padStart(2, '0')).join('')}`;
}

function rgba(hex, alpha) {
  const value = String(hex || '#000000').replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(value)) return `rgba(0,0,0,${alpha})`;
  return `rgba(${parseInt(value.slice(0, 2), 16)},${parseInt(value.slice(2, 4), 16)},${parseInt(value.slice(4, 6), 16)},${alpha})`;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

module.exports = {
  drawRareFruitVisual
};
