'use strict';

const { drawRareFruitVisual } = require('./rare-fruit-visuals');

function drawCollectibleVisual(ctx, collectible, image, x, y, size) {
  if (!ctx || !collectible || !size) return;
  if (collectible.themeId === 'fruit') {
    drawRareFruitVisual(ctx, collectible, image, x, y, size);
    return;
  }

  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 128, size / 128);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.shadowColor = collectible.glow || collectible.accent || collectible.color;
  ctx.shadowBlur = collectible.plain ? 3 : 10;
  applyPaint(ctx, collectible, false);
  drawThemeBase(ctx, collectible, false);
  if (!collectible.plain) drawMotif(ctx, collectible, false);
  drawHighlights(ctx, collectible);
  ctx.restore();
}

function drawGenericCollectibleSilhouette(ctx, collectible, x, y, size, color) {
  if (!ctx || !collectible || !size) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 128, size / 128);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = color || '#AAA3AF';
  ctx.fillStyle = 'transparent';
  ctx.lineWidth = 6;
  drawThemeBase(ctx, collectible, true);
  drawMotif(ctx, collectible, true);
  drawSignature(ctx, collectible);
  ctx.restore();
}

function applyPaint(ctx, collectible, outline) {
  if (outline) return;
  const gradient = ctx.createLinearGradient(-52, -55, 52, 58);
  gradient.addColorStop(0, shade(collectible.color, 34));
  gradient.addColorStop(0.48, collectible.color);
  gradient.addColorStop(1, shade(collectible.color, -30));
  ctx.fillStyle = gradient;
  ctx.strokeStyle = shade(collectible.color, -36);
  ctx.lineWidth = 4;
}

function finish(ctx, outline) {
  if (!outline) ctx.fill();
  ctx.stroke();
}

function drawThemeBase(ctx, collectible, outline) {
  if (collectible.themeId === 'vegetable') drawVegetable(ctx, collectible, outline);
  else if (collectible.themeId === 'animal') drawMascot(ctx, collectible, outline);
  else if (collectible.themeId === 'toy') drawToy(ctx, collectible, outline);
  else if (collectible.themeId === 'dessert') drawDessert(ctx, collectible, outline);
  else if (collectible.themeId === 'appliance') drawAppliance(ctx, collectible, outline);
  else if (collectible.themeId === 'digital') drawDigital(ctx, collectible, outline);
  else if (collectible.themeId === 'vehicle') drawVehicle(ctx, collectible, outline);
  else if (collectible.themeId === 'fashion') drawFashion(ctx, collectible, outline);
  else drawMascot(ctx, collectible, outline);
}

function drawVegetable(ctx, collectible, outline) {
  const shape = collectible.shape;
  if (shape === 'mushroom') {
    ctx.beginPath(); ctx.arc(0, -15, 49, Math.PI, Math.PI * 2); ctx.lineTo(40, -2); ctx.lineTo(-40, -2); ctx.closePath(); finish(ctx, outline);
    ctx.beginPath(); roundedRect(ctx, -24, -3, 48, 63, 19); finish(ctx, outline);
    return;
  }
  if (['carrot', 'radish', 'yam', 'bamboo', 'asparagus', 'cucumber'].indexOf(shape) >= 0) {
    const wide = shape === 'yam' || shape === 'cucumber';
    ctx.beginPath();
    if (wide) ctx.ellipse(0, 8, 31, 56, shape === 'cucumber' ? -0.25 : 0, 0, Math.PI * 2);
    else { ctx.moveTo(-31, -31); ctx.quadraticCurveTo(0, -48, 31, -31); ctx.lineTo(5, 61); ctx.quadraticCurveTo(0, 70, -5, 61); ctx.closePath(); }
    finish(ctx, outline);
    ctx.beginPath(); ctx.moveTo(-14, -35); ctx.lineTo(-26, -67); ctx.moveTo(0, -38); ctx.lineTo(0, -73); ctx.moveTo(14, -35); ctx.lineTo(27, -66); ctx.stroke();
    if (shape === 'bamboo' || shape === 'asparagus') { ctx.beginPath(); ctx.moveTo(-25, -6); ctx.lineTo(25, -6); ctx.moveTo(-28, 23); ctx.lineTo(28, 23); ctx.stroke(); }
    return;
  }
  if (shape === 'eggplant' || shape === 'pepper') {
    ctx.beginPath(); ctx.moveTo(0, -48); ctx.bezierCurveTo(-46, -43, -54, 12, -25, 49); ctx.bezierCurveTo(0, 72, 38, 57, 42, 18); ctx.bezierCurveTo(45, -21, 28, -47, 0, -48); ctx.closePath(); finish(ctx, outline);
    ctx.beginPath(); ctx.moveTo(-28, -42); ctx.lineTo(-6, -34); ctx.lineTo(0, -66); ctx.lineTo(8, -34); ctx.lineTo(31, -43); ctx.stroke();
    return;
  }
  if (shape === 'corn' || shape === 'pea') {
    ctx.beginPath(); ctx.ellipse(0, 2, 34, 58, 0, 0, Math.PI * 2); finish(ctx, outline);
    ctx.beginPath(); ctx.moveTo(-31, 23); ctx.quadraticCurveTo(-57, 7, -47, -45); ctx.quadraticCurveTo(-22, -17, -20, 37); ctx.moveTo(31, 23); ctx.quadraticCurveTo(57, 7, 47, -45); ctx.quadraticCurveTo(22, -17, 20, 37); ctx.stroke();
    if (shape === 'corn') for (let row = -1; row <= 1; row += 1) { ctx.beginPath(); ctx.moveTo(-25, row * 19); ctx.lineTo(25, row * 19); ctx.stroke(); }
    else for (let i = -1; i <= 1; i += 1) { ctx.beginPath(); ctx.arc(i * 18, 1, 10, 0, Math.PI * 2); ctx.stroke(); }
    return;
  }
  if (['broccoli', 'cabbage', 'artichoke', 'lotus'].indexOf(shape) >= 0) {
    for (let i = 0; i < 7; i += 1) {
      const angle = i * Math.PI * 2 / 7;
      ctx.beginPath(); ctx.arc(Math.cos(angle) * 27, -8 + Math.sin(angle) * 22, 24, 0, Math.PI * 2); finish(ctx, outline);
    }
    ctx.beginPath(); roundedRect(ctx, -17, 18, 34, 45, 12); finish(ctx, outline);
    return;
  }
  const lobed = shape === 'pumpkin' || shape === 'gourd' || shape === 'harvest';
  ctx.beginPath(); ctx.ellipse(0, 7, lobed ? 55 : 47, lobed ? 48 : 51, 0, 0, Math.PI * 2); finish(ctx, outline);
  if (lobed) {
    ctx.beginPath(); ctx.ellipse(0, 7, 22, 47, 0, 0, Math.PI * 2); ctx.moveTo(-42, -2); ctx.quadraticCurveTo(0, 17, 42, -2); ctx.stroke();
  }
  ctx.beginPath(); ctx.moveTo(0, -43); ctx.lineTo(5, -65); ctx.quadraticCurveTo(30, -72, 42, -53); ctx.stroke();
}

function drawDessert(ctx, collectible, outline) {
  const shape = collectible.shape;
  if (shape === 'donut') {
    ctx.beginPath(); ctx.arc(0, 3, 50, 0, Math.PI * 2); finish(ctx, outline);
    ctx.beginPath(); ctx.arc(0, 3, 19, 0, Math.PI * 2); ctx.stroke();
  } else if (shape === 'icecream' || shape === 'parfait') {
    ctx.beginPath(); ctx.arc(0, -27, 35, Math.PI, Math.PI * 2); ctx.arc(-20, -14, 24, Math.PI, Math.PI * 2); ctx.arc(22, -13, 24, Math.PI, Math.PI * 2); ctx.lineTo(34, -4); ctx.lineTo(-34, -4); ctx.closePath(); finish(ctx, outline);
    ctx.beginPath(); ctx.moveTo(-31, 0); ctx.lineTo(0, 65); ctx.lineTo(31, 0); ctx.closePath(); finish(ctx, outline);
  } else if (shape === 'macaron' || shape === 'cookie' || shape === 'waffle') {
    ctx.beginPath(); roundedRect(ctx, -49, -30, 98, 61, shape === 'macaron' ? 29 : 15); finish(ctx, outline);
    ctx.beginPath(); ctx.moveTo(-44, 0); ctx.lineTo(44, 0); ctx.stroke();
    if (shape === 'waffle') for (let i = -1; i <= 1; i += 1) { ctx.beginPath(); ctx.moveTo(i * 23, -25); ctx.lineTo(i * 23, 25); ctx.stroke(); }
  } else if (shape === 'candy' || shape === 'lollipop') {
    ctx.beginPath(); roundedRect(ctx, -30, -28, 60, 56, 18); finish(ctx, outline);
    ctx.beginPath(); ctx.moveTo(-30, -15); ctx.lineTo(-58, -29); ctx.lineTo(-54, 27); ctx.lineTo(-30, 15); ctx.moveTo(30, -15); ctx.lineTo(58, -29); ctx.lineTo(54, 27); ctx.lineTo(30, 15); ctx.stroke();
    if (shape === 'lollipop') { ctx.beginPath(); ctx.moveTo(0, 29); ctx.lineTo(0, 72); ctx.stroke(); }
  } else if (['pudding', 'jelly', 'mousse', 'tart'].indexOf(shape) >= 0) {
    ctx.beginPath(); ctx.moveTo(-42, -30); ctx.lineTo(42, -30); ctx.lineTo(52, 44); ctx.quadraticCurveTo(0, 65, -52, 44); ctx.closePath(); finish(ctx, outline);
    ctx.beginPath(); ctx.ellipse(0, -30, 42, 14, 0, 0, Math.PI * 2); ctx.stroke();
  } else if (shape === 'chocolate') {
    ctx.beginPath(); roundedRect(ctx, -48, -51, 96, 102, 12); finish(ctx, outline);
    for (let i = -1; i <= 1; i += 1) { ctx.beginPath(); ctx.moveTo(-46, i * 28); ctx.lineTo(46, i * 28); ctx.moveTo(i * 28, -49); ctx.lineTo(i * 28, 49); ctx.stroke(); }
  } else if (shape === 'teapot' || shape === 'soda') {
    ctx.beginPath(); roundedRect(ctx, -34, -43, 68, 91, 18); finish(ctx, outline);
    ctx.beginPath(); ctx.arc(35, 1, 24, -Math.PI / 2, Math.PI / 2); ctx.moveTo(-8, -43); ctx.lineTo(12, -68); ctx.stroke();
  } else if (shape === 'house' || shape === 'bento' || shape === 'banquet' || shape === 'dessertcore') {
    ctx.beginPath(); roundedRect(ctx, -51, -35, 102, 83, 15); finish(ctx, outline);
    ctx.beginPath(); ctx.moveTo(-48, -34); ctx.lineTo(0, -66); ctx.lineTo(48, -34); ctx.moveTo(0, -35); ctx.lineTo(0, 48); ctx.stroke();
  } else {
    ctx.beginPath(); roundedRect(ctx, -48, -23, 96, 66, 13); finish(ctx, outline);
    ctx.beginPath(); ctx.moveTo(-43, -23); ctx.quadraticCurveTo(-30, -61, 0, -45); ctx.quadraticCurveTo(30, -61, 43, -23); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, -47); ctx.lineTo(0, -68); ctx.stroke();
  }
}

function drawVehicle(ctx, collectible, outline) {
  const shape = collectible.shape;
  if (['plane', 'helicopter', 'airship', 'cruiser'].indexOf(shape) >= 0) {
    ctx.beginPath(); ctx.moveTo(0, -60); ctx.lineTo(14, -12); ctx.lineTo(58, 10); ctx.lineTo(56, 28); ctx.lineTo(13, 17); ctx.lineTo(8, 62); ctx.lineTo(-8, 62); ctx.lineTo(-13, 17); ctx.lineTo(-56, 28); ctx.lineTo(-58, 10); ctx.lineTo(-14, -12); ctx.closePath(); finish(ctx, outline);
    if (shape === 'helicopter') { ctx.beginPath(); ctx.moveTo(-54, -50); ctx.lineTo(54, -50); ctx.moveTo(0, -50); ctx.lineTo(0, -28); ctx.stroke(); }
  } else if (['boat', 'sailboat', 'submarine'].indexOf(shape) >= 0) {
    ctx.beginPath(); ctx.moveTo(-58, 6); ctx.lineTo(58, 6); ctx.lineTo(37, 48); ctx.lineTo(-38, 48); ctx.closePath(); finish(ctx, outline);
    ctx.beginPath(); ctx.moveTo(0, 6); ctx.lineTo(0, -62); ctx.lineTo(44, -5); ctx.closePath(); ctx.stroke();
  } else if (shape === 'bicycle' || shape === 'motorcycle' || shape === 'scooter') {
    ctx.beginPath(); ctx.arc(-38, 32, 24, 0, Math.PI * 2); ctx.arc(38, 32, 24, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-38, 32); ctx.lineTo(-9, -10); ctx.lineTo(17, 32); ctx.lineTo(-38, 32); ctx.lineTo(38, 32); ctx.lineTo(18, -22); ctx.moveTo(9, -22); ctx.lineTo(31, -22); ctx.stroke();
  } else if (shape === 'rocket' || shape === 'ufo' || shape === 'gateway' || shape === 'engine') {
    ctx.beginPath(); ctx.moveTo(0, -61); ctx.bezierCurveTo(35, -35, 36, 20, 0, 55); ctx.bezierCurveTo(-36, 20, -35, -35, 0, -61); ctx.closePath(); finish(ctx, outline);
    ctx.beginPath(); ctx.arc(0, -10, 16, 0, Math.PI * 2); ctx.moveTo(-28, 20); ctx.lineTo(-54, 47); ctx.moveTo(28, 20); ctx.lineTo(54, 47); ctx.stroke();
  } else if (shape === 'balloon') {
    ctx.beginPath(); ctx.ellipse(0, -14, 44, 52, 0, 0, Math.PI * 2); finish(ctx, outline);
    ctx.beginPath(); ctx.moveTo(-20, 34); ctx.lineTo(-13, 63); ctx.lineTo(13, 63); ctx.lineTo(20, 34); ctx.stroke();
  } else {
    ctx.beginPath(); roundedRect(ctx, -55, -23, 110, 58, 14); finish(ctx, outline);
    ctx.beginPath(); ctx.moveTo(-31, -23); ctx.lineTo(-13, -49); ctx.lineTo(28, -49); ctx.lineTo(45, -23); ctx.stroke();
    [-34, 34].forEach((wheel) => { ctx.beginPath(); ctx.arc(wheel, 41, 14, 0, Math.PI * 2); finish(ctx, outline); });
  }
}

function drawFashion(ctx, collectible, outline) {
  const shape = collectible.shape;
  if (shape === 'hat' || shape === 'crown') {
    ctx.beginPath(); ctx.ellipse(0, 32, 58, 18, 0, 0, Math.PI * 2); finish(ctx, outline);
    ctx.beginPath(); ctx.moveTo(-37, 28); ctx.lineTo(-30, -34); ctx.lineTo(-11, -7); ctx.lineTo(0, -48); ctx.lineTo(13, -7); ctx.lineTo(32, -34); ctx.lineTo(38, 28); ctx.closePath(); finish(ctx, outline);
  } else if (['shirt', 'jacket', 'robe', 'outfit'].indexOf(shape) >= 0) {
    ctx.beginPath(); ctx.moveTo(-23, -53); ctx.lineTo(-57, -30); ctx.lineTo(-43, 6); ctx.lineTo(-28, -4); ctx.lineTo(-28, 57); ctx.lineTo(28, 57); ctx.lineTo(28, -4); ctx.lineTo(43, 6); ctx.lineTo(57, -30); ctx.lineTo(23, -53); ctx.quadraticCurveTo(0, -31, -23, -53); ctx.closePath(); finish(ctx, outline);
    ctx.beginPath(); ctx.moveTo(0, -38); ctx.lineTo(0, 56); ctx.stroke();
  } else if (shape === 'dress' || shape === 'cape') {
    ctx.beginPath(); ctx.moveTo(-18, -57); ctx.lineTo(18, -57); ctx.lineTo(27, -13); ctx.lineTo(58, 58); ctx.lineTo(-58, 58); ctx.lineTo(-27, -13); ctx.closePath(); finish(ctx, outline);
  } else if (shape === 'shoe' || shape === 'boot') {
    ctx.beginPath(); ctx.moveTo(-45, -24); ctx.lineTo(-11, -24); ctx.lineTo(3, 15); ctx.quadraticCurveTo(35, 20, 52, 40); ctx.lineTo(47, 57); ctx.lineTo(-48, 57); ctx.closePath(); finish(ctx, outline);
  } else if (shape === 'bag' || shape === 'suitcase' || shape === 'wardrobe' || shape === 'stylecore') {
    ctx.beginPath(); roundedRect(ctx, -48, -32, 96, 84, 15); finish(ctx, outline);
    ctx.beginPath(); ctx.arc(0, -28, 27, Math.PI, Math.PI * 2); ctx.moveTo(0, -1); ctx.lineTo(0, 52); ctx.stroke();
  } else if (shape === 'glasses' || shape === 'mask') {
    ctx.beginPath(); ctx.arc(-28, 0, 25, 0, Math.PI * 2); ctx.arc(28, 0, 25, 0, Math.PI * 2); ctx.moveTo(-3, -2); ctx.lineTo(3, -2); ctx.moveTo(-53, -4); ctx.lineTo(-70, -15); ctx.moveTo(53, -4); ctx.lineTo(70, -15); ctx.stroke();
  } else if (shape === 'watch' || shape === 'belt') {
    ctx.beginPath(); roundedRect(ctx, -29, -34, 58, 68, 15); finish(ctx, outline);
    ctx.beginPath(); ctx.moveTo(-15, -34); ctx.lineTo(-11, -68); ctx.lineTo(11, -68); ctx.lineTo(15, -34); ctx.moveTo(-15, 34); ctx.lineTo(-11, 68); ctx.lineTo(11, 68); ctx.lineTo(15, 34); ctx.stroke();
  } else if (shape === 'umbrella') {
    ctx.beginPath(); ctx.arc(0, 0, 55, Math.PI, Math.PI * 2); ctx.lineTo(55, 0); ctx.lineTo(-55, 0); ctx.closePath(); finish(ctx, outline);
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 62); ctx.quadraticCurveTo(0, 78, 18, 68); ctx.stroke();
  } else if (shape === 'necklace' || shape === 'bow') {
    ctx.beginPath(); ctx.arc(0, -5, 48, 0.15, Math.PI - 0.15); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, 18); ctx.lineTo(-28, 47); ctx.lineTo(-8, 56); ctx.lineTo(0, 37); ctx.lineTo(8, 56); ctx.lineTo(28, 47); ctx.closePath(); finish(ctx, outline);
  } else {
    ctx.beginPath(); ctx.moveTo(-28, -55); ctx.quadraticCurveTo(0, -39, 28, -55); ctx.lineTo(42, 50); ctx.quadraticCurveTo(0, 66, -42, 50); ctx.closePath(); finish(ctx, outline);
  }
}

function drawToy(ctx, collectible, outline) {
  const shape = collectible.shape;
  if (shape === 'bear' || shape === 'doll') {
    ctx.beginPath(); ctx.arc(-26, -30, 17, 0, Math.PI * 2); ctx.arc(26, -30, 17, 0, Math.PI * 2); ctx.arc(0, -8, 39, 0, Math.PI * 2); finish(ctx, outline);
    ctx.beginPath(); ctx.ellipse(0, 37, 35, 31, 0, 0, Math.PI * 2); finish(ctx, outline);
  } else if (shape === 'rocket' || shape === 'spaceship') {
    ctx.beginPath(); ctx.moveTo(0, -61); ctx.bezierCurveTo(35, -35, 36, 20, 0, 55); ctx.bezierCurveTo(-36, 20, -35, -35, 0, -61); ctx.closePath(); finish(ctx, outline);
    ctx.beginPath(); ctx.moveTo(-27, 16); ctx.lineTo(-54, 44); ctx.lineTo(-24, 36); ctx.moveTo(27, 16); ctx.lineTo(54, 44); ctx.lineTo(24, 36); ctx.moveTo(-10, 52); ctx.lineTo(0, 72); ctx.lineTo(10, 52); ctx.stroke();
  } else if (shape === 'blocks' || shape === 'castle') {
    [-35, 0, 35].forEach((offset, index) => {
      ctx.beginPath(); roundedRect(ctx, offset - 20, index === 1 ? -42 : -22, 40, 54, 7); finish(ctx, outline);
    });
    ctx.beginPath(); roundedRect(ctx, -50, 31, 100, 31, 8); finish(ctx, outline);
  } else if (shape === 'train' || shape === 'car') {
    ctx.beginPath(); roundedRect(ctx, -54, -22, 108, 57, 15); finish(ctx, outline);
    ctx.beginPath(); ctx.moveTo(-28, -22); ctx.lineTo(-11, -48); ctx.lineTo(28, -48); ctx.lineTo(44, -22); ctx.stroke();
    [-33, 33].forEach((wheel) => { ctx.beginPath(); ctx.arc(wheel, 42, 14, 0, Math.PI * 2); finish(ctx, outline); });
  } else if (shape === 'kite') {
    ctx.beginPath(); ctx.moveTo(0, -62); ctx.lineTo(47, -8); ctx.lineTo(0, 45); ctx.lineTo(-47, -8); ctx.closePath(); finish(ctx, outline);
    ctx.beginPath(); ctx.moveTo(0, 45); ctx.quadraticCurveTo(25, 60, 5, 75); ctx.quadraticCurveTo(-16, 59, -1, 52); ctx.stroke();
  } else if (shape === 'drum' || shape === 'musicbox' || shape === 'chest') {
    ctx.beginPath(); roundedRect(ctx, -48, -37, 96, 78, shape === 'drum' ? 30 : 12); finish(ctx, outline);
    ctx.beginPath(); ctx.moveTo(-46, -19); ctx.lineTo(46, -19); ctx.moveTo(-46, 22); ctx.lineTo(46, 22); ctx.stroke();
    if (shape !== 'drum') { ctx.beginPath(); roundedRect(ctx, -14, -3, 28, 24, 6); finish(ctx, outline); }
  } else if (shape === 'yoyo' || shape === 'top' || shape === 'marble') {
    ctx.beginPath(); ctx.arc(0, 5, shape === 'marble' ? 48 : 37, 0, Math.PI * 2); finish(ctx, outline);
    if (shape === 'yoyo') { ctx.beginPath(); ctx.arc(0, 5, 15, 0, Math.PI * 2); ctx.moveTo(0, -33); ctx.quadraticCurveTo(41, -55, 31, -75); ctx.stroke(); }
    else if (shape === 'top') { ctx.beginPath(); ctx.moveTo(-47, -2); ctx.lineTo(0, -48); ctx.lineTo(47, -2); ctx.lineTo(0, 61); ctx.closePath(); finish(ctx, outline); }
  } else if (shape === 'robot') {
    ctx.beginPath(); roundedRect(ctx, -42, -43, 84, 69, 15); finish(ctx, outline);
    ctx.beginPath(); roundedRect(ctx, -34, 29, 68, 37, 11); finish(ctx, outline);
    ctx.beginPath(); ctx.moveTo(0, -44); ctx.lineTo(0, -64); ctx.lineTo(14, -73); ctx.moveTo(-42, 1); ctx.lineTo(-61, 19); ctx.moveTo(42, 1); ctx.lineTo(61, 19); ctx.stroke();
  } else if (shape === 'duck' || shape === 'dinosaur' || shape === 'horse') {
    ctx.beginPath(); ctx.ellipse(0, 24, 44, 34, -0.08, 0, Math.PI * 2); finish(ctx, outline);
    ctx.beginPath(); ctx.arc(shape === 'horse' ? 27 : -22, -25, 29, 0, Math.PI * 2); finish(ctx, outline);
    ctx.beginPath(); ctx.moveTo(shape === 'horse' ? 45 : -43, -28); ctx.lineTo(shape === 'horse' ? 68 : -66, -15); ctx.lineTo(shape === 'horse' ? 45 : -43, -8); ctx.stroke();
    if (shape === 'dinosaur') { ctx.beginPath(); ctx.moveTo(-32, 0); ctx.lineTo(-54, -14); ctx.lineTo(-47, 10); ctx.lineTo(-67, 17); ctx.lineTo(-42, 30); ctx.stroke(); }
  } else if (shape === 'puzzle') {
    ctx.beginPath(); roundedRect(ctx, -49, -49, 98, 98, 12); finish(ctx, outline);
    ctx.beginPath(); ctx.moveTo(0, -49); ctx.lineTo(0, -19); ctx.arc(0, 0, 19, -Math.PI / 2, Math.PI / 2); ctx.lineTo(0, 49); ctx.moveTo(-49, 0); ctx.lineTo(-16, 0); ctx.stroke();
  } else if (shape === 'plane') {
    ctx.beginPath(); ctx.moveTo(0, -64); ctx.lineTo(14, -14); ctx.lineTo(58, 9); ctx.lineTo(56, 27); ctx.lineTo(13, 16); ctx.lineTo(8, 62); ctx.lineTo(-8, 62); ctx.lineTo(-13, 16); ctx.lineTo(-56, 27); ctx.lineTo(-58, 9); ctx.lineTo(-14, -14); ctx.closePath(); finish(ctx, outline);
  } else if (shape === 'slime' || shape === 'capsule') {
    ctx.beginPath();
    if (shape === 'capsule') roundedRect(ctx, -38, -58, 76, 116, 38);
    else { ctx.moveTo(-50, 44); ctx.bezierCurveTo(-63, 5, -45, -49, 0, -53); ctx.bezierCurveTo(45, -49, 63, 5, 50, 44); ctx.quadraticCurveTo(0, 65, -50, 44); ctx.closePath(); }
    finish(ctx, outline);
  } else if (shape === 'pinwheel') {
    for (let i = 0; i < 4; i += 1) {
      ctx.save(); ctx.rotate(i * Math.PI / 2); ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(8, -52, 45, -44); ctx.quadraticCurveTo(37, -5, 0, 0); ctx.closePath(); finish(ctx, outline); ctx.restore();
    }
    ctx.beginPath(); ctx.moveTo(0, 4); ctx.lineTo(0, 72); ctx.stroke();
  } else {
    ctx.beginPath(); roundedRect(ctx, -46, -46, 92, 92, 20); finish(ctx, outline);
  }
}

function drawAppliance(ctx, collectible, outline) {
  const shape = collectible.shape;
  const boxy = ['fridge', 'washer', 'toaster', 'microwave', 'heater', 'purifier', 'dishwasher', 'oven', 'aircon', 'homecore'];
  if (boxy.indexOf(shape) >= 0) {
    const horizontal = ['toaster', 'microwave', 'oven', 'aircon'].indexOf(shape) >= 0;
    const w = horizontal ? 108 : 82;
    const h = horizontal ? 74 : 112;
    ctx.beginPath(); roundedRect(ctx, -w / 2, -h / 2, w, h, 14); finish(ctx, outline);
    if (shape === 'washer' || shape === 'dishwasher') { ctx.beginPath(); ctx.arc(0, 12, 29, 0, Math.PI * 2); ctx.stroke(); }
    else { ctx.beginPath(); roundedRect(ctx, -w * 0.34, -h * 0.25, w * 0.68, h * 0.4, 7); ctx.stroke(); }
    ctx.beginPath(); ctx.arc(w * 0.28, -h * 0.36, 5, 0, Math.PI * 2); ctx.moveTo(-w * 0.35, -h * 0.36); ctx.lineTo(-w * 0.08, -h * 0.36); ctx.stroke();
  } else if (shape === 'fan' || shape === 'hood') {
    ctx.beginPath(); ctx.arc(0, -7, 48, 0, Math.PI * 2); finish(ctx, outline);
    for (let i = 0; i < 4; i += 1) { ctx.save(); ctx.rotate(i * Math.PI / 2); ctx.beginPath(); ctx.ellipse(0, -24, 12, 28, 0.45, 0, Math.PI * 2); finish(ctx, outline); ctx.restore(); }
    ctx.beginPath(); ctx.moveTo(0, 40); ctx.lineTo(0, 70); ctx.moveTo(-28, 70); ctx.lineTo(28, 70); ctx.stroke();
  } else if (['kettle', 'humidifier', 'coffee'].indexOf(shape) >= 0) {
    ctx.beginPath(); ctx.moveTo(-35, -35); ctx.lineTo(27, -35); ctx.quadraticCurveTo(47, 0, 31, 49); ctx.lineTo(-31, 49); ctx.quadraticCurveTo(-47, 0, -35, -35); ctx.closePath(); finish(ctx, outline);
    ctx.beginPath(); ctx.arc(31, 2, 25, -Math.PI / 2, Math.PI / 2); ctx.moveTo(-28, -35); ctx.lineTo(-12, -57); ctx.lineTo(18, -57); ctx.lineTo(27, -35); ctx.stroke();
  } else if (shape === 'vacuum' || shape === 'cleaner') {
    ctx.beginPath(); ctx.ellipse(7, 28, 42, 26, 0, 0, Math.PI * 2); finish(ctx, outline);
    ctx.beginPath(); ctx.moveTo(-20, 12); ctx.lineTo(-44, -58); ctx.lineTo(-30, -63); ctx.lineTo(2, 11); ctx.moveTo(43, 29); ctx.lineTo(65, 40); ctx.stroke();
  } else if (shape === 'lamp') {
    ctx.beginPath(); ctx.moveTo(-39, -23); ctx.lineTo(39, -23); ctx.lineTo(24, 18); ctx.lineTo(-24, 18); ctx.closePath(); finish(ctx, outline);
    ctx.beginPath(); ctx.moveTo(0, 18); ctx.lineTo(0, 61); ctx.moveTo(-34, 61); ctx.lineTo(34, 61); ctx.stroke();
  } else if (shape === 'cooker' || shape === 'mixer' || shape === 'kitchen') {
    ctx.beginPath(); roundedRect(ctx, -47, -22, 94, 70, 20); finish(ctx, outline);
    ctx.beginPath(); ctx.ellipse(0, -22, 42, 19, 0, 0, Math.PI * 2); ctx.stroke();
    if (shape !== 'cooker') { ctx.beginPath(); ctx.moveTo(-10, -40); ctx.lineTo(-10, -66); ctx.lineTo(28, -66); ctx.lineTo(28, -20); ctx.stroke(); }
  } else if (shape === 'iron' || shape === 'scale') {
    ctx.beginPath(); ctx.moveTo(-49, 35); ctx.quadraticCurveTo(-34, -31, 23, -48); ctx.quadraticCurveTo(48, -4, 49, 35); ctx.closePath(); finish(ctx, outline);
    ctx.beginPath(); roundedRect(ctx, -19, -11, 38, 23, 7); ctx.stroke();
  } else if (shape === 'dryer') {
    ctx.beginPath(); ctx.ellipse(-14, -18, 40, 31, 0, 0, Math.PI * 2); finish(ctx, outline);
    ctx.beginPath(); ctx.moveTo(22, -30); ctx.lineTo(61, -19); ctx.lineTo(22, -6); ctx.moveTo(-5, 10); ctx.lineTo(14, 62); ctx.lineTo(-13, 66); ctx.lineTo(-28, 12); ctx.stroke();
  } else {
    ctx.beginPath(); roundedRect(ctx, -46, -51, 92, 102, 18); finish(ctx, outline);
  }
}

function drawDigital(ctx, collectible, outline) {
  const shape = collectible.shape;
  const screens = ['phone', 'tablet', 'reader', 'powerbank', 'hologram'];
  if (screens.indexOf(shape) >= 0) {
    const narrow = shape === 'phone' || shape === 'powerbank';
    ctx.beginPath(); roundedRect(ctx, narrow ? -34 : -49, -58, narrow ? 68 : 98, 116, 13); finish(ctx, outline);
    ctx.beginPath(); roundedRect(ctx, narrow ? -25 : -39, -44, narrow ? 50 : 78, 82, 7); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 48, 4, 0, Math.PI * 2); ctx.stroke();
  } else if (shape === 'laptop') {
    ctx.beginPath(); roundedRect(ctx, -48, -55, 96, 72, 9); finish(ctx, outline);
    ctx.beginPath(); ctx.moveTo(-62, 26); ctx.lineTo(62, 26); ctx.lineTo(48, 48); ctx.lineTo(-48, 48); ctx.closePath(); finish(ctx, outline);
  } else if (shape === 'headphones' || shape === 'earbuds') {
    ctx.beginPath(); ctx.arc(0, 4, 50, Math.PI, Math.PI * 2); ctx.stroke();
    [-43, 43].forEach((side) => { ctx.beginPath(); roundedRect(ctx, side - 13, -2, 26, 52, 12); finish(ctx, outline); });
  } else if (shape === 'camera' || shape === 'projector') {
    ctx.beginPath(); roundedRect(ctx, -53, -34, 106, 74, 14); finish(ctx, outline);
    ctx.beginPath(); ctx.arc(8, 3, 27, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); roundedRect(ctx, -31, -49, 38, 17, 5); ctx.stroke();
  } else if (shape === 'console' || shape === 'gamepad') {
    ctx.beginPath(); ctx.moveTo(-54, -12); ctx.quadraticCurveTo(-63, 46, -31, 53); ctx.lineTo(-8, 27); ctx.lineTo(8, 27); ctx.lineTo(31, 53); ctx.quadraticCurveTo(63, 46, 54, -12); ctx.quadraticCurveTo(0, -45, -54, -12); ctx.closePath(); finish(ctx, outline);
    ctx.beginPath(); ctx.moveTo(-31, 0); ctx.lineTo(-31, 23); ctx.moveTo(-42, 12); ctx.lineTo(-20, 12); ctx.arc(31, 7, 5, 0, Math.PI * 2); ctx.arc(42, 19, 5, 0, Math.PI * 2); ctx.stroke();
  } else if (shape === 'watch') {
    ctx.beginPath(); roundedRect(ctx, -28, -35, 56, 70, 16); finish(ctx, outline);
    ctx.beginPath(); ctx.moveTo(-17, -35); ctx.lineTo(-11, -68); ctx.lineTo(11, -68); ctx.lineTo(17, -35); ctx.moveTo(-17, 35); ctx.lineTo(-11, 68); ctx.lineTo(11, 68); ctx.lineTo(17, 35); ctx.stroke();
  } else if (shape === 'drone' || shape === 'satellite') {
    ctx.beginPath(); roundedRect(ctx, -29, -22, 58, 44, 12); finish(ctx, outline);
    ctx.beginPath(); ctx.moveTo(-27, -10); ctx.lineTo(-57, -36); ctx.moveTo(27, -10); ctx.lineTo(57, -36); ctx.moveTo(-27, 10); ctx.lineTo(-57, 36); ctx.moveTo(27, 10); ctx.lineTo(57, 36); ctx.stroke();
    [[-61,-40],[61,-40],[-61,40],[61,40]].forEach((point) => { ctx.beginPath(); ctx.arc(point[0], point[1], 14, 0, Math.PI * 2); ctx.stroke(); });
  } else if (shape === 'keyboard') {
    ctx.beginPath(); roundedRect(ctx, -60, -34, 120, 68, 12); finish(ctx, outline);
    for (let row = 0; row < 3; row += 1) for (let col = 0; col < 6; col += 1) { ctx.beginPath(); roundedRect(ctx, -49 + col * 18, -23 + row * 19, 12, 11, 3); ctx.stroke(); }
  } else if (shape === 'mouse') {
    ctx.beginPath(); ctx.ellipse(0, 5, 40, 57, 0, 0, Math.PI * 2); finish(ctx, outline);
    ctx.beginPath(); ctx.moveTo(0, -52); ctx.lineTo(0, 5); ctx.moveTo(-10, -28); ctx.lineTo(10, -28); ctx.stroke();
  } else if (shape === 'vr' || shape === 'glasses') {
    ctx.beginPath(); roundedRect(ctx, -58, -31, 116, 62, 20); finish(ctx, outline);
    ctx.beginPath(); ctx.arc(-25, 0, 16, 0, Math.PI * 2); ctx.arc(25, 0, 16, 0, Math.PI * 2); ctx.moveTo(-58, -4); ctx.lineTo(-74, -17); ctx.moveTo(58, -4); ctx.lineTo(74, -17); ctx.stroke();
  } else if (['chip', 'aicore', 'quantum'].indexOf(shape) >= 0) {
    ctx.beginPath(); roundedRect(ctx, -43, -43, 86, 86, 13); finish(ctx, outline);
    for (let i = -2; i <= 2; i += 1) { ctx.beginPath(); ctx.moveTo(-58, i * 17); ctx.lineTo(-43, i * 17); ctx.moveTo(43, i * 17); ctx.lineTo(58, i * 17); ctx.moveTo(i * 17, -58); ctx.lineTo(i * 17, -43); ctx.moveTo(i * 17, 43); ctx.lineTo(i * 17, 58); ctx.stroke(); }
  } else {
    ctx.beginPath(); roundedRect(ctx, -50, -48, 100, 96, 17); finish(ctx, outline);
  }
}

function drawMascot(ctx, collectible, outline) {
  const shape = collectible.shape;
  const longBody = ['whale', 'turtle', 'octopus'].indexOf(shape) >= 0;
  if (shape === 'ghost' || shape === 'sprite') {
    ctx.beginPath(); ctx.moveTo(-45, 56); ctx.bezierCurveTo(-57, 4, -45, -52, 0, -57); ctx.bezierCurveTo(45, -52, 57, 4, 45, 56); ctx.lineTo(24, 42); ctx.lineTo(8, 58); ctx.lineTo(-10, 42); ctx.lineTo(-28, 59); ctx.closePath(); finish(ctx, outline);
  } else if (shape === 'mushroom') {
    ctx.beginPath(); ctx.arc(0, -16, 53, Math.PI, Math.PI * 2); ctx.lineTo(45, -3); ctx.lineTo(-45, -3); ctx.closePath(); finish(ctx, outline);
    ctx.beginPath(); roundedRect(ctx, -27, -7, 54, 66, 22); finish(ctx, outline);
  } else if (shape === 'bird' || shape === 'bee' || shape === 'owl') {
    ctx.beginPath(); ctx.ellipse(0, 5, 43, 49, 0, 0, Math.PI * 2); finish(ctx, outline);
    ctx.beginPath(); ctx.ellipse(-45, 6, 24, 12, -0.45, 0, Math.PI * 2); ctx.ellipse(45, 6, 24, 12, 0.45, 0, Math.PI * 2); finish(ctx, outline);
    if (shape === 'bee') { ctx.beginPath(); ctx.moveTo(-34, -8); ctx.lineTo(34, -8); ctx.moveTo(-38, 13); ctx.lineTo(38, 13); ctx.stroke(); }
  } else {
    if (shape === 'rabbit' || shape === 'fox' || shape === 'cat' || shape === 'deer' || shape === 'lion' || shape === 'bear') drawMascotEars(ctx, shape, outline);
    if (shape === 'dragon') { ctx.beginPath(); ctx.moveTo(-34, -33); ctx.lineTo(-47, -62); ctx.lineTo(-16, -45); ctx.moveTo(34, -33); ctx.lineTo(47, -62); ctx.lineTo(16, -45); ctx.stroke(); }
    if (shape === 'axolotl') for (let i = -1; i <= 1; i += 1) { ctx.beginPath(); ctx.moveTo(-39, -22 + i * 18); ctx.lineTo(-67, -35 + i * 22); ctx.moveTo(39, -22 + i * 18); ctx.lineTo(67, -35 + i * 22); ctx.stroke(); }
    ctx.beginPath(); ctx.ellipse(0, longBody ? 8 : 0, longBody ? 57 : 47, longBody ? 37 : 53, 0, 0, Math.PI * 2); finish(ctx, outline);
    if (shape === 'whale') { ctx.beginPath(); ctx.moveTo(50, 1); ctx.lineTo(72, -19); ctx.lineTo(71, 20); ctx.closePath(); finish(ctx, outline); }
    if (shape === 'octopus') for (let i = -2; i <= 2; i += 1) { ctx.beginPath(); ctx.moveTo(i * 17, 42); ctx.quadraticCurveTo(i * 18 + (i % 2 ? 12 : -12), 68, i * 17 + 3, 73); ctx.stroke(); }
    if (shape === 'flower') { for (let i = 0; i < 6; i += 1) { const a = i * Math.PI / 3; ctx.beginPath(); ctx.ellipse(Math.cos(a) * 44, Math.sin(a) * 44, 18, 11, a, 0, Math.PI * 2); finish(ctx, outline); } }
    if (shape === 'robot' || shape === 'guardian' || shape === 'friend') { ctx.beginPath(); roundedRect(ctx, -34, 26, 68, 38, 12); finish(ctx, outline); }
  }

  if (!outline) drawFace(ctx, collectible);
}

function drawMascotEars(ctx, shape, outline) {
  const tall = shape === 'rabbit' || shape === 'deer';
  ctx.beginPath();
  if (tall) {
    ctx.ellipse(-24, -54, 13, 36, -0.22, 0, Math.PI * 2);
    ctx.ellipse(24, -54, 13, 36, 0.22, 0, Math.PI * 2);
  } else {
    ctx.moveTo(-38, -34); ctx.lineTo(-50, -67); ctx.lineTo(-12, -46); ctx.closePath();
    ctx.moveTo(38, -34); ctx.lineTo(50, -67); ctx.lineTo(12, -46); ctx.closePath();
  }
  finish(ctx, outline);
}

function drawFace(ctx, collectible) {
  ctx.save();
  ctx.shadowColor = 'transparent';
  ctx.fillStyle = '#3D3152';
  ctx.beginPath(); ctx.arc(-16, -4, 4.5, 0, Math.PI * 2); ctx.arc(16, -4, 4.5, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#3D3152';
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(0, 9, 10, 0.15, Math.PI - 0.15); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.42)';
  ctx.beginPath(); ctx.ellipse(-19, -21, 10, 16, -0.45, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function drawMotif(ctx, collectible, outline) {
  const motif = collectible.motif || 'star';
  const color = outline ? ctx.strokeStyle : (collectible.glow || collectible.accent);
  ctx.save();
  ctx.shadowColor = outline ? 'transparent' : color;
  ctx.shadowBlur = outline ? 0 : 6;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = outline ? 5 : 3;
  const index = Math.max(0, collectible.variant || 0);

  if (motif === 'moon') {
    ctx.beginPath(); ctx.arc(4, 2, 18, 0.35, Math.PI * 1.65); ctx.stroke();
  } else if (motif === 'crystal' || motif === 'prism' || motif === 'jade') {
    ctx.beginPath(); ctx.moveTo(0, -24); ctx.lineTo(22, -6); ctx.lineTo(12, 23); ctx.lineTo(-13, 23); ctx.lineTo(-23, -6); ctx.closePath(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-23, -6); ctx.lineTo(22, -6); ctx.moveTo(0, -24); ctx.lineTo(0, 23); ctx.stroke();
  } else if (motif === 'ring' || motif === 'galaxy' || motif === 'cosmic') {
    ctx.beginPath(); ctx.ellipse(0, 4, 31, 12, -0.25, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(24, -3, 4, 0, Math.PI * 2); outline ? ctx.stroke() : ctx.fill();
  } else if (motif === 'crown' || motif === 'oracle') {
    ctx.beginPath(); ctx.moveTo(-25, 18); ctx.lineTo(-21, -15); ctx.lineTo(-7, 1); ctx.lineTo(0, -22); ctx.lineTo(8, 1); ctx.lineTo(23, -15); ctx.lineTo(26, 18); ctx.closePath(); outline ? ctx.stroke() : ctx.fill();
  } else if (motif === 'flame' || motif === 'phoenix') {
    ctx.beginPath(); ctx.moveTo(0, 26); ctx.bezierCurveTo(-21, 13, -17, -6, -3, -24); ctx.bezierCurveTo(-3, -7, 7, -3, 8, -17); ctx.bezierCurveTo(25, 2, 21, 20, 0, 26); ctx.closePath(); outline ? ctx.stroke() : ctx.fill();
  } else if (motif === 'frost') {
    for (let i = 0; i < 3; i += 1) { ctx.save(); ctx.rotate(i * Math.PI / 3); ctx.beginPath(); ctx.moveTo(-26, 0); ctx.lineTo(26, 0); ctx.stroke(); ctx.restore(); }
  } else if (motif === 'lightning') {
    ctx.beginPath(); ctx.moveTo(7, -27); ctx.lineTo(-17, 4); ctx.lineTo(-2, 3); ctx.lineTo(-10, 29); ctx.lineTo(21, -8); ctx.lineTo(6, -7); ctx.closePath(); outline ? ctx.stroke() : ctx.fill();
  } else if (motif === 'time') {
    ctx.beginPath(); ctx.arc(0, 4, 22, 0, Math.PI * 2); ctx.moveTo(0, 4); ctx.lineTo(0, -12); ctx.moveTo(0, 4); ctx.lineTo(13, 14); ctx.stroke();
  } else if (motif === 'cloud' || motif === 'nebula') {
    ctx.beginPath(); ctx.arc(-15, 6, 11, Math.PI, Math.PI * 2); ctx.arc(0, 0, 16, Math.PI, Math.PI * 2); ctx.arc(17, 7, 11, Math.PI, Math.PI * 2); ctx.lineTo(27, 16); ctx.lineTo(-25, 16); ctx.closePath(); outline ? ctx.stroke() : ctx.fill();
  } else {
    drawStarPath(ctx, 0, 2, 22, 10);
    outline ? ctx.stroke() : ctx.fill();
  }

  // 即使基础造型和纹样相似，也用 1–4 颗卫星点形成独特轮廓签名。
  const dots = 1 + index % 4;
  for (let i = 0; i < dots; i += 1) {
    const angle = -1.9 + i * 0.42 + (index % 3) * 0.11;
    const radius = 35 + (i % 2) * 7;
    ctx.beginPath(); ctx.arc(Math.cos(angle) * radius, Math.sin(angle) * radius, 3.2, 0, Math.PI * 2); outline ? ctx.stroke() : ctx.fill();
  }
  ctx.restore();
}

function drawSignature(ctx, collectible) {
  const value = hashId(collectible.id);
  const notches = 2 + value % 3;
  ctx.save();
  ctx.lineWidth = 4;
  for (let i = 0; i < notches; i += 1) {
    const x = -20 + i * 20;
    const y = 59 + ((value >> (i * 2)) & 3) * 3;
    ctx.beginPath(); ctx.moveTo(x - 5, y); ctx.lineTo(x + 5, y - 7); ctx.stroke();
  }
  ctx.restore();
}

function drawHighlights(ctx, collectible) {
  ctx.save();
  ctx.shadowColor = 'transparent';
  ctx.fillStyle = 'rgba(255,255,255,0.34)';
  ctx.beginPath(); ctx.ellipse(-23, -28, 8, 17, -0.5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = collectible.accent;
  ctx.globalAlpha = 0.72;
  ctx.beginPath(); ctx.arc(35, 35, 7, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function drawStarPath(ctx, x, y, outer, inner) {
  ctx.beginPath();
  for (let i = 0; i < 10; i += 1) {
    const radius = i % 2 === 0 ? outer : inner;
    const angle = -Math.PI / 2 + i * Math.PI / 5;
    const px = x + Math.cos(angle) * radius;
    const py = y + Math.sin(angle) * radius;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

function roundedRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
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

function shade(hex, amount) {
  const value = String(hex || '#777777').replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(value)) return hex || '#777777';
  const delta = Math.round(255 * amount / 100);
  const channels = [0, 2, 4].map((offset) => Math.max(0, Math.min(255, parseInt(value.slice(offset, offset + 2), 16) + delta)));
  return `#${channels.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
}

function hashId(value) {
  let hash = 2166136261;
  const text = String(value || '');
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

module.exports = {
  drawCollectibleVisual,
  drawGenericCollectibleSilhouette
};
