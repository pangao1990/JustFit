'use strict';

const CONFIG = require('./config');
const { ITEM_MAP, getItemById } = require('./catalog');
const { drawCollectibleVisual, drawGenericCollectibleSilhouette } = require('./collectible-visuals');
const {
  AD_COIN_DAILY_LIMIT,
  AD_COIN_REWARD,
  BOOSTER_COIN_COSTS,
  REVIVE_COIN_COST,
  STORE_PRODUCT_DEFINITIONS,
  getCollectibleSellValue,
  getCollectionValue,
  getOwnedCount,
  getSellableCollectibles,
  isFeatureUnlocked
} = require('./economy');
const { ITEM_RULES, parseItemToken } = require('./item-rules');
const { RARITY_COLORS } = require('./rare-fruits');
const {
  COLLECTIBLES,
  countAllDiscoveredCollectibles,
  countDiscoveredCollectibles,
  getCollectibleFromToken,
  getCollectibleMastery,
  getCollectionShowcase,
  getThemeCollectibles,
  getThemeProgress,
  getVisibleCollectionEntries
} = require('./theme-collectibles');
const { formatPoints, getJourneyInfo, getPointRank, getTotalPoints } = require('./progression');
const { getTheme, getVisibleThemes } = require('./themes');
const { clamp, dayKey, easeOutBack, easeOutCubic, formatTime, lerp } = require('./utils');

const FONT = '-apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif';
const BOOSTER_UNLOCK_LEVELS = Object.freeze({
  hint: 1,
  shuffle: 5,
  add_time: 8,
  auto_pack: 10
});
const MECHANIC_TIP_ICONS = Object.freeze({
  basic_target: ['box', 'tap'],
  dual_targets: ['box', 'tap'],
  shelf_shift: ['shuffle', 'box'],
  collectible: ['sparkle', 'clock'],
  collection_target: ['sparkle', 'coin'],
  sealed_item: ['tap', 'box'],
  time_bonus_item: ['time', 'box'],
  sweep_item: ['auto', 'box'],
  triple_targets: ['box', 'warning'],
  bomb_item: ['warning', 'hint'],
  rush_target: ['clock', 'score'],
  horizontal_conveyor: ['route', 'tap'],
  vertical_bob: ['route', 'tap'],
  lane_swap: ['warning', 'tap'],
  sequence_orders: ['key', 'box'],
  carousel: ['route', 'shield']
});

class Renderer {
  constructor(canvas, platform) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.platform = platform;
    this.width = CONFIG.DESIGN_WIDTH;
    this.height = 1600;
    this.scale = 1;
    this.safeTop = 26;
    this.safeBottom = 24;
    this.regions = [];
    this.effects = [];
    this.floatingTexts = [];
    this.hintStack = -1;
    this.hintStacks = [];
    this.hintUntil = 0;
    this.animationMs = 0;
    this.motionPaused = false;
    this.reducedMotion = false;
    this.boardInputBlocked = false;
    this.shake = 0;
    this.toast = null;
    this.rareImages = {};
    this.rareImagesReady = 0;
    this._loadRareFruitImages();
    this.resize();
  }

  _loadRareFruitImages() {
    COLLECTIBLES.forEach((collectible) => {
      if (!collectible.asset) return;
      const image = this.platform.createImage(this.canvas);
      if (!image) return;
      image.onload = () => { this.rareImagesReady += 1; };
      image.onerror = () => { this.platform.log('[collectible:image-error]', collectible.asset); };
      image.src = collectible.asset;
      this.rareImages[collectible.id] = image;
    });
  }

  resize() {
    const info = this.platform.system;
    const dpr = info.pixelRatio || 1;
    this.canvas.width = Math.max(1, Math.floor(info.windowWidth * dpr));
    this.canvas.height = Math.max(1, Math.floor(info.windowHeight * dpr));
    this.scale = this.canvas.width / CONFIG.DESIGN_WIDTH;
    this.height = this.canvas.height / this.scale;
    this.safeTop = Math.max(22, ((info.safeArea && info.safeArea.top) || 0) * CONFIG.DESIGN_WIDTH / info.windowWidth + 12);
    this.safeBottom = Math.max(22, (info.windowHeight - ((info.safeArea && info.safeArea.bottom) || info.windowHeight)) * CONFIG.DESIGN_WIDTH / info.windowWidth + 12);
  }

  toDesignPoint(clientX, clientY) {
    return {
      x: clientX * CONFIG.DESIGN_WIDTH / this.platform.system.windowWidth,
      y: clientY * this.height / this.platform.system.windowHeight
    };
  }

  addRegion(action, x, y, width, height, data) {
    this.regions.push({ action, x, y, width, height, data: data || null });
  }

  hitTest(x, y) {
    for (let i = this.regions.length - 1; i >= 0; i -= 1) {
      const r = this.regions[i];
      if (x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height) return r;
    }
    return null;
  }

  showHint(stackIndex) {
    this.hintStack = stackIndex;
    this.hintStacks = stackIndex >= 0 ? [stackIndex] : [];
    this.hintUntil = Date.now() + 2300;
  }

  showHints(stackIndices) {
    this.hintStacks = (Array.isArray(stackIndices) ? stackIndices : []).filter((value, index, list) => (
      value >= 0 && list.indexOf(value) === index
    )).slice(0, 3);
    this.hintStack = this.hintStacks[0] == null ? -1 : this.hintStacks[0];
    this.hintUntil = Date.now() + 2600;
  }

  showToast(text, color) {
    this.toast = { text, color: color || CONFIG.COLORS.ink, life: 1800, maxLife: 1800 };
  }

  clearToast() {
    this.toast = null;
  }

  clearTransientEffects() {
    this.effects = [];
    this.floatingTexts = [];
    this.hintStack = -1;
    this.hintStacks = [];
    this.hintUntil = 0;
    this.shake = 0;
    this.toast = null;
  }

  burst(x, y, color, count) {
    const total = count || 10;
    for (let i = 0; i < total; i += 1) {
      const angle = Math.PI * 2 * i / total + Math.random() * 0.35;
      const speed = 80 + Math.random() * 150;
      this.effects.push({
        type: 'particle',
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 50,
        size: 5 + Math.random() * 8,
        color,
        life: 650 + Math.random() * 350,
        maxLife: 1000,
        gravity: 260
      });
    }
  }

  confetti() {
    const colors = [CONFIG.COLORS.coral, CONFIG.COLORS.teal, CONFIG.COLORS.gold, '#9B7CE7', '#6BCB77'];
    for (let i = 0; i < 58; i += 1) {
      this.effects.push({
        type: 'confetti',
        x: Math.random() * this.width,
        y: -30 - Math.random() * 360,
        vx: -35 + Math.random() * 70,
        vy: 150 + Math.random() * 190,
        rotation: Math.random() * Math.PI,
        spin: -4 + Math.random() * 8,
        size: 8 + Math.random() * 10,
        color: colors[Math.floor(Math.random() * colors.length)],
        life: 3500,
        maxLife: 3500,
        gravity: 30
      });
    }
  }

  floatText(text, x, y, color) {
    this.floatingTexts.push({ text, x, y, color: color || CONFIG.COLORS.ink, life: 950, maxLife: 950 });
  }

  kickShake(amount) {
    this.shake = Math.max(this.shake, amount || 8);
  }

  update(deltaMs) {
    if (!this.motionPaused) this.animationMs += Math.max(0, Number(deltaMs) || 0);
    const dt = Math.min(0.05, deltaMs / 1000);
    this.effects.forEach((effect) => {
      effect.life -= deltaMs;
      effect.vy += (effect.gravity || 0) * dt;
      effect.x += effect.vx * dt;
      effect.y += effect.vy * dt;
      if (effect.type === 'confetti') effect.rotation += effect.spin * dt;
    });
    this.effects = this.effects.filter((effect) => effect.life > 0);

    this.floatingTexts.forEach((entry) => {
      entry.life -= deltaMs;
      entry.y -= 42 * dt;
    });
    this.floatingTexts = this.floatingTexts.filter((entry) => entry.life > 0);

    if (this.toast) {
      this.toast.life -= deltaMs;
      if (this.toast.life <= 0) this.toast = null;
    }
    this.shake = Math.max(0, this.shake - deltaMs * 0.035);
    if (Date.now() >= this.hintUntil) {
      this.hintStack = -1;
      this.hintStacks = [];
    }
  }

  draw(view, model, saveData) {
    const ctx = this.ctx;
    this.regions = [];
    this.motionPaused = Boolean(
      view && (view.overlay != null || view.helpOpen || view.featureIntro || view.storeSaleOffer ||
      view.storePurchaseOffer || view.revivePanel || view.boosterChoice || view.missedCollectible ||
      view.decorationChoice || view.baseDecorOpen || view.adPlaying)
    );
    this.reducedMotion = Boolean(saveData && saveData.reducedMotion);
    ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    ctx.clearRect(0, 0, this.width, this.height);
    ctx.save();
    if (this.shake > 0) {
      ctx.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);
    }

    this.drawBackground(ctx, saveData, view);

    if (view.screen === 'home') this.drawHome(ctx, view, saveData);
    else if (view.screen === 'fruit_shop') this.drawFruitShop(ctx, view, saveData);
    else if (view.screen === 'store') this.drawStore(ctx, view, saveData);
    else if (view.screen === 'friend_rank') this.drawFriendRank(ctx, view, saveData);
    else this.drawGame(ctx, view, model, saveData);

    if (view.helpOpen) this.drawHelp(ctx);
    if (view.featureIntro) this.drawFeatureIntro(ctx, view.featureIntro);
    if (view.storeSaleOffer) this.drawStoreSaleOffer(ctx, view.storeSaleOffer);
    if (view.storePurchaseOffer) this.drawStorePurchaseOffer(ctx, view.storePurchaseOffer, saveData);
    if (view.revivePanel === 'choice') this.drawReviveChoice(ctx, saveData, view.rewardAvailable, view);
    else if (view.revivePanel === 'exchange') this.drawReviveExchange(ctx, view.reviveExchangeOffer);
    else if (view.revivePanel === 'guide') this.drawReviveSellGuide(ctx);
    if (view.boosterChoice) this.drawBoosterChoice(ctx, view.boosterChoice);
    if (view.missedCollectible) this.drawCollectibleRecovery(ctx, view.missedCollectible, saveData);
    if (view.decorationChoice) this.drawDecorationChoice(ctx, view.decorationChoice);
    if (view.baseDecorOpen) this.drawBaseDecorPanel(ctx, saveData);

    this.drawEffects(ctx);
    this.drawToast(ctx, view);
    ctx.restore();
  }

  drawBackground(ctx, saveData, view) {
    const decorations = Array.isArray(saveData && saveData.warehouseDecorations)
      ? saveData.warehouseDecorations.slice(0, 10)
      : [];
    const decorated = decorations.length > 0;
    const baseVisible = decorated && view && view.screen === 'home';
    const fresh = baseVisible && saveData.warehouseStyle === 'fresh';
    const gradient = ctx.createLinearGradient(0, 0, 0, this.height);
    gradient.addColorStop(0, fresh ? '#D6F7F1' : (baseVisible ? '#F8E6D0' : '#DFF7F3'));
    gradient.addColorStop(0.46, fresh ? '#F3F9DD' : '#FFF3D8');
    gradient.addColorStop(1, fresh ? '#DCEFE4' : '#F7D9BE');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, this.width, this.height);

    ctx.globalAlpha = 0.24;
    ctx.fillStyle = '#FFFFFF';
    for (let i = 0; i < 12; i += 1) {
      const x = (i * 91 + 36) % this.width;
      const y = 80 + ((i * 173) % Math.max(200, this.height - 240));
      ctx.beginPath();
      ctx.arc(x, y, 5 + (i % 3) * 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    if (baseVisible) {
      drawBaseDecorationBackdrop(ctx, this.width, this.safeTop, decorations, fresh, true);
    }
  }

  drawHome(ctx, view, saveData) {
    const centerX = this.width / 2;
    const compact = this.height < 1450;
    const heroTop = this.safeTop + (compact ? 34 : 54);
    const coins = Math.max(0, Math.floor(Number(saveData.coins) || 0));
    const pointRank = getPointRank(getTotalPoints(saveData));
    const activeThemeId = saveData.activeThemeId || 'fruit';
    const activeTheme = getTheme(activeThemeId);
    const activeLevel = saveData.highestLevelByTheme && saveData.highestLevelByTheme[activeThemeId] || saveData.highestLevel || 1;
    const journey = getJourneyInfo(activeLevel, activeThemeId);
    const themeProgress = getThemeProgress(activeThemeId, saveData.rareFruits);
    const dailyUnlocked = isFeatureUnlocked(saveData, 'daily');
    const dailyClaimedToday = saveData.lastDailyClearDate === dayKey();
    const rankUnlocked = isFeatureUnlocked(saveData, 'friendRank');
    const museumUnlocked = isFeatureUnlocked(saveData, 'museum');
    const storeUnlocked = isFeatureUnlocked(saveData, 'store');
    const firstLevel = activeLevel === 1;
    const firstAttempt = firstLevel && Math.max(0, saveData.gamesPlayed || 0) === 0;
    const primaryLabel = firstLevel
      ? (firstAttempt ? '开始装箱' : '再次挑战')
      : '继续装箱';

    drawLogoBox(ctx, centerX, heroTop + 34, compact ? 0.68 : 0.78);
    drawOutlinedText(ctx, '装满这一箱', centerX, heroTop + (compact ? 180 : 200), compact ? 54 : 60, '#FFFFFF', CONFIG.COLORS.ink, 7);

    const cardY = heroTop + (compact ? 226 : 250);
    const progressiveSystemsVisible = dailyUnlocked || rankUnlocked || museumUnlocked || storeUnlocked;
    const cardH = progressiveSystemsVisible ? (compact ? 238 : 252) : (compact ? 210 : 224);
    drawCard(ctx, 54, cardY, 642, cardH, 34, 'rgba(255,255,255,0.9)', 'rgba(255,255,255,0.78)', 18);

    const shopStage = Math.min(10, Math.floor((saveData.totalStars || 0) / CONFIG.SHOP_NODE_STARS));
    drawText(ctx, '装箱档案', 82, cardY + 47, 27, CONFIG.COLORS.ink, 'left', 900);
    drawPill(ctx, 82, cardY + 66, 178, 42, pointRank.name, colorWithAlpha(pointRank.color, 0.1), pointRank.color, 18);
    drawFeatureGlyph(ctx, 'coin', 552, cardY + 61, 31, CONFIG.COLORS.goldDark);
    drawText(ctx, formatPoints(coins), 666, cardY + 72, 36, CONFIG.COLORS.goldDark, 'right', 950, 98);

    ctx.fillStyle = 'rgba(61,49,82,0.08)';
    fillRoundRect(ctx, 78, cardY + 116, 594, 2, 1);
    drawHomeMetric(ctx, 78, cardY + 130, 188, 68, 'route', `${activeTheme.shortName} ${activeLevel}`, activeTheme.color);
    if (museumUnlocked) {
      drawHomeMetric(ctx, 281, cardY + 130, 188, 68, 'museum', `${themeProgress.discovered}/${themeProgress.total}`, CONFIG.COLORS.tealDark);
    } else {
      drawHomeMetric(ctx, 281, cardY + 130, 188, 68, 'score', formatPoints(saveData.totalStars || 0), CONFIG.COLORS.goldDark);
    }
    drawHomeMetric(ctx, 484, cardY + 130, 188, 68, 'box', formatPoints(saveData.boxesPacked || 0), CONFIG.COLORS.coralDark);

    if (progressiveSystemsVisible) {
      drawBaseUpgradeStrip(ctx, 78, cardY + cardH - 37, 594, shopStage, saveData.totalStars || 0);
    }

    let buttonY = cardY + cardH + (compact ? 44 : 50);
    const primaryHeight = firstLevel ? 110 : 104;
    drawHomePrimaryButton(ctx, 82, buttonY, 586, primaryHeight, primaryLabel, journey.title, firstAttempt);
    this.addRegion('play', 82, buttonY, 586, primaryHeight);

    buttonY += primaryHeight + (compact ? 18 : 22);
    if (!dailyUnlocked && !rankUnlocked && !museumUnlocked && !storeUnlocked) {
      drawMysteryMilestone(ctx, 92, buttonY, 566, 86, Math.max(1, 5 - activeLevel));
      buttonY += 104;
    }
    if (dailyUnlocked || rankUnlocked) {
      if (dailyUnlocked && rankUnlocked) {
        drawSmallButton(ctx, 92, buttonY, 270, 82, dailyClaimedToday ? '今日挑战 ✓' : '今日挑战 +25', '日', CONFIG.COLORS.teal, CONFIG.COLORS.tealDark);
        drawSmallButton(ctx, 388, buttonY, 270, 82, '好友榜', '榜', '#9277E5', '#7458C7');
        this.addRegion('daily', 92, buttonY, 270, 82);
        this.addRegion('friend_rank', 388, buttonY, 270, 82);
        if (!saveData.seenMechanics || !saveData.seenMechanics.daily_mode) drawNewBadge(ctx, 342, buttonY + 8);
      } else if (dailyUnlocked) {
        drawHomeFeatureTile(ctx, 92, buttonY, 566, 86, 'daily', '今日挑战', dailyClaimedToday ? '首胜已领取' : '首胜 +25 金币', CONFIG.COLORS.teal);
        this.addRegion('daily', 92, buttonY, 566, 86);
      } else {
        drawHomeFeatureTile(ctx, 92, buttonY, 566, 86, 'rank', '好友榜', '总成绩 / 藏品', '#9277E5');
        this.addRegion('friend_rank', 92, buttonY, 566, 86);
      }
      buttonY += 100;
    }

    if (museumUnlocked || storeUnlocked) {
      if (museumUnlocked && storeUnlocked) {
        drawHomeFeatureTile(ctx, 92, buttonY, 270, 98, 'museum', '奇趣藏馆', `${themeProgress.discovered}/${themeProgress.total}`, activeTheme.color);
        drawHomeFeatureTile(ctx, 388, buttonY, 270, 98, 'store', '补给商店', '', CONFIG.COLORS.goldDark);
        this.addRegion('fruit_shop', 92, buttonY, 270, 98);
        this.addRegion('store', 388, buttonY, 270, 98);
        if (!saveData.seenMechanics || !saveData.seenMechanics.store) drawNewBadge(ctx, 638, buttonY + 8);
      } else if (museumUnlocked) {
        this.drawFruitShopBanner(ctx, 92, buttonY, 566, 92, saveData);
        this.addRegion('fruit_shop', 92, buttonY, 566, 92);
      }
      buttonY += 108;
    }

    if (dailyUnlocked) {
      drawNearestGoal(ctx, 92, buttonY, 566, 78, saveData);
      buttonY += 94;
    }

    const baseDecorations = Array.isArray(saveData.warehouseDecorations) ? saveData.warehouseDecorations : [];
    if (baseDecorations.length) {
      drawBaseDecorHomeTile(ctx, 92, buttonY, 566, 78, saveData);
      this.addRegion('base_decor_open', 92, buttonY, 566, 78);
      buttonY += 94;
    }

    if (view.challenge) {
      const challengeY = Math.min(this.height - this.safeBottom - 180, buttonY);
      drawCard(ctx, 92, challengeY, 566, 82, 25, '#FFF7D9', '#F2C45A', 8);
      drawText(ctx, '好友挑战', 122, challengeY + 34, 21, CONFIG.COLORS.goldDark, 'left', 850);
      drawText(ctx, `第 ${view.challenge.level} 关 · 成绩 ${view.challenge.score || 0}`, 122, challengeY + 63, 20, CONFIG.COLORS.ink, 'left', 700);
      drawPill(ctx, 526, challengeY + 18, 104, 46, '接受', CONFIG.COLORS.gold, CONFIG.COLORS.goldDark, 18);
      this.addRegion('challenge', 92, challengeY, 566, 82);
    }

    const controlDock = drawHomeControlDock(
      ctx,
      centerX,
      this.height - this.safeBottom - 164,
      saveData.soundEnabled !== false,
      saveData.musicEnabled !== false
    );
    this.addRegion('toggle_sound', controlDock.x + 10, controlDock.y + 8, controlDock.itemWidth, controlDock.height - 16);
    this.addRegion('toggle_music', controlDock.x + 10 + controlDock.itemWidth, controlDock.y + 8, controlDock.itemWidth, controlDock.height - 16);
    this.addRegion('help', controlDock.x + 10 + controlDock.itemWidth * 2, controlDock.y + 8, controlDock.itemWidth, controlDock.height - 16);
    drawText(ctx, `v${CONFIG.VERSION}`, this.width - 24, this.height - 22, 16, 'rgba(61,49,82,0.48)', 'right', 500);

  }

  drawFruitShopBanner(ctx, x, y, width, height, saveData) {
    const themeId = saveData.activeThemeId || 'fruit';
    const theme = getTheme(themeId);
    const collection = saveData.rareFruits || {};
    const list = getThemeCollectibles(themeId);
    const progress = getThemeProgress(themeId, collection);
    const last = list.find((collectible) => collectible.id === (saveData.lastCollectibleId || saveData.lastRareFruitId));
    const level = saveData.highestLevelByTheme && saveData.highestLevelByTheme[themeId] || saveData.highestLevel || 1;
    const nearest = getVisibleCollectionEntries(themeId, collection, level, 4)
      .find((entry) => entry.status !== 'sealed');
    const showcase = last || nearest && nearest.collectible || list[0];
    ctx.save();
    ctx.shadowColor = 'rgba(79,55,119,0.2)';
    ctx.shadowBlur = 12;
    ctx.shadowOffsetY = 6;
    const gradient = ctx.createLinearGradient(x, y, x + width, y + height);
    gradient.addColorStop(0, '#FFF9E8');
    gradient.addColorStop(1, theme.paleColor);
    ctx.fillStyle = gradient;
    fillRoundRect(ctx, x, y, width, height, 25);
    ctx.shadowColor = 'transparent';
    ctx.strokeStyle = colorWithAlpha(theme.color, 0.38);
    ctx.lineWidth = 2;
    strokeRoundRect(ctx, x, y, width, height, 25);
    ctx.restore();

    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(x + 49, y + height / 2, 31, 0, Math.PI * 2);
    ctx.fill();
    if (showcase && collection[showcase.id]) {
      drawCollectibleVisual(ctx, showcase, this.rareImages[showcase.id], x + 49, y + height / 2, 62);
    } else {
      drawLockedCollectibleSilhouette(ctx, showcase, x + 49, y + height / 2, 52, '#A9A1B4');
    }
    drawText(ctx, '奇趣藏馆', x + 94, y + 36, 25, CONFIG.COLORS.ink, 'left', 900);
    const value = getCollectionValue(collection);
    drawPill(ctx, x + 94, y + 48, 104, 36, progress.complete ? '✓' : `${progress.discovered}/${progress.total}`, colorWithAlpha(theme.color, 0.08), theme.darkColor, 16);
    drawCurrencyChip(ctx, x + width - 164, y + 43, 140, 42, value);
    if (!saveData.seenMechanics || !saveData.seenMechanics.museum) drawNewBadge(ctx, x + width - 18, y + 4);
  }

  drawFriendRank(ctx, view, saveData) {
    const layout = this.getFriendRankViewport();
    const headerY = layout.headerY;
    drawCircleButton(ctx, 54, headerY + 39, 52, '‹', true);
    this.addRegion('back_home', 28, headerY + 13, 52, 52);
    drawText(ctx, '装满这一箱 · 微信好友榜', 100, headerY + 42, 31, CONFIG.COLORS.ink, 'left', 950, 572);

    const metric = view.friendRankMetric === 'collection_count' ? 'collection_count' : 'total_points';
    const tabY = layout.tabY;
    drawRankTab(ctx, 66, tabY, 300, 86, '总成绩', formatPoints(getTotalPoints(saveData)), metric === 'total_points', CONFIG.COLORS.goldDark);
    drawRankTab(ctx, 384, tabY, 300, 86, '藏品数', String(countAllDiscoveredCollectibles(saveData.rareFruits)), metric === 'collection_count', '#278F82');
    this.addRegion('friend_rank_score', 66, tabY, 300, 86);
    this.addRegion('friend_rank_collection', 384, tabY, 300, 86);

    const shareY = layout.shareY;
    const panelY = layout.panelY;
    const panelH = layout.panelHeight;
    drawCard(ctx, 48, panelY, 654, panelH, 34, 'rgba(255,255,255,0.82)', 'rgba(255,255,255,0.76)', 14);
    if (view.friendRankAvailable && view.friendRankCanvas) {
      try {
        drawImageContained(
          ctx,
          view.friendRankCanvas,
          layout.viewportX,
          layout.viewportY,
          layout.viewportWidth,
          layout.viewportHeight
        );
      } catch (_) {
        drawFriendRankFallback(ctx, layout.viewportX, layout.viewportY, layout.viewportWidth, layout.viewportHeight, metric, saveData);
      }
    } else {
      drawFriendRankFallback(ctx, layout.viewportX, layout.viewportY, layout.viewportWidth, layout.viewportHeight, metric, saveData);
    }

    drawButton(ctx, 126, shareY, 498, 76, '邀请好友来上榜', '', 'share', '#9277E5', '#7458C7');
    this.addRegion('share', 126, shareY, 498, 76, { source: 'friend_rank' });
  }

  getFriendRankViewport() {
    const headerY = this.safeTop + 8;
    const tabY = headerY + 82;
    const shareY = this.height - this.safeBottom - 122;
    const panelY = tabY + 108;
    const panelHeight = Math.max(470, shareY - panelY - 24);
    return {
      headerY,
      tabY,
      shareY,
      panelY,
      panelHeight,
      viewportX: 68,
      viewportY: panelY + 18,
      viewportWidth: 614,
      viewportHeight: Math.max(434, panelHeight - 36)
    };
  }

  drawFruitShop(ctx, view, saveData) {
    const collection = saveData.rareFruits || {};
    const visibleThemes = getVisibleThemes(saveData.unlockedThemes);
    const requestedThemeId = view.collectionThemeId || saveData.activeThemeId || 'fruit';
    const themeId = visibleThemes.some((entry) => entry.id === requestedThemeId)
      ? requestedThemeId
      : (saveData.activeThemeId || 'fruit');
    const theme = getTheme(themeId);
    const unlocked = (saveData.unlockedThemes || ['fruit']).indexOf(themeId) >= 0;
    const list = getThemeCollectibles(themeId);
    const level = saveData.highestLevelByTheme && saveData.highestLevelByTheme[themeId] || 1;
    const progress = getThemeProgress(themeId, collection);
    const visibility = getVisibleCollectionEntries(themeId, collection, level, 4);
    const headerY = this.safeTop + 8;
    drawCircleButton(ctx, 54, headerY + 39, 52, '‹', true);
    this.addRegion('back_home', 28, headerY + 13, 52, 52);
    drawText(ctx, '装满这一箱 · 奇趣藏馆', 100, headerY + 42, 31, CONFIG.COLORS.ink, 'left', 950);

    const progressY = headerY + 82;
    drawCard(ctx, 48, progressY, 654, 130, 29, 'rgba(255,255,255,0.9)', colorWithAlpha(theme.color, 0.25), 10);
    const canSwitch = visibleThemes.length > 1;
    drawCircleButton(ctx, 82, progressY + 40, 44, '‹', canSwitch);
    drawPill(ctx, 122, progressY + 16, 506, 48, `${theme.icon}  ${theme.name}`, theme.paleColor, theme.darkColor, 23);
    drawCircleButton(ctx, 668, progressY + 40, 44, '›', canSwitch);
    if (canSwitch) {
      this.addRegion('collection_theme_prev', 60, progressY + 18, 44, 44);
      this.addRegion('collection_theme_next', 646, progressY + 18, 44, 44);
    }

    const pageCount = Math.max(1, Math.ceil(list.length / 6));
    const page = clamp(view.fruitShopPage || 0, 0, pageCount - 1);
    if (unlocked) {
      drawFeatureGlyph(ctx, 'sparkle', 93, progressY + 98, 28, theme.color);
      drawText(ctx, `${progress.discovered}/${progress.total}`, 119, progressY + 107, 22, theme.darkColor, 'left', 900);
      drawProgressBar(ctx, 226, progressY + 91, 188, 16, progress.ratio, theme.color);
      drawCurrencyChip(ctx, 500, progressY + 76, 166, 46, getCollectionValue(collection));
    } else {
      drawLockIcon(ctx, 244, progressY + 96, 30, theme.darkColor);
      drawText(ctx, '集齐上一主题后开启', 274, progressY + 105, 21, theme.darkColor, 'left', 800);
    }

    const pageBarY = progressY + 142;
    if (unlocked && pageCount > 1) {
      drawCircleButton(ctx, 300, pageBarY + 22, 40, '‹', true);
      drawPill(ctx, 326, pageBarY + 2, 98, 40, `${page + 1}/${pageCount}`, 'rgba(255,255,255,0.72)', colorWithAlpha(theme.color, 0.5), 18);
      drawCircleButton(ctx, 450, pageBarY + 22, 40, '›', true);
      this.addRegion('fruit_page_prev', 280, pageBarY + 2, 40, 40);
      this.addRegion('fruit_page_next', 430, pageBarY + 2, 40, 40);
    }

    const startY = progressY + (unlocked && pageCount > 1 ? 196 : 154);
    const footerSpace = 132 + this.safeBottom;
    const rowGap = 16;
    const cardHeight = clamp((this.height - startY - footerSpace - rowGap * 2) / 3, 248, 350);
    const cardWidth = 310;
    const xPositions = [55, 385];

    if (unlocked) {
      visibility.slice(page * 6, page * 6 + 6).forEach((visibleEntry, index) => {
        const collectible = visibleEntry.collectible;
        const column = index % 2;
        const row = Math.floor(index / 2);
        const x = xPositions[column];
        const y = startY + row * (cardHeight + rowGap);
        const entry = collection[collectible.id] || null;
        drawCollectionCard(ctx, collectible, this.rareImages[collectible.id], entry, visibleEntry.status, x, y, cardWidth, cardHeight, theme);
        this.addRegion('fruit_detail', x, y, cardWidth, cardHeight, { id: collectible.id });
      });
    } else {
      drawLockedThemeGate(ctx, theme, startY + 24, this.width);
    }

    const shareY = this.height - this.safeBottom - 116;
    drawButton(ctx, 126, shareY, 498, 74, unlocked ? '分享我的奇趣藏馆' : '分享我的收藏进度', '', 'share', theme.color, theme.darkColor);
    this.addRegion('share', 126, shareY, 498, 74, { source: 'fruit_shop' });
  }

  drawStore(ctx, view, saveData) {
    const headerY = this.safeTop + 8;
    drawCircleButton(ctx, 54, headerY + 39, 52, '‹', true);
    this.addRegion('back_home', 28, headerY + 13, 52, 52);
    drawText(ctx, '装满这一箱 · 补给商店', 100, headerY + 42, 31, CONFIG.COLORS.ink, 'left', 950);
    const sellables = getSellableCollectibles(saveData.rareFruits);
    const ownedTotal = sellables.reduce((sum, item) => sum + item.owned, 0);
    const summaryY = headerY + 82;
    drawCard(ctx, 48, summaryY, 654, 102, 29, 'rgba(255,255,255,0.88)', 'rgba(255,255,255,0.78)', 9);
    drawStoreSummaryMetric(ctx, 64, summaryY + 15, 194, 72, 'museum', String(ownedTotal), '藏品', '#9277E5');
    drawStoreSummaryMetric(ctx, 278, summaryY + 15, 194, 72, 'coin', formatPoints(getCollectionValue(saveData.rareFruits)), '总价值', CONFIG.COLORS.tealDark);
    drawStoreSummaryMetric(ctx, 492, summaryY + 15, 194, 72, 'coin', formatPoints(saveData.coins || 0), '金币', CONFIG.COLORS.goldDark);

    const sellTitleY = summaryY + 132;
    drawFeatureGlyph(ctx, 'museum', 74, sellTitleY, 28, '#9277E5');
    drawText(ctx, '我的藏品', 104, sellTitleY + 10, 25, CONFIG.COLORS.ink, 'left', 900);
    const sellPanelY = sellTitleY + 28;
    const sellPanelH = 178;
    drawCard(ctx, 48, sellPanelY, 654, sellPanelH, 28, 'rgba(255,255,255,0.74)', 'rgba(61,49,82,0.08)', 6);

    if (!sellables.length) {
      drawSealedCollectionIcon(ctx, 280, sellPanelY + sellPanelH / 2, 70, '#AAA3AF');
      drawText(ctx, '发现闪耀藏品后可在这里回收', 330, sellPanelY + sellPanelH / 2 + 10, 20, CONFIG.COLORS.mutedInk, 'left', 800, 320);
    } else {
      const pageCount = Math.max(1, Math.ceil(sellables.length / 3));
      const page = clamp(view.storeSellPage || 0, 0, pageCount - 1);
      if (pageCount > 1) {
        drawCircleButton(ctx, 566, sellTitleY + 2, 38, '‹', true);
        drawPill(ctx, 590, sellTitleY - 17, 62, 38, `${page + 1}/${pageCount}`, 'rgba(255,255,255,0.72)', '#9277E5', 16);
        drawCircleButton(ctx, 676, sellTitleY + 2, 38, '›', true);
        this.addRegion('store_sell_prev', 547, sellTitleY - 17, 38, 38);
        this.addRegion('store_sell_next', 657, sellTitleY - 17, 38, 38);
      }
      const gap = 14;
      const width = 198;
      sellables.slice(page * 3, page * 3 + 3).forEach((item, index) => {
        const x = 64 + index * (width + gap);
        drawStoreCollectibleCard(ctx, item, this.rareImages[item.collectible.id], x, sellPanelY + 12, width, sellPanelH - 24);
        this.addRegion('store_sell_request', x, sellPanelY + 12, width, sellPanelH - 24, { id: item.collectible.id });
      });
    }

    const adY = sellPanelY + sellPanelH + 16;
    drawStoreAdCard(ctx, 48, adY, 654, 76, view.adCoinStatus, Boolean(view.rewardAvailable));
    this.addRegion('store_ad_coins', 48, adY, 654, 76);

    const productTitleY = adY + 106;
    drawFeatureGlyph(ctx, 'box', 74, productTitleY, 29, CONFIG.COLORS.tealDark);
    drawText(ctx, '补给货架', 104, productTitleY + 10, 26, CONFIG.COLORS.ink, 'left', 900);
    const productY = productTitleY + 32;
    const vouchers = saveData.boosterVouchers || {};
    const ownedById = {
      rescue_ticket: saveData.rescueTickets || 0,
      voucher_hint: vouchers.hint || 0,
      voucher_shuffle: vouchers.shuffle || 0,
      voucher_add_time: vouchers.add_time || 0,
      voucher_auto_pack: vouchers.auto_pack || 0
    };
    const products = [
      'rescue_ticket', 'voucher_hint', 'voucher_shuffle', 'voucher_add_time', 'voucher_auto_pack'
    ].map((id) => {
      const definition = STORE_PRODUCT_DEFINITIONS[id];
      const owned = ownedById[id] || 0;
      return Object.assign({}, definition, {
        owned: `×${owned}`,
        cost: definition.unitCost,
        maxed: owned >= definition.maxOwned
      });
    });
    const productGapX = 14;
    const productGapY = 14;
    const productWidth = 316;
    const availableHeight = this.height - this.safeBottom - productY - 26;
    const productHeight = clamp((availableHeight - productGapY * 2) / 3, 138, 170);
    products.forEach((product, index) => {
      const column = index % 2;
      const row = Math.floor(index / 2);
      const x = 52 + column * (productWidth + productGapX);
      const y = productY + row * (productHeight + productGapY);
      drawStoreProductCard(ctx, product, x, y, productWidth, productHeight, saveData.coins || 0);
      this.addRegion('store_buy', x, y, productWidth, productHeight, { id: product.id });
    });
  }

  drawFeatureIntro(ctx, feature) {
    const content = {
      daily: { title: '今日挑战已开启', color: CONFIG.COLORS.teal, button: '开始今日挑战' },
      museum: { title: '奇趣藏馆已开启', color: '#9277E5', button: '进入藏馆' },
      store: { title: '补给商店已开启', color: CONFIG.COLORS.goldDark, button: '进入商店' }
    }[feature];
    if (!content) return;
    drawModalMask(ctx, this.width, this.height, 0.54);
    const h = 560;
    const y = (this.height - h) / 2;
    drawCard(ctx, 68, y, 614, h, 44, '#FFFDF8', 'rgba(255,255,255,0.85)', 28);
    drawCircleButton(ctx, 642, y + 42, 44, '×', true);
    this.addRegion('feature_intro_close', 620, y + 20, 44, 44);
    drawText(ctx, content.title, this.width / 2, y + 82, 38, CONFIG.COLORS.ink, 'center', 950);

    if (feature === 'daily') {
      drawModeCompareCard(ctx, 100, y + 128, 260, 244, 'route', '主线', '推进关卡', '解锁主题', CONFIG.COLORS.coral);
      drawModeCompareCard(ctx, 390, y + 128, 260, 244, 'calendar', '今日', '每日同题', '首胜 +25', CONFIG.COLORS.teal);
    } else if (feature === 'museum') {
      drawIntroFlowNode(ctx, 190, y + 238, 108, 'sparkle', '#9277E5');
      drawFlowArrow(ctx, 260, y + 238, 238, '#9E96A8');
      drawIntroFlowNode(ctx, 560, y + 238, 108, 'museum', CONFIG.COLORS.teal);
      drawText(ctx, '发现', 190, y + 326, 23, CONFIG.COLORS.ink, 'center', 850);
      drawText(ctx, '点亮', 560, y + 326, 23, CONFIG.COLORS.ink, 'center', 850);
      drawStatusChip(ctx, 250, y + 370, 250, 44, 'shield', '记录永久保留', '#7458C7');
    } else {
      drawIntroFlowNode(ctx, 142, y + 232, 92, 'collectible', '#9277E5');
      drawFlowArrow(ctx, 216, y + 232, 78, '#9E96A8');
      drawIntroFlowNode(ctx, 332, y + 232, 92, 'coin', CONFIG.COLORS.goldDark);
      drawFlowArrow(ctx, 406, y + 232, 78, '#9E96A8');
      drawIntroFlowNode(ctx, 560, y + 232, 92, 'shield', CONFIG.COLORS.coral);
      drawText(ctx, '藏品', 142, y + 313, 22, CONFIG.COLORS.ink, 'center', 850);
      drawText(ctx, '金币', 332, y + 313, 22, CONFIG.COLORS.ink, 'center', 850);
      drawText(ctx, '救援', 560, y + 313, 22, CONFIG.COLORS.ink, 'center', 850);
      drawStatusChip(ctx, 244, y + 366, 262, 44, 'precision', '重复件优先', CONFIG.COLORS.goldDark);
    }

    drawButton(ctx, 132, y + h - 100, 486, 76, content.button, '', 'play', content.color, darkenColor(content.color, 0.16));
    this.addRegion('feature_intro_continue', 132, y + h - 100, 486, 76);
  }

  drawStoreSaleOffer(ctx, offer) {
    if (!offer || !offer.collectible) return;
    drawModalMask(ctx, this.width, this.height, 0.56);
    const h = 610;
    const y = (this.height - h) / 2;
    const collectible = offer.collectible;
    drawCard(ctx, 76, y, 598, h, 44, '#FFFDF8', 'rgba(255,255,255,0.86)', 28);
    drawText(ctx, '回收藏品', this.width / 2, y + 72, 37, CONFIG.COLORS.ink, 'center', 950);
    drawCollectibleVisual(ctx, collectible, this.rareImages[collectible.id], 250, y + 242, 190);
    drawFlowArrow(ctx, 348, y + 242, 96, '#9E96A8');
    drawIntroFlowNode(ctx, 514, y + 242, 116, 'coin', CONFIG.COLORS.goldDark);
    drawText(ctx, collectible.name, 250, y + 366, 26, collectible.color, 'center', 900, 250);
    drawText(ctx, `+${offer.value}`, 514, y + 366, 31, CONFIG.COLORS.goldDark, 'center', 950);
    drawPill(ctx, 238, y + 402, 274, 46, `×${offer.owned}  →  ×${Math.max(0, offer.owned - 1)}`, colorWithAlpha(collectible.color, 0.08), collectible.color, 21);
    drawStatusChip(ctx, this.width / 2 - 90, y + 466, 180, 40, 'shield', '图鉴保留', CONFIG.COLORS.tealDark);
    drawSmallButton(ctx, 108, y + 512, 252, 72, '再想想', '×', '#B8B0BC', '#938A99');
    drawSmallButton(ctx, 390, y + 512, 252, 72, '确认回收', '✓', CONFIG.COLORS.gold, CONFIG.COLORS.goldDark);
    this.addRegion('store_sell_cancel', 108, y + 512, 252, 72);
    this.addRegion('store_sell_confirm', 390, y + 512, 252, 72);
  }

  drawStorePurchaseOffer(ctx, offer, saveData) {
    if (!offer || !offer.product) return;
    const product = offer.product;
    const quantity = Math.max(1, offer.quantity || 1);
    const totalCost = product.unitCost * quantity;
    const affordable = (saveData.coins || 0) >= totalCost;
    drawModalMask(ctx, this.width, this.height, 0.58);
    const h = Math.min(720, this.height - 80);
    const y = (this.height - h) / 2;
    drawCard(ctx, 64, y, 622, h, 44, '#FFFDF8', 'rgba(255,255,255,0.88)', 30);
    drawCircleButton(ctx, 646, y + 42, 46, '×', true);
    this.addRegion('store_purchase_cancel', 623, y + 19, 46, 46);
    drawText(ctx, '购买补给', this.width / 2, y + 72, 38, CONFIG.COLORS.ink, 'center', 950);

    drawIntroFlowNode(ctx, this.width / 2, y + 166, 112, product.icon, product.color);
    drawText(ctx, product.label, this.width / 2, y + 257, 31, CONFIG.COLORS.ink, 'center', 950);
    drawWrappedText(ctx, product.description, this.width / 2, y + 296, 19, CONFIG.COLORS.mutedInk, 'center', 700, 520, 32, 2);

    drawStatusChip(ctx, 142, y + 365, 208, 44, 'box', `已有 ×${offer.owned || 0}`, product.color);
    drawStatusChip(ctx, 400, y + 365, 208, 44, 'coin', `单价 ${product.unitCost}`, CONFIG.COLORS.goldDark);

    drawCenteredText(ctx, '数量', this.width / 2, y + 449, 20, CONFIG.COLORS.mutedInk, 'center', 850);
    drawCircleButton(ctx, 256, y + 504, 58, '−', quantity > 1);
    drawPill(ctx, 294, y + 474, 162, 60, `×${quantity}`, colorWithAlpha(product.color, 0.1), product.color, 24);
    drawCircleButton(ctx, 494, y + 504, 58, '+', quantity < offer.maxQuantity);
    this.addRegion('store_purchase_dec', 227, y + 475, 58, 58);
    this.addRegion('store_purchase_inc', 465, y + 475, 58, 58);

    drawCard(ctx, 146, y + 552, 458, 68, 24, affordable ? '#FFF6D8' : '#F2EFF3', affordable ? 'rgba(219,157,45,0.28)' : 'rgba(117,106,132,0.12)', 4);
    drawCenteredText(ctx, '合计', 184, y + 586, 20, CONFIG.COLORS.mutedInk, 'left', 800);
    drawCoin(ctx, 484, y + 584, 12);
    drawCenteredText(ctx, String(totalCost), 568, y + 586, 24, affordable ? CONFIG.COLORS.goldDark : CONFIG.COLORS.danger, 'right', 950, 66);

    const buttonY = y + h - 92;
    drawSmallButton(ctx, 106, buttonY, 258, 70, '再想想', '×', '#B8B0BC', '#938A99');
    drawSmallButton(ctx, 386, buttonY, 258, 70, affordable ? '确认购买' : '金币不足', affordable ? '✓' : '×', affordable ? CONFIG.COLORS.gold : '#B8B0BC', affordable ? CONFIG.COLORS.goldDark : '#938A99');
    this.addRegion('store_purchase_cancel', 106, buttonY, 258, 70);
    this.addRegion('store_purchase_confirm', 386, buttonY, 258, 70);
  }

  drawReviveChoice(ctx, saveData, rewardAvailable, view) {
    drawModalMask(ctx, this.width, this.height, 0.58);
    const h = 590;
    const y = (this.height - h) / 2;
    drawCard(ctx, 62, y, 626, h, 44, '#FFFDF8', 'rgba(255,255,255,0.86)', 30);
    drawText(ctx, '复活', this.width / 2, y + 70, 39, CONFIG.COLORS.ink, 'center', 950);
    drawPill(ctx, this.width / 2 - 70, y + 86, 140, 40, '每局 ×1', 'rgba(61,49,82,0.05)', CONFIG.COLORS.mutedInk, 17);

    const optionY = y + 140;
    const rescueTotal = (saveData.rescueTickets || 0) + (view && view.reviveEligibleNewcomer || 0);
    drawReviveOptionCard(ctx, 84, optionY, 182, 270, 'ticket', view && view.reviveEligibleNewcomer ? '免费救援' : '救援券', `×${rescueTotal}`, CONFIG.COLORS.coral, rescueTotal > 0);
    drawReviveOptionCard(ctx, 284, optionY, 182, 270, 'video', '视频', rewardAvailable ? '▶' : '待开通', '#9277E5', rewardAvailable);
    drawReviveOptionCard(ctx, 484, optionY, 182, 270, 'coin', '金币', String(REVIVE_COIN_COST), CONFIG.COLORS.goldDark, true);
    this.addRegion('revive_ticket', 84, optionY, 182, 270);
    this.addRegion('revive_ad', 284, optionY, 182, 270);
    this.addRegion('revive_coin', 484, optionY, 182, 270);

    drawButton(ctx, 170, y + 476, 410, 72, '暂不复活', '', 'home', '#FFFFFF', '#D7C9BC', CONFIG.COLORS.ink);
    this.addRegion('revive_panel_close', 170, y + 476, 410, 72);
  }

  drawReviveExchange(ctx, offer) {
    if (!offer || !offer.plan) return;
    drawModalMask(ctx, this.width, this.height, 0.6);
    const h = 650;
    const y = (this.height - h) / 2;
    drawCard(ctx, 60, y, 630, h, 44, '#FFFDF8', 'rgba(255,255,255,0.88)', 30);
    drawText(ctx, '智能兑换', this.width / 2, y + 72, 37, CONFIG.COLORS.ink, 'center', 950);
    drawStatusChip(ctx, 190, y + 88, 162, 42, 'coin', String(offer.coinsBefore), CONFIG.COLORS.goldDark);
    drawStatusChip(ctx, 398, y + 88, 162, 42, 'warning', String(offer.shortfall), CONFIG.COLORS.coral);

    const entries = offer.plan.entries || [];
    const shown = entries.slice(0, 3);
    const gap = 132;
    const startX = this.width / 2 - (shown.length - 1) * gap / 2;
    shown.forEach((entry, index) => {
      const x = startX + index * gap;
      ctx.fillStyle = 'rgba(255,255,255,0.84)';
      ctx.beginPath(); ctx.arc(x, y + 230, 56, 0, Math.PI * 2); ctx.fill();
      drawCollectibleVisual(ctx, entry.collectible, this.rareImages[entry.id], x, y + 230, 102);
      drawPill(ctx, x - 41, y + 286, 82, 38, `×${entry.count}`, colorWithAlpha(entry.collectible.color, 0.1), entry.collectible.color, 18);
    });
    if (entries.length > shown.length) drawText(ctx, `另有 ${entries.length - shown.length} 种`, this.width / 2, y + 346, 19, CONFIG.COLORS.mutedInk, 'center', 700);

    drawFlowArrow(ctx, 236, y + 386, 92, '#9E96A8');
    drawIntroFlowNode(ctx, 375, y + 386, 98, 'coin', CONFIG.COLORS.goldDark);
    drawFlowArrow(ctx, 422, y + 386, 92, '#9E96A8');
    drawIntroFlowNode(ctx, 560, y + 386, 98, 'shield', CONFIG.COLORS.coral);
    drawText(ctx, `+${offer.plan.total}`, 375, y + 464, 24, CONFIG.COLORS.goldDark, 'center', 900);
    drawText(ctx, `-${offer.cost}`, 560, y + 464, 24, CONFIG.COLORS.coralDark, 'center', 900);
    drawStatusChip(ctx, this.width / 2 - 90, y + 484, 180, 40, 'shield', '图鉴保留', CONFIG.COLORS.tealDark);

    drawSmallButton(ctx, 106, y + 540, 258, 78, '不同意', '×', '#B8B0BC', '#938A99');
    drawSmallButton(ctx, 386, y + 540, 258, 78, '同意并复活', '✓', CONFIG.COLORS.coral, CONFIG.COLORS.coralDark);
    this.addRegion('revive_panel_close', 106, y + 540, 258, 78);
    this.addRegion('revive_exchange_confirm', 386, y + 540, 258, 78);
  }

  drawReviveSellGuide(ctx) {
    drawModalMask(ctx, this.width, this.height, 0.6);
    const h = 560;
    const y = (this.height - h) / 2;
    drawCard(ctx, 70, y, 610, h, 44, '#FFFDF8', 'rgba(255,255,255,0.88)', 28);
    drawText(ctx, '资源不足', this.width / 2, y + 77, 37, CONFIG.COLORS.ink, 'center', 950);
    drawIntroFlowNode(ctx, 164, y + 236, 100, 'museum', '#9277E5');
    drawFlowArrow(ctx, 240, y + 236, 86, '#9E96A8');
    drawIntroFlowNode(ctx, 375, y + 236, 100, 'coin', CONFIG.COLORS.goldDark);
    drawFlowArrow(ctx, 450, y + 236, 86, '#9E96A8');
    drawIntroFlowNode(ctx, 586, y + 236, 100, 'shield', CONFIG.COLORS.coral);
    drawStatusChip(ctx, this.width / 2 - 108, y + 324, 216, 42, 'route', '继续闯关', CONFIG.COLORS.tealDark);
    drawSmallButton(ctx, 106, y + 438, 258, 78, '留在这里', '×', '#B8B0BC', '#938A99');
    drawSmallButton(ctx, 386, y + 438, 258, 78, '去商店', '店', CONFIG.COLORS.gold, CONFIG.COLORS.goldDark);
    this.addRegion('revive_panel_close', 106, y + 438, 258, 78);
    this.addRegion('revive_go_store', 386, y + 438, 258, 78);
  }

  drawBoosterChoice(ctx, offer) {
    if (!offer) return;
    const copy = {
      hint: { title: '使用提示', coin: '标出 1 个安全目标', ad: '标出 3 个安全目标', icon: 'hint', color: '#D99D2D' },
      shuffle: { title: '整理货架', coin: '重新排列顶层货物', ad: '免费观看并整理', icon: 'shuffle', color: '#D97846' },
      add_time: { title: '补充时间', coin: '关卡时间 +15 秒', ad: '关卡时间 +20 秒', icon: 'time', color: '#278F82' },
      auto_pack: { title: '自动装箱', coin: '安全装入最多 4 件', ad: '直接装满 1 箱并保留连击', icon: 'auto', color: '#7458C7' }
    }[offer.type];
    if (!copy) return;
    drawModalMask(ctx, this.width, this.height, 0.58);
    const h = 610;
    const y = (this.height - h) / 2;
    drawCard(ctx, 64, y, 622, h, 44, '#FFFDF8', 'rgba(255,255,255,0.88)', 30);
    drawCircleButton(ctx, 646, y + 42, 46, '×', true);
    this.addRegion('booster_cancel', 623, y + 19, 46, 46);
    drawIntroFlowNode(ctx, this.width / 2, y + 126, 96, copy.icon, copy.color);
    drawText(ctx, copy.title, this.width / 2, y + 215, 37, CONFIG.COLORS.ink, 'center', 950);
    drawText(ctx, '请选择本次消耗，不会自动扣金币', this.width / 2, y + 254, 19, CONFIG.COLORS.mutedInk, 'center', 750);

    const cardY = y + 294;
    drawChoicePaymentCard(ctx, 88, cardY, 272, 186, 'coin', `${offer.cost} 金币`, copy.coin, CONFIG.COLORS.goldDark, offer.coins >= offer.cost);
    drawChoicePaymentCard(ctx, 390, cardY, 272, 186, 'video', '看完整视频', copy.ad, '#7458C7', offer.rewardAvailable);
    this.addRegion('booster_coin', 88, cardY, 272, 186);
    this.addRegion('booster_ad', 390, cardY, 272, 186);
    drawButton(ctx, 170, y + 512, 410, 68, '暂时不用', '', 'home', '#FFFFFF', '#D7C9BC', CONFIG.COLORS.ink);
    this.addRegion('booster_cancel', 170, y + 512, 410, 68);
  }

  drawCollectibleRecovery(ctx, offer, saveData) {
    const collectible = offer && offer.collectible;
    if (!collectible) return;
    drawModalMask(ctx, this.width, this.height, 0.6);
    const h = 660;
    const y = (this.height - h) / 2;
    drawCard(ctx, 62, y, 626, h, 44, '#FFFDF8', 'rgba(255,255,255,0.9)', 30);
    drawText(ctx, '闪耀藏品飞走了', this.width / 2, y + 70, 37, CONFIG.COLORS.ink, 'center', 950);
    drawCollectibleVisual(ctx, collectible, this.rareImages[collectible.id], this.width / 2, y + 208, 174);
    drawText(ctx, collectible.name, this.width / 2, y + 316, 27, collectible.color, 'center', 900);
    drawText(ctx, '本次仍可追回，也可以直接继续游戏', this.width / 2, y + 354, 19, CONFIG.COLORS.mutedInk, 'center', 750);
    const optionY = y + 390;
    drawChoicePaymentCard(ctx, 88, optionY, 272, 146, 'coin', '400 金币', '立即收入藏馆', CONFIG.COLORS.goldDark, (saveData.coins || 0) >= 400);
    drawChoicePaymentCard(ctx, 390, optionY, 272, 146, 'video', '看完整视频', '免费追回', '#7458C7', offer.rewardAvailable);
    this.addRegion('collectible_recover_coin', 88, optionY, 272, 146);
    this.addRegion('collectible_recover_ad', 390, optionY, 272, 146);
    drawButton(ctx, 170, y + 560, 410, 68, '这次放弃，继续游戏', '', 'play', '#FFFFFF', '#D7C9BC', CONFIG.COLORS.ink);
    this.addRegion('collectible_recover_skip', 170, y + 560, 410, 68);
  }

  drawDecorationChoice(ctx, node) {
    drawModalMask(ctx, this.width, this.height, 0.62);
    const h = 700;
    const y = (this.height - h) / 2;
    drawCard(ctx, 62, y, 626, h, 44, '#FFFDF8', 'rgba(255,255,255,0.9)', 30);
    drawText(ctx, `装箱基地装饰 ${node}/10`, this.width / 2, y + 70, 37, CONFIG.COLORS.ink, 'center', 950, 540);
    drawText(ctx, `每累计 ${CONFIG.SHOP_NODE_STARS} 颗星解锁 1 次外观奖励`, this.width / 2, y + 111, 19, CONFIG.COLORS.mutedInk, 'center', 750, 540);
    drawText(ctx, '选中后立即应用到首页背景', this.width / 2, y + 145, 19, CONFIG.COLORS.mutedInk, 'center', 750, 540);
    drawDecorationCard(ctx, 88, y + 184, 272, 330, 'warm', '暖光木架', '#D8874E', '#FFF0D2', { actionText: '选择并应用' });
    drawDecorationCard(ctx, 390, y + 184, 272, 330, 'fresh', '清新薄荷架', '#278F82', '#E7FAF6', { actionText: '选择并应用' });
    this.addRegion('decoration_warm', 88, y + 184, 272, 330);
    this.addRegion('decoration_fresh', 390, y + 184, 272, 330);
    drawStatusChip(ctx, this.width / 2 - 180, y + 568, 360, 44, 'sparkle', '免费 · 永久保留 · 立即应用', CONFIG.COLORS.goldDark);
    drawText(ctx, '以后可在首页“我的基地”查看和切换', this.width / 2, y + 658, 18, CONFIG.COLORS.mutedInk, 'center', 700, 520);
  }

  drawBaseDecorPanel(ctx, saveData) {
    const decorations = Array.isArray(saveData && saveData.warehouseDecorations)
      ? saveData.warehouseDecorations
      : [];
    const styles = new Set(decorations.map((entry) => entry && entry.style));
    const active = saveData && saveData.warehouseStyle === 'fresh' ? 'fresh' : 'warm';
    drawModalMask(ctx, this.width, this.height, 0.58);
    const h = 700;
    const y = (this.height - h) / 2;
    drawCard(ctx, 62, y, 626, h, 44, '#FFFDF8', 'rgba(255,255,255,0.9)', 30);
    drawCircleButton(ctx, 646, y + 42, 46, '×', true);
    this.addRegion('base_decor_close', 623, y + 19, 46, 46);
    drawText(ctx, '我的装箱基地', this.width / 2, y + 70, 37, CONFIG.COLORS.ink, 'center', 950, 480);
    drawText(ctx, `已获得 ${decorations.length}/10 个装饰，选择已解锁风格`, this.width / 2, y + 114, 19, CONFIG.COLORS.mutedInk, 'center', 750, 520);
    drawText(ctx, '切换后会立即更新首页背景', this.width / 2, y + 148, 19, CONFIG.COLORS.mutedInk, 'center', 750, 520);
    drawDecorationCard(ctx, 88, y + 184, 272, 330, 'warm', '暖光木架', '#D8874E', '#FFF0D2', {
      unlocked: styles.has('warm'),
      active: active === 'warm'
    });
    drawDecorationCard(ctx, 390, y + 184, 272, 330, 'fresh', '清新薄荷架', '#278F82', '#E7FAF6', {
      unlocked: styles.has('fresh'),
      active: active === 'fresh'
    });
    this.addRegion('base_decor_warm', 88, y + 184, 272, 330);
    this.addRegion('base_decor_fresh', 390, y + 184, 272, 330);
    const activeName = active === 'fresh' ? '清新薄荷架' : '暖光木架';
    drawStatusChip(ctx, this.width / 2 - 166, y + 568, 332, 44, 'check', `首页正在使用：${activeName}`, active === 'fresh' ? '#278F82' : '#D8874E');
    drawText(ctx, '继续收集星星，最多可保留 10 个装饰', this.width / 2, y + 658, 18, CONFIG.COLORS.mutedInk, 'center', 700, 520);
  }

  drawRareDiscovery(ctx, discovery) {
    const collectible = discovery && (discovery.collectible || discovery.fruit);
    if (!collectible) return;
    const theme = getTheme(collectible.themeId);
    const rarityColor = RARITY_COLORS[collectible.rarity] || theme.color;
    drawModalMask(ctx, this.width, this.height, 0.58);
    const compact = this.height < 1450;
    const height = compact ? 740 : 800;
    const y = (this.height - height) / 2;
    drawCard(ctx, 64, y, 622, height, 46, '#FFFDF8', 'rgba(255,255,255,0.86)', 30);

    drawText(ctx, discovery.isNew ? '发现闪耀藏品！' : '又遇见它啦！', this.width / 2, y + 76, 39, CONFIG.COLORS.ink, 'center', 950);
    drawPill(ctx, this.width / 2 - 126, y + 96, 252, 44, `${theme.icon} ${theme.shortName} · ${collectible.rarityName}`, colorWithAlpha(rarityColor, 0.14), rarityColor, 18);

    ctx.save();
    ctx.shadowColor = collectible.glow;
    ctx.shadowBlur = 42;
    ctx.fillStyle = 'rgba(255,255,255,0.78)';
    ctx.beginPath();
    ctx.arc(this.width / 2, y + 282, compact ? 132 : 148, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    drawCollectibleVisual(ctx, collectible, this.rareImages[collectible.id], this.width / 2, y + 282, compact ? 250 : 280);

    drawText(ctx, collectible.name, this.width / 2, y + 449, 39, collectible.color, 'center', 950);
    drawDiscoveryChip(ctx, 104, y + 480, 166, 50, 'box', `×${discovery.count}`, collectible.color);
    drawDiscoveryChip(ctx, 292, y + 480, 166, 50, 'museum', `价值 ${getCollectibleSellValue(collectible)}`, collectible.color);
    drawDiscoveryChip(ctx, 480, y + 480, 166, 50, 'coin', `+${discovery.bonus}`, CONFIG.COLORS.goldDark);
    if (discovery.rescueTicketBonus) {
      drawStatusChip(ctx, this.width / 2 - 72, y + 542, 144, 40, 'ticket', '+1', CONFIG.COLORS.coral);
    }
    if (discovery.themeCompleted) {
      drawText(ctx, `全收集称号 · ${discovery.cosmeticTitle || `${theme.shortName}馆长`}`, this.width / 2, y + 590, 22, theme.darkColor, 'center', 950);
    } else if (discovery.rankUp && discovery.rankAfter) {
      drawText(ctx, `晋升 ${discovery.rankAfter.name}`, this.width / 2, y + 590, 21, discovery.rankAfter.color, 'center', 900);
    }

    const buttonY = y + (compact ? 626 : 666);
    drawSmallButton(ctx, 106, buttonY, 258, 78, '炫耀一下', '↗', '#9277E5', '#7458C7');
    drawSmallButton(ctx, 386, buttonY, 258, 78, '继续装箱', '✓', CONFIG.COLORS.teal, CONFIG.COLORS.tealDark);
    this.addRegion('share', 106, buttonY, 258, 78, { source: 'rare' });
    this.addRegion('rare_continue', 386, buttonY, 258, 78);
  }

  createFruitShopShareImage(saveData, requestedThemeId) {
    const canvas = this.platform.createOffscreenCanvas(1000, 800);
    if (!canvas) return Promise.reject(new Error('share_canvas_unavailable'));
    const ctx = canvas.getContext('2d');
    const collection = saveData.rareFruits || {};
    const themeId = requestedThemeId || saveData.activeThemeId || 'fruit';
    const theme = getTheme(themeId);
    const progress = getThemeProgress(themeId, collection);
    const level = saveData.highestLevelByTheme && saveData.highestLevelByTheme[themeId] || 1;
    const coins = Math.max(0, Math.floor(Number(saveData.coins) || 0));
    const totalPoints = getTotalPoints(saveData);
    const pointRank = getPointRank(totalPoints);
    const gradient = ctx.createLinearGradient(0, 0, 1000, 800);
    gradient.addColorStop(0, theme.paleColor);
    gradient.addColorStop(0.52, '#FFF4D8');
    gradient.addColorStop(1, colorWithAlpha(theme.color, 0.28));
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 1000, 800);
    drawText(ctx, `我的${theme.collectionName}`, 500, 88, 58, '#3D3152', 'center', 950);
    drawText(ctx, `${theme.name} · 已点亮 ${progress.discovered}/${progress.total} · 馆藏价值 ${formatPoints(getCollectionValue(collection))} 金币`, 500, 132, 27, '#756A84', 'center', 700);
    drawPill(ctx, 350, 145, 300, 44, `${pointRank.name} · ${formatPoints(totalPoints)} 分`, colorWithAlpha(pointRank.color, 0.13), pointRank.color, 21);

    getCollectionShowcase(collection, themeId, 8, level).forEach((showcaseEntry, index) => {
      const collectible = showcaseEntry.collectible;
      const x = 48 + (index % 4) * 238;
      const y = 198 + Math.floor(index / 4) * 242;
      const entry = collection[collectible.id] || null;
      drawCard(ctx, x, y, 214, 214, 30, 'rgba(255,255,255,0.84)', 'rgba(255,255,255,0.72)', 10);
      if (entry) {
        const mastery = getCollectibleMastery(entry.count);
        drawCollectibleVisual(ctx, collectible, this.rareImages[collectible.id], x + 107, y + 82, 118);
        drawText(ctx, collectible.name, x + 107, y + 157, 23, collectible.color, 'center', 900);
        drawText(ctx, `${collectible.rarityName} · ×${entry.count} · ${mastery.name}`, x + 107, y + 190, 16, RARITY_COLORS[collectible.rarity], 'center', 750, 198);
      } else if (showcaseEntry.status === 'revealed') {
        drawLockedCollectibleSilhouette(ctx, collectible, x + 107, y + 84, 100, '#AAA3B2');
        drawText(ctx, '接近揭晓', x + 107, y + 164, 21, '#8F8797', 'center', 850);
        drawText(ctx, `第${collectible.minLevel}关起有机会`, x + 107, y + 193, 16, '#A39CAA', 'center', 700);
      } else {
        drawSealedCollectionIcon(ctx, x + 107, y + 84, 88, '#AAA3B2');
        drawText(ctx, '封存中', x + 107, y + 164, 21, '#AAA3B2', 'center', 850);
        drawText(ctx, '继续闯关后揭晓', x + 107, y + 193, 16, '#B7B0BD', 'center', 650);
      }
    });
    drawText(ctx, `装满这一箱 · ${theme.name}你点亮了多少？`, 500, 744, 28, '#3D3152', 'center', 850);
    return this.platform.exportCanvas(canvas, {
      x: 0, y: 0, width: 1000, height: 800, destWidth: 1000, destHeight: 800
    });
  }

  drawGame(ctx, view, model, saveData) {
    if (!model) return;
    const headerY = this.safeTop + 8;
    drawCircleButton(ctx, 52, headerY + 42, 78, 'Ⅱ', true);
    drawCircleButton(ctx, 132, headerY + 42, 74, '?', true);
    this.addRegion('pause', 13, headerY + 3, 78, 78);
    this.addRegion('help', 95, headerY + 5, 74, 74);

    const journey = getJourneyInfo(model.level, model.themeId);
    const title = model.daily ? '装满这一箱 · 今日挑战' : `装满这一箱 · 第${model.level}关`;
    drawText(ctx, title, 180, headerY + 36, 23, CONFIG.COLORS.ink, 'left', 900, 254);
    drawFeatureGlyph(ctx, 'box', 190, headerY + 64, 22, journey.endless ? journey.color : CONFIG.COLORS.mutedInk);
    drawText(ctx, `${model.boxesCompleted}/${model.orderQueue.length}`, 212, headerY + 72, 19, journey.endless ? journey.color : CONFIG.COLORS.mutedInk, 'left', 850, 76);
    drawPill(ctx, 438, headerY + 18, 100, 42, 'Ⅱ 免费', 'rgba(62,159,214,0.09)', '#3E9FD6', 16);

    const timerColor = model.remainingMs <= 10000 ? CONFIG.COLORS.danger : CONFIG.COLORS.tealDark;
    drawTimerChip(ctx, 38, headerY + 82, 144, 50, formatTime(model.remainingMs), timerColor);
    drawProgressBar(ctx, 200, headerY + 96, 318, 22, model.getProgress(), journey.color || CONFIG.COLORS.teal);
    drawText(ctx, `${Math.round(model.getProgress() * 100)}%`, 535, headerY + 113, 18, CONFIG.COLORS.mutedInk, 'left', 800);
    drawCurrencyChip(ctx, 570, headerY + 82, 142, 50, (saveData.coins || 0));

    const targetsY = headerY + 146;
    const bottomBase = this.height - this.safeBottom - 48;
    const boosterY = bottomBase - 76;
    const boardTop = targetsY + 130;
    const boardBottom = boosterY - 16;
    this.drawTargets(ctx, model, targetsY);
    this.drawBoard(ctx, model, boardTop, boardBottom);
    this.drawBoosters(ctx, model, boosterY, saveData, view);

    if (view.tutorialStep > 0 && model.themeId === 'fruit' && model.level === 1 && view.overlay == null) {
      this.drawTutorial(ctx, model, boardTop, boardBottom, view.tutorialStep);
    }

    if (view.overlay === 'mechanic_intro') this.drawMechanicIntro(ctx, view.mechanicIntro);
    else if (view.overlay === 'tutorial_intro') this.drawTutorialIntro(ctx);
    else if (view.overlay === 'pause') this.drawPause(ctx, view, saveData);
    else if (view.overlay === 'win') this.drawWin(ctx, view.result, view);
    else if (view.overlay === 'fail') this.drawFail(ctx, model, view, saveData);
    else if (view.overlay === 'rare') this.drawRareDiscovery(ctx, view.rareDiscovery);
    else if (view.overlay === 'countdown') this.drawResumeCountdown(ctx, view.resumeCountdown);
  }

  drawBoard(ctx, model, top, bottom) {
    const height = Math.max(280, bottom - top);
    const playTop = top + 78;
    const playBottom = bottom - 14;
    const layout = getStackLayout(this.width, playTop, playBottom, model.stacks.length);
    const activeCollectible = model.getActiveCollectibleTimer();
    const movement = model.config && model.config.movement || null;
    const movementState = getMovementState(layout, movement, this.animationMs, this.reducedMotion);
    this.boardInputBlocked = movementState.inputBlocked;
    const goldenPacking = model.getGoldenPackingMs && model.getGoldenPackingMs() > 0;
    const goldenTargets = goldenPacking ? new Set(model.getHints(99)) : new Set();

    drawCard(ctx, 24, top, this.width - 48, height, 36, 'rgba(255,255,255,0.52)', 'rgba(255,255,255,0.66)', 10);
    const guidance = getBoardGuidance(model);
    if (guidance) drawGuidanceBar(ctx, 44, top + 14, 406, 48, guidance);
    else drawBoardHeaderMotif(ctx, 48, top + 18, 396, 40);
    drawStatusChip(ctx, 466, top + 14, 112, 48, model.warningActive ? 'warning' : 'score', model.warningActive ? '警告' : formatPoints(model.score || 0), model.warningActive ? CONFIG.COLORS.danger : CONFIG.COLORS.goldDark);
    drawStatusChip(ctx, 592, top + 14, 112, 48, 'combo', String(model.combo), goldenPacking ? CONFIG.COLORS.goldDark : '#8063D8');
    drawBoardAmbience(ctx, 42, playTop, this.width - 84, Math.max(60, playBottom - playTop));

    layout.rows.forEach((row) => drawConveyorBelt(ctx, row, layout.cardSize));

    model.stacks.forEach((stack, index) => {
      const position = movementState.positions[index] || layout.positions[index];
      const cardSize = layout.cardSize;
      const x = position.x;
      const topCardY = position.y;
      if (!stack.length) {
        ctx.strokeStyle = 'rgba(61,49,82,0.13)';
        ctx.lineWidth = 3;
        strokeRoundRect(ctx, x, topCardY, cardSize, cardSize, 21);
        return;
      }

      const visible = Math.min(4, stack.length);
      for (let depth = visible - 1; depth >= 0; depth -= 1) {
        const type = stack[depth];
        const offsetY = -depth * Math.min(31, cardSize * 0.29);
        const scale = 1 - depth * 0.045;
        const size = cardSize * scale;
        const drawX = x + (cardSize - size) / 2;
        const drawY = topCardY + offsetY + (cardSize - size);
        const alpha = depth === 0 ? 1 : Math.max(0.34, 0.82 - depth * 0.17);
        const collectible = getCollectibleFromToken(type);
        if (depth === 0 && collectible && activeCollectible && activeCollectible.id === collectible.id) {
          drawRainbowHalo(
            ctx,
            drawX + size / 2,
            drawY + size / 2,
            size * 0.7,
            activeCollectible.remainingMs / activeCollectible.durationMs
          );
        }
        if (collectible) drawCollectibleItemCard(ctx, collectible, this.rareImages[collectible.id], drawX, drawY, size, alpha, depth === 0);
        else {
          const parsed = parseItemToken(type);
          drawItemCard(ctx, getItemById(parsed.type), drawX, drawY, size, alpha, depth === 0, parsed.rule);
        }
        if (depth === 0 && goldenTargets.has(index)) drawGoldenCardGlow(ctx, drawX, drawY, size);
      }

      if (activeCollectible && activeCollectible.stackIndex === index) {
        drawRareCountdownBadge(ctx, x + cardSize - 46, topCardY + 10, activeCollectible.remainingMs);
      }

      if (this.hintStacks.indexOf(index) >= 0 || model.getSafeHighlightStack && model.getSafeHighlightStack() === index) {
        const pulse = 1 + Math.sin(Date.now() / 95) * 0.055;
        ctx.save();
        ctx.translate(x + cardSize / 2, topCardY + cardSize / 2);
        ctx.scale(pulse, pulse);
        ctx.strokeStyle = CONFIG.COLORS.gold;
        ctx.lineWidth = 8;
        ctx.globalAlpha = 0.9;
        strokeRoundRect(ctx, -cardSize / 2 - 5, -cardSize / 2 - 5, cardSize + 10, cardSize + 10, 26);
        ctx.restore();
      }

      if (!movementState.inputBlocked) {
        const minimumTouch = Math.max(44, 44 * CONFIG.DESIGN_WIDTH / Math.max(320, this.platform.system.windowWidth || 375));
        const touchSize = Math.max(cardSize + 8, minimumTouch);
        this.addRegion('stack', x + cardSize / 2 - touchSize / 2, topCardY + cardSize / 2 - touchSize / 2, touchSize, touchSize, {
          index,
          token: stack[0]
        });
      }

      const hiddenCount = stack.length - visible;
      if (hiddenCount > 0) {
        const tagSize = clamp(cardSize * 0.29, 32, 36);
        drawStackCountBadge(
          ctx,
          x + cardSize - tagSize / 2 - 10,
          topCardY + cardSize - tagSize / 2 - 10,
          tagSize,
          hiddenCount
        );
      }
    });

    if (model.getInteractionFrozenMs && model.getInteractionFrozenMs() > 0) {
      drawFrozenBoardOverlay(ctx, 30, playTop - 4, this.width - 60, Math.max(120, playBottom - playTop + 8), model.getInteractionFrozenMs());
    }
    if (movementState.warning) drawMovementWarning(ctx, this.width / 2, playTop + 16);
    if (goldenPacking) drawGoldenPackingBanner(ctx, this.width / 2, playTop + 18, model.getGoldenPackingMs());
  }

  drawBoosters(ctx, model, y, saveData, view) {
    const rewardAvailable = Boolean(view && view.rewardAvailable);
    const vouchers = saveData.boosterVouchers || {};
    // 道具随玩法逐步出现，避免新玩家第一关就面对四个陌生入口。
    // 卡面只保留图标和消耗，完整含义统一放在左上角“？”中。
    const visibleActions = getVisibleBoosterActions(model.level, model.daily);
    const tools = [
      { action: 'hint', icon: 'hint', coinCost: BOOSTER_COIN_COSTS.hint, voucher: vouchers.hint || 0, reward: rewardAvailable, color: '#D99D2D' },
      { action: 'shuffle', icon: 'shuffle', coinCost: BOOSTER_COIN_COSTS.shuffle, voucher: vouchers.shuffle || 0, reward: rewardAvailable, color: '#D97846' },
      { action: 'add_time', icon: 'time', coinCost: BOOSTER_COIN_COSTS.add_time, voucher: vouchers.add_time || 0, reward: rewardAvailable, color: '#278F82' },
      { action: 'auto_pack', icon: 'auto', coinCost: BOOSTER_COIN_COSTS.auto_pack, voucher: vouchers.auto_pack || 0, reward: rewardAvailable, color: '#7458C7' }
    ].filter((tool) => visibleActions.indexOf(tool.action) >= 0);
    const width = 148;
    const gap = 14;
    const startX = (this.width - width * tools.length - gap * (tools.length - 1)) / 2;
    tools.forEach((tool, index) => {
      const x = startX + index * (width + gap);
      const displayTool = Object.assign({}, tool, {
        cost: tool.voucher > 0 ? `×${tool.voucher}` : (tool.reward ? '币 / ▶' : tool.coinCost)
      });
      const affordable = tool.voucher > 0 || tool.reward || saveData.coins >= tool.coinCost;
      drawBoosterTool(ctx, x, y, width, 72, displayTool, affordable);
      this.addRegion(tool.action, x, y, width, 72);
    });
  }

  drawTargets(ctx, model, y) {
    drawCard(ctx, 24, y, this.width - 48, 116, 30, 'rgba(255,255,255,0.72)', 'rgba(255,255,255,0.78)', 7);
    drawFeatureGlyph(ctx, 'box', 54, y + 24, 25, CONFIG.COLORS.coral);
    drawText(ctx, model.waveCount > 1 ? `收集目标 · 第 ${model.currentWave}/${model.waveCount} 波` : '收集目标', 82, y + 33, 22, CONFIG.COLORS.ink, 'left', 900);
    const orders = model.activeOrders;
    const gap = 12;
    const width = orders.length === 1 ? 250 : (orders.length === 2 ? 250 : (this.width - 84 - gap * 2) / 3);
    const height = 76;
    const total = width * orders.length + gap * Math.max(0, orders.length - 1);
    const startX = (this.width - total) / 2;

    orders.forEach((order, index) => {
      const x = startX + index * (width + gap);
      const item = getItemById(order.type);
      drawOrderBox(ctx, item, x, y + 38, width, height, order.count, order.target, order.rule);
    });
  }

  drawTutorial(ctx, model, boardTop, boardBottom, step) {
    const hint = model.getHint();
    if (hint < 0) return;
    const layout = getStackLayout(this.width, boardTop + 78, boardBottom - 14, model.stacks.length);
    const position = layout.positions[hint];
    const cardSize = layout.cardSize;
    const x = position.x + cardSize / 2;
    const y = position.y + cardSize / 2;

    ctx.fillStyle = 'rgba(38,29,54,0.36)';
    ctx.fillRect(0, boardTop, this.width, boardBottom - boardTop + 30);
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.arc(x, y, cardSize * 0.72, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    drawCard(ctx, 84, boardTop + 126, 582, 136, 28, '#FFFFFF', 'rgba(61,49,82,0.12)', 12);
    const messages = {
      1: ['看目标', '箱里是要收集的物件'],
      2: ['点顶层', '金色光圈 = 可以点'],
      3: ['装满一箱', '同类凑满 3 件']
    };
    const copy = messages[step] || messages[3];
    drawPill(ctx, 105, boardTop + 147, 62, 42, `${step}/3`, '#FFF1C9', CONFIG.COLORS.goldDark, 17);
    drawText(ctx, copy[0], 188, boardTop + 179, 27, CONFIG.COLORS.ink, 'left', 900);
    drawText(ctx, copy[1], 188, boardTop + 229, 21, CONFIG.COLORS.mutedInk, 'left', 700, 440);

    ctx.strokeStyle = CONFIG.COLORS.gold;
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.arc(x, y, cardSize * (0.64 + Math.sin(Date.now() / 120) * 0.04), 0, Math.PI * 2);
    ctx.stroke();
  }

  drawTutorialIntro(ctx) {
    drawModalMask(ctx, this.width, this.height, 0.58);
    const h = Math.min(720, this.height - 130);
    const y = (this.height - h) / 2;
    drawCard(ctx, 54, y, 642, h, 44, '#FFFDF8', 'rgba(255,255,255,0.9)', 30);
    drawText(ctx, '3 步装满', this.width / 2, y + 78, 43, CONFIG.COLORS.ink, 'center', 950);

    const flowY = y + 236;
    drawTutorialStepNode(ctx, 152, flowY, 'box', '目标', CONFIG.COLORS.coral);
    drawFlowArrow(ctx, 213, flowY, 90, '#A39BA9');
    drawTutorialStepNode(ctx, 375, flowY, 'tap', '顶层', '#7458C7');
    drawFlowArrow(ctx, 436, flowY, 90, '#A39BA9');
    drawTutorialStepNode(ctx, 598, flowY, 'box', '装满', CONFIG.COLORS.tealDark);

    drawTutorialRuleTile(ctx, 92, y + 354, 270, 112, 'clock', '别超时', CONFIG.COLORS.coral);
    drawTutorialRuleTile(ctx, 388, y + 354, 270, 112, 'warning', '首错扣 8 秒', CONFIG.COLORS.danger);

    const buttonY = y + h - 116;
    drawButton(ctx, 130, buttonY, 490, 82, '开始', '', 'play', CONFIG.COLORS.teal, CONFIG.COLORS.tealDark);
    this.addRegion('tutorial_start', 130, buttonY, 490, 82);
  }

  drawMechanicIntro(ctx, mechanic) {
    if (!mechanic) return;
    drawModalMask(ctx, this.width, this.height, 0.6);
    const h = Math.min(760, this.height - 100);
    const y = (this.height - h) / 2;
    drawCard(ctx, 54, y, 642, h, 44, '#FFFDF8', 'rgba(255,255,255,0.92)', 30);
    drawPill(
      ctx,
      this.width / 2 - 116,
      y + 28,
      232,
      44,
      `第 ${mechanic.unlockLevel} 关 · 新机制`,
      mechanic.paleColor,
      mechanic.color,
      19
    );

    ctx.save();
    ctx.shadowColor = colorWithAlpha(mechanic.color, 0.36);
    ctx.shadowBlur = 28;
    ctx.fillStyle = mechanic.paleColor;
    ctx.beginPath();
    ctx.arc(this.width / 2, y + 146, 58, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.strokeStyle = mechanic.color;
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.restore();
    drawText(ctx, mechanic.badge, this.width / 2, y + 166, 48, mechanic.color, 'center', 900);

    drawText(ctx, mechanic.title, this.width / 2, y + 250, 38, CONFIG.COLORS.ink, 'center', 900, 560);
    drawWrappedText(
      ctx,
      mechanic.description,
      this.width / 2,
      y + 290,
      19,
      CONFIG.COLORS.mutedInk,
      'center',
      700,
      580,
      32,
      2
    );

    mechanic.tips.forEach((tip, index) => {
      const cardY = y + 356 + index * 102;
      drawCard(
        ctx,
        92,
        cardY,
        566,
        82,
        25,
        index % 2 ? '#F5F1FF' : '#F0FBF8',
        colorWithAlpha(mechanic.color, 0.12),
        4
      );
      ctx.fillStyle = colorWithAlpha(mechanic.color, 0.12);
      ctx.beginPath();
      ctx.arc(139, cardY + 41, 27, 0, Math.PI * 2);
      ctx.fill();
      const tipIcons = MECHANIC_TIP_ICONS[mechanic.id] || ['precision', 'warning'];
      drawFeatureGlyph(ctx, tipIcons[index] || 'warning', 139, cardY + 41, 29, mechanic.color);
      drawText(ctx, tip, 188, cardY + 51, 21, CONFIG.COLORS.ink, 'left', 800, 430);
    });

    drawStatusChip(ctx, this.width / 2 - 78, y + h - 153, 156, 40, 'clock', '已暂停', mechanic.color);
    drawButton(ctx, 130, y + h - 105, 490, 78, '知道了，开始挑战', '', 'play', mechanic.color, darkenColor(mechanic.color, 0.16));
    this.addRegion('mechanic_continue', 130, y + h - 105, 490, 78);
  }

  drawPause(ctx, view, saveData) {
    drawModalMask(ctx, this.width, this.height);
    const y = this.height / 2 - 270;
    drawCard(ctx, 98, y, 554, 530, 40, '#FFFDF8', 'rgba(255,255,255,0.8)', 26);
    drawText(ctx, '暂停装箱', this.width / 2, y + 78, 40, CONFIG.COLORS.ink, 'center', 900);
    drawStatusChip(ctx, 190, y + 108, 370, 44, 'pause', '暂停不限次数且完全停表', '#3E9FD6');
    drawStatusChip(ctx, 190, y + 162, 370, 40, 'sparkle', '藏品与移动也已暂停', CONFIG.COLORS.tealDark);
    drawSmallButton(ctx, 158, y + 224, 434, 66, saveData.reducedMotion ? '舒缓动态：已开启' : '舒缓动态：未开启', '≈', '#A98BE2', '#7458C7');
    drawButton(ctx, 158, y + 312, 434, 82, '继续 · 3 秒准备', '', 'play', CONFIG.COLORS.teal, CONFIG.COLORS.tealDark);
    drawButton(ctx, 158, y + 414, 434, 70, '返回首页', '', 'home', '#FFFFFF', '#D7C9BC', CONFIG.COLORS.ink);
    this.addRegion('toggle_motion', 158, y + 224, 434, 66);
    this.addRegion('resume', 158, y + 312, 434, 82);
    this.addRegion('quit', 158, y + 414, 434, 70);
  }

  drawResumeCountdown(ctx, value) {
    drawModalMask(ctx, this.width, this.height, 0.38);
    const number = Math.max(1, Math.floor(Number(value) || 3));
    ctx.save();
    ctx.shadowColor = 'rgba(61,49,82,0.3)';
    ctx.shadowBlur = 30;
    ctx.fillStyle = '#FFFDF8';
    ctx.beginPath();
    ctx.arc(this.width / 2, this.height / 2, 96, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    drawText(ctx, String(number), this.width / 2, this.height / 2 + 32, 92, CONFIG.COLORS.coral, 'center', 950);
    drawText(ctx, '看清目标，准备继续', this.width / 2, this.height / 2 + 150, 24, '#FFFFFF', 'center', 850);
  }

  drawWin(ctx, result, view) {
    drawModalMask(ctx, this.width, this.height, 0.46);
    const compact = this.height < 1450;
    const height = compact ? 780 : 830;
    const y = this.height / 2 - height / 2;
    drawCard(ctx, 72, y, 606, height, 44, '#FFFDF8', 'rgba(255,255,255,0.82)', 30);
    drawLogoBox(ctx, this.width / 2, y + 70, 0.44);
    drawText(ctx, result.daily ? '今日挑战完成！' : '这一箱装满啦！', this.width / 2, y + 170, 40, CONFIG.COLORS.ink, 'center', 950);

    if (!result.daily) {
      drawStars(ctx, this.width / 2, y + 235, result.stars);
      drawCoin(ctx, this.width / 2 - 84, y + 294, 10);
      drawCenteredText(ctx, result.firstClear ? `首通星级奖励 +${result.starCoins || 0} 金币` : `重复通关奖励为首通的 25%`, this.width / 2 + 12, y + 294, 20, CONFIG.COLORS.goldDark, 'center', 850, 420);
    } else {
      drawIntroFlowNode(ctx, this.width / 2, y + 235, 90, 'calendar', CONFIG.COLORS.teal);
      drawPill(
        ctx,
        this.width / 2 - 126,
        y + 286,
        252,
        40,
        result.dailyBonusCoins ? '今日首胜 +25 金币' : '今日首胜奖励已领取',
        'rgba(70,199,183,0.1)',
        CONFIG.COLORS.tealDark,
        17
      );
    }

    const rewardY = y + 330;
    drawCard(ctx, 102, rewardY, 546, 132, 28, '#FFF8E5', 'rgba(219,157,45,0.2)', 5);
    drawResultCoinMetric(ctx, 112, rewardY + 12, 168, 108, result.firstClear ? '装箱奖励' : '重复奖励', result.firstClear ? (result.boxCoins || 0) : (result.repeatCoins || 0), CONFIG.COLORS.tealDark);
    drawResultCoinMetric(
      ctx,
      291,
      rewardY + 12,
      168,
      108,
      result.daily ? '今日首胜' : (result.truckChest ? '通关+货车' : '通关+星级'),
      result.daily ? (result.dailyBonusCoins || 0) : ((result.completionCoins || 0) + (result.starCoins || 0) + (result.streakBonus || 0)),
      CONFIG.COLORS.goldDark
    );
    drawResultCoinMetric(ctx, 470, rewardY + 12, 168, 108, '本关共得', result.earnedCoins || 0, CONFIG.COLORS.coralDark);

    if (result.unlockedTheme) {
      drawStatusChip(ctx, this.width / 2 - 118, y + 476, 236, 38, 'sparkle', `新主题 · ${result.unlockedTheme.name}`, result.unlockedTheme.darkColor || CONFIG.COLORS.tealDark);
    } else if (result.truckChest) {
      drawStatusChip(ctx, this.width / 2 - 104, y + 476, 208, 38, 'store', '货车装满 · 宝箱 +12', CONFIG.COLORS.goldDark);
    } else if (result.rescueTicketBonus) {
      drawStatusChip(ctx, this.width / 2 - 82, y + 476, 164, 38, 'ticket', '救援券 +1', CONFIG.COLORS.coral);
    } else if (!result.daily && result.challengeScore) {
      drawStatusChip(
        ctx,
        this.width / 2 - 118,
        y + 476,
        236,
        38,
        result.challengeBeat ? 'sparkle' : 'route',
        result.challengeBeat ? '已超过好友成绩' : '再试一次就能超过',
        result.challengeBeat ? CONFIG.COLORS.tealDark : '#7458C7'
      );
    }

    const firstButtonY = y + (compact ? 526 : 544);
    if (!result.daily) {
      drawButton(ctx, 132, firstButtonY, 486, 84, '下一关', '', 'next', CONFIG.COLORS.coral, CONFIG.COLORS.coralDark);
      this.addRegion('next', 132, firstButtonY, 486, 84);
    } else {
      drawButton(ctx, 132, firstButtonY, 486, 84, '再挑战一次', '', 'replay', CONFIG.COLORS.coral, CONFIG.COLORS.coralDark);
      this.addRegion('replay', 132, firstButtonY, 486, 84);
    }

    drawSmallButton(ctx, 132, firstButtonY + 106, 232, 78, '好友比一比', '↗', '#9277E5', '#7458C7');
    if (!result.daily && result.truckChest && !view.doubleClaimed && view.rewardAvailable) {
      drawSmallButton(ctx, 386, firstButtonY + 106, 232, 78, '宝箱升级 +60', '▶', CONFIG.COLORS.gold, CONFIG.COLORS.goldDark);
      this.addRegion('double_reward', 386, firstButtonY + 106, 232, 78);
    } else {
      drawSmallButton(ctx, 386, firstButtonY + 106, 232, 78, '返回首页', '⌂', CONFIG.COLORS.teal, CONFIG.COLORS.tealDark);
      this.addRegion('quit', 386, firstButtonY + 106, 232, 78);
    }
    this.addRegion('share', 132, firstButtonY + 106, 232, 78, { source: 'result' });

  }

  drawFail(ctx, model, view, saveData) {
    drawModalMask(ctx, this.width, this.height, 0.5);
    const compact = this.height < 1450;
    const hasTicket = (saveData.rescueTickets || 0) > 0 || (model.level <= 5 && (saveData.newcomerRescues || 0) > 0);
    const collectionValue = getCollectionValue(saveData.rareFruits);
    const recoverableCoins = (saveData.coins || 0) + collectionValue;
    const needsSaleGuide = isFeatureUnlocked(saveData, 'store') && !(saveData.seenMechanics && saveData.seenMechanics.revive_sale);
    const canRevive = !model.revived && (
      hasTicket || view.rewardAvailable || recoverableCoins >= REVIVE_COIN_COST || collectionValue > 0 || needsSaleGuide
    );
    const height = compact ? (canRevive ? 720 : 610) : (canRevive ? 760 : 650);
    const y = this.height / 2 - height / 2;
    const failureReason = model.failureReason || view.result && view.result.failureReason || 'wrong';
    const timedOut = failureReason === 'timeout';
    const bombed = failureReason === 'bomb';
    drawCard(ctx, 74, y, 602, height, 44, '#FFFDF8', 'rgba(255,255,255,0.82)', 30);
    if (timedOut) drawLargeClock(ctx, this.width / 2, y + 99, CONFIG.COLORS.danger);
    else drawFailureGlyph(ctx, this.width / 2, y + 99, bombed ? 'bomb' : 'wrong');
    drawText(ctx, timedOut ? '时间到啦' : (bombed ? '碰到炸弹啦' : '拿错目标啦'), this.width / 2, y + 194, 40, CONFIG.COLORS.ink, 'center', 950);
    const failHint = model.revived
      ? '本局已经复活过，换个顺序再来'
      : (canRevive
        ? (timedOut ? '复活后至少保留 20 秒' : (bombed ? '复活后炸弹已解除' : '复活后清除警告并标出安全目标'))
        : '免费重开不限次数，换个顺序再来');
    drawText(ctx, failHint, this.width / 2, y + 237, 21, CONFIG.COLORS.mutedInk, 'center', 600);

    const pointRank = getPointRank(getTotalPoints(saveData));
    drawCard(ctx, 116, y + 264, 518, 84, 24, colorWithAlpha(pointRank.color, 0.06), colorWithAlpha(pointRank.color, 0.16), 3);
    drawResultMetric(ctx, 132, y + 277, 146, 58, 'box', `${model.boxesCompleted}/${model.orderQueue.length}`, CONFIG.COLORS.tealDark);
    drawResultMetric(ctx, 302, y + 277, 146, 58, 'tap', String(model.moves || 0), CONFIG.COLORS.coral);
    drawResultMetric(ctx, 472, y + 277, 146, 58, 'coin', formatPoints(saveData.coins || 0), CONFIG.COLORS.goldDark);

    if (canRevive) {
      drawReviveButton(ctx, 132, y + 370, 486, 86);
      this.addRegion('revive', 132, y + 370, 486, 86);
    }
    const secondaryY = canRevive ? y + 482 : y + 370;
    drawSmallButton(ctx, 132, secondaryY, 232, 78, '重新挑战', '↻', CONFIG.COLORS.teal, CONFIG.COLORS.tealDark);
    drawSmallButton(ctx, 386, secondaryY, 232, 78, '晒出差一点', '↗', '#9277E5', '#7458C7');
    this.addRegion('restart', 132, secondaryY, 232, 78);
    this.addRegion('share', 386, secondaryY, 232, 78, { source: 'fail' });
    const homeY = secondaryY + 98;
    drawButton(ctx, 170, homeY, 410, 68, '返回首页', '', 'home', '#FFFFFF', '#D7C9BC', CONFIG.COLORS.ink);
    this.addRegion('quit', 170, homeY, 410, 68);
  }

  drawHelp(ctx) {
    drawModalMask(ctx, this.width, this.height, 0.52);
    const h = Math.min(1000, this.height - 100);
    const y = (this.height - h) / 2;
    drawCard(ctx, 48, y, 654, h, 42, '#FFFDF8', 'rgba(255,255,255,0.88)', 30);
    drawText(ctx, '玩法说明', this.width / 2, y + 68, 42, CONFIG.COLORS.ink, 'center', 950);

    const steps = [
      ['box', '看目标', '同类凑满 3 件', CONFIG.COLORS.coral],
      ['tap', '点顶层', '+数字表示下方件数', '#7458C7'],
      ['warning', '一次容错', '首错 -8 秒，再错失败', CONFIG.COLORS.danger],
      ['clock', '放心暂停', '倒计时、藏品、移动全停', CONFIG.COLORS.tealDark],
      ['hint', '四种道具', '', '#D99D2D', true],
      ['sparkle', '闪耀藏品', '彩虹光圈仅 6 秒', '#B06ED8'],
      ['box', '藏品回归', '点亮后会随机成为目标', '#9277E5'],
      ['warning', '特殊标记', '', CONFIG.COLORS.danger, false, true],
      ['score', '限步目标', '金色目标优先完成', CONFIG.COLORS.goldDark],
      ['shield', '失败救援', '券 / 视频 / 金币 / 重开', CONFIG.COLORS.coral]
    ];
    const rowGap = clamp((h - 226) / steps.length, 80, 90);
    steps.forEach((step, index) => {
      const rowY = y + 96 + index * rowGap;
      const color = step[3];
      drawCard(ctx, 78, rowY, 594, rowGap - 10, 22, index % 2 ? '#F4FBFA' : '#FFF8ED', colorWithAlpha(color, 0.08), 2);
      ctx.fillStyle = colorWithAlpha(color, 0.12);
      ctx.beginPath(); ctx.arc(128, rowY + (rowGap - 10) / 2, 26, 0, Math.PI * 2); ctx.fill();
      drawFeatureGlyph(ctx, step[0], 128, rowY + (rowGap - 10) / 2, 29, color);
      const rowCenterY = rowY + (rowGap - 10) / 2;
      drawCenteredText(ctx, step[1], 176, rowCenterY, 21, CONFIG.COLORS.ink, 'left', 850, 178);
      if (step[4]) {
        const boosterIcons = [
          ['hint', '#D99D2D'],
          ['shuffle', '#D97846'],
          ['time', CONFIG.COLORS.tealDark],
          ['auto', '#7458C7']
        ];
        boosterIcons.forEach((entry, boosterIndex) => {
          const iconX = 428 + boosterIndex * 64;
          ctx.fillStyle = colorWithAlpha(entry[1], 0.1);
          ctx.beginPath(); ctx.arc(iconX, rowCenterY, 22, 0, Math.PI * 2); ctx.fill();
          drawFeatureGlyph(ctx, entry[0], iconX, rowCenterY, 25, entry[1]);
        });
      } else if (step[5]) {
        [ITEM_RULES.sealed, ITEM_RULES.time_bonus, ITEM_RULES.sweep, ITEM_RULES.shield, ITEM_RULES.wildcard, ITEM_RULES.bomb]
          .forEach((rule, ruleIndex) => drawCompactRuleBadge(ctx, 382 + ruleIndex * 46, rowCenterY - 17, rule));
      } else {
        drawCenteredText(ctx, step[2], 626, rowCenterY, 18, CONFIG.COLORS.mutedInk, 'right', 750, 250);
      }
    });

    drawButton(ctx, 155, y + h - 98, 440, 72, '明白了', '', 'ok', CONFIG.COLORS.teal, CONFIG.COLORS.tealDark);
    this.addRegion('close_help', 155, y + h - 98, 440, 72);
  }

  drawEffects(ctx) {
    this.effects.forEach((effect) => {
      const alpha = clamp(effect.life / Math.min(350, effect.maxLife), 0, 1);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = effect.color;
      if (effect.type === 'confetti') {
        ctx.translate(effect.x, effect.y);
        ctx.rotate(effect.rotation);
        fillRoundRect(ctx, -effect.size / 2, -effect.size * 0.32, effect.size, effect.size * 0.64, 2);
      } else {
        ctx.beginPath();
        ctx.arc(effect.x, effect.y, effect.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    });

    this.floatingTexts.forEach((entry) => {
      const t = 1 - entry.life / entry.maxLife;
      ctx.save();
      ctx.globalAlpha = 1 - t;
      const scale = 0.8 + easeOutBack(Math.min(1, t * 3)) * 0.2;
      ctx.translate(entry.x, entry.y);
      ctx.scale(scale, scale);
      drawOutlinedText(ctx, entry.text, 0, 0, 30, '#FFFFFF', entry.color, 6);
      ctx.restore();
    });
  }

  drawToast(ctx, view) {
    if (!this.toast) return;
    const t = 1 - this.toast.life / this.toast.maxLife;
    const alpha = Math.min(1, this.toast.life / 250, t / 0.12);
    ctx.save();
    ctx.globalAlpha = alpha;
    const toastSize = getReadableTextSize(22);
    ctx.font = `${normalizeFontWeight(750)} ${toastSize}px ${FONT}`;
    const measuredWidth = ctx.measureText(String(this.toast.text || '')).width;
    const width = clamp(measuredWidth + 64, 220, 640);
    const x = (this.width - width) / 2;
    // 游戏内提示放进货架上方的留白，避免遮挡关卡倒计时、进度和金币。
    // 首页、藏馆等页面仍靠近顶部显示，让反馈与刚刚点击的入口保持接近。
    const y = view && view.screen === 'game'
      ? this.safeTop + 286
      : (view && view.screen === 'home' ? this.height - this.safeBottom - 174 : this.safeTop + 118);
    ctx.fillStyle = 'rgba(40,31,54,0.88)';
    fillRoundRect(ctx, x, y, width, 64, 25);
    drawText(ctx, this.toast.text, this.width / 2, y + 41, 22, '#FFFFFF', 'center', 750, width - 44);
    ctx.restore();
  }
}

function drawTutorialStepNode(ctx, x, y, icon, label, color) {
  drawIntroFlowNode(ctx, x, y, 104, icon, color);
  drawPill(ctx, x - 58, y + 66, 116, 40, label, colorWithAlpha(color, 0.08), color, 18);
}

function drawCompactRuleBadge(ctx, x, y, rule) {
  ctx.fillStyle = rule.fill;
  fillRoundRect(ctx, x, y, 40, 34, 17);
  ctx.strokeStyle = colorWithAlpha(rule.color, 0.45);
  ctx.lineWidth = 2;
  strokeRoundRect(ctx, x, y, 40, 34, 17);
  drawCenteredText(ctx, rule.badge, x + 20, y + 17, 15, rule.color, 'center', 900, 24, 22);
}

function drawTutorialRuleRow(ctx, x, y, width, height, icon, label, color) {
  drawCard(ctx, x, y, width, height, 26, colorWithAlpha(color, 0.06), colorWithAlpha(color, 0.16), 4);
  ctx.fillStyle = colorWithAlpha(color, 0.12);
  ctx.beginPath(); ctx.arc(x + 52, y + height / 2, 29, 0, Math.PI * 2); ctx.fill();
  drawFeatureGlyph(ctx, icon, x + 52, y + height / 2, 31, color);
  drawCenteredText(ctx, label, x + 102, y + height / 2, 23, CONFIG.COLORS.ink, 'left', 850, width - 130);
}

function drawTutorialRuleTile(ctx, x, y, width, height, icon, label, color) {
  drawCard(ctx, x, y, width, height, 28, colorWithAlpha(color, 0.06), colorWithAlpha(color, 0.16), 4);
  ctx.fillStyle = colorWithAlpha(color, 0.12);
  ctx.beginPath(); ctx.arc(x + 58, y + height / 2, 31, 0, Math.PI * 2); ctx.fill();
  drawFeatureGlyph(ctx, icon, x + 58, y + height / 2, 34, color);
  drawCenteredText(ctx, label, x + 105, y + height / 2, 22, CONFIG.COLORS.ink, 'left', 850, width - 132);
}

function drawDiscoveryChip(ctx, x, y, width, height, icon, value, color) {
  ctx.fillStyle = colorWithAlpha(color, 0.09);
  fillRoundRect(ctx, x, y, width, height, height / 2);
  drawFeatureGlyph(ctx, icon, x + 31, y + height / 2, 25, color);
  drawCenteredText(ctx, value, x + width - 26, y + height / 2, 20, color, 'right', 950, width - 70);
}

function drawResultMetric(ctx, x, y, width, height, icon, value, color) {
  ctx.fillStyle = 'rgba(255,255,255,0.62)';
  fillRoundRect(ctx, x, y, width, height, 20);
  drawFeatureGlyph(ctx, icon, x + 32, y + height / 2, 27, color);
  drawCenteredText(ctx, value, x + width - 28, y + height / 2, 21, color, 'right', 950, width - 78);
}

function drawResultCoinMetric(ctx, x, y, width, height, label, value, color) {
  ctx.fillStyle = 'rgba(255,255,255,0.72)';
  fillRoundRect(ctx, x, y, width, height, 22);
  drawCenteredText(ctx, label, x + width / 2, y + 27, 16, CONFIG.COLORS.mutedInk, 'center', 800, width - 24);
  drawCoin(ctx, x + 42, y + 72, 11);
  drawCenteredText(ctx, `+${Math.max(0, Math.floor(Number(value) || 0))}`, x + width - 22, y + 72, 25, color, 'right', 950, width - 72);
}

function drawChoicePaymentCard(ctx, x, y, width, height, icon, title, description, color, enabled) {
  ctx.save();
  ctx.globalAlpha = enabled ? 1 : 0.52;
  drawCard(ctx, x, y, width, height, 28, enabled ? colorWithAlpha(color, 0.08) : '#F1EEF2', colorWithAlpha(color, enabled ? 0.28 : 0.1), enabled ? 8 : 3);
  const compact = height < 170;
  drawIntroFlowNode(ctx, x + width / 2, y + 36, 54, icon, color);
  drawCenteredText(ctx, title, x + width / 2, y + 82, 22, CONFIG.COLORS.ink, 'center', 900, width - 28);
  drawWrappedText(
    ctx,
    enabled ? description : (icon === 'video' ? '视频暂不可用' : '当前金币不足'),
    x + width / 2,
    y + (compact ? 130 : 136),
    16,
    CONFIG.COLORS.mutedInk,
    'center',
    750,
    width - 30,
    28,
    compact ? 1 : 2
  );
  ctx.restore();
}

function drawDecorationCard(ctx, x, y, width, height, style, label, color, pale, options) {
  const opts = options || {};
  const unlocked = opts.unlocked !== false;
  ctx.save();
  ctx.globalAlpha = unlocked ? 1 : 0.48;
  drawCard(ctx, x, y, width, height, 32, unlocked ? pale : '#F1EEF2', colorWithAlpha(color, unlocked ? 0.34 : 0.12), opts.active ? 14 : 9);
  ctx.fillStyle = colorWithAlpha(color, 0.18);
  fillRoundRect(ctx, x + 28, y + 38, width - 56, 176, 26);
  ctx.fillStyle = style === 'fresh' ? '#71C9B7' : '#B77551';
  fillRoundRect(ctx, x + 48, y + 80, width - 96, 22, 10);
  fillRoundRect(ctx, x + 48, y + 145, width - 96, 22, 10);
  for (let index = 0; index < 3; index += 1) {
    ctx.fillStyle = index % 2 ? CONFIG.COLORS.gold : color;
    ctx.beginPath();
    ctx.arc(x + 78 + index * 58, y + 128, 17, 0, Math.PI * 2);
    ctx.fill();
  }
  drawCenteredText(ctx, label, x + width / 2, y + 250, 24, CONFIG.COLORS.ink, 'center', 900, width - 30);
  const actionText = opts.active ? '当前使用' : (unlocked ? (opts.actionText || '点击应用') : '尚未解锁');
  drawPill(ctx, x + 48, y + 282, width - 96, 38, actionText, colorWithAlpha(color, 0.12), color, 17);
  if (opts.active) drawFeatureGlyph(ctx, 'check', x + width - 28, y + 29, 24, color);
  else if (!unlocked) drawLockIcon(ctx, x + width - 28, y + 29, 24, CONFIG.COLORS.mutedInk);
  ctx.restore();
}

function drawReviveSources(ctx, centerX, centerY) {
  ['ticket', 'video', 'coin'].forEach((icon, index) => {
    const x = centerX + (index - 1) * 56;
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.beginPath(); ctx.arc(x, centerY, 19, 0, Math.PI * 2); ctx.fill();
    drawFeatureGlyph(ctx, icon, x, centerY, 22, '#FFFFFF');
  });
}

function drawReviveButton(ctx, x, y, width, height) {
  ctx.save();
  ctx.shadowColor = 'rgba(61,49,82,0.24)';
  ctx.shadowBlur = 16;
  ctx.shadowOffsetY = 9;
  const gradient = ctx.createLinearGradient(x, y, x, y + height);
  gradient.addColorStop(0, CONFIG.COLORS.coral);
  gradient.addColorStop(1, CONFIG.COLORS.coralDark);
  ctx.fillStyle = gradient;
  fillRoundRect(ctx, x, y, width, height, 31);
  ctx.shadowColor = 'transparent';
  ctx.fillStyle = 'rgba(255,255,255,0.23)';
  fillRoundRect(ctx, x + 12, y + 9, width - 24, height * 0.31, 18);

  drawFeatureGlyph(ctx, 'shield', x + 52, y + height / 2, 31, '#FFFFFF');
  drawCenteredText(ctx, '复活', x + 126, y + height / 2, 27, '#FFFFFF', 'center', 900, 86);
  drawReviveSources(ctx, x + width - 126, y + height / 2);
  ctx.restore();
}

function drawProfileBadge(ctx, x, y, size, theme) {
  ctx.save();
  ctx.shadowColor = colorWithAlpha(theme.color, 0.22);
  ctx.shadowBlur = 14;
  ctx.fillStyle = theme.paleColor;
  ctx.beginPath(); ctx.arc(x, y, size / 2, 0, Math.PI * 2); ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.fillStyle = '#D8874E';
  fillRoundRect(ctx, x - size * 0.28, y - size * 0.05, size * 0.56, size * 0.39, size * 0.09);
  ctx.fillStyle = '#F6BC72';
  ctx.beginPath();
  ctx.moveTo(x - size * 0.27, y - size * 0.03);
  ctx.lineTo(x - size * 0.05, y - size * 0.25);
  ctx.lineTo(x, y - size * 0.02);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x + size * 0.27, y - size * 0.03);
  ctx.lineTo(x + size * 0.05, y - size * 0.25);
  ctx.lineTo(x, y - size * 0.02);
  ctx.closePath();
  ctx.fill();
  drawText(ctx, '✓', x, y + size * 0.24, 22, '#FFF8E8', 'center', 950);
  ctx.restore();
}

function drawHomeMetric(ctx, x, y, width, height, icon, value, color) {
  ctx.fillStyle = colorWithAlpha(color, 0.08);
  fillRoundRect(ctx, x, y, width, height, 18);
  ctx.fillStyle = colorWithAlpha(color, 0.12);
  ctx.beginPath(); ctx.arc(x + 34, y + height / 2, 23, 0, Math.PI * 2); ctx.fill();
  drawFeatureGlyph(ctx, icon, x + 34, y + height / 2, 26, color);
  drawCenteredText(ctx, value, x + width - 32, y + height / 2, 20, color, 'right', 950, width - 92);
}

function drawBaseUpgradeStrip(ctx, x, y, width, shopStage, totalStars) {
  const completed = Math.max(0, Math.min(10, Math.floor(shopStage || 0)));
  const progress = completed >= 10 ? 1 : (Math.max(0, totalStars || 0) % CONFIG.SHOP_NODE_STARS) / CONFIG.SHOP_NODE_STARS;
  drawFeatureGlyph(ctx, 'store', x + 22, y + 12, 27, CONFIG.COLORS.tealDark);
  drawProgressBar(ctx, x + 49, y + 6, width - 144, 12, progress, CONFIG.COLORS.teal);
  for (let index = 0; index < 10; index += 1) {
    ctx.fillStyle = index < completed ? CONFIG.COLORS.tealDark : 'rgba(61,49,82,0.13)';
    ctx.beginPath(); ctx.arc(x + 55 + index * ((width - 162) / 9), y + 28, 4, 0, Math.PI * 2); ctx.fill();
  }
  const remaining = completed >= 10 ? '✓' : `★${CONFIG.SHOP_NODE_STARS - (Math.max(0, totalStars || 0) % CONFIG.SHOP_NODE_STARS)}`;
  drawPill(ctx, x + width - 82, y - 2, 82, 36, remaining, 'rgba(255,247,217,0.9)', CONFIG.COLORS.goldDark, 16);
}

function drawHomeFeatureTile(ctx, x, y, width, height, type, title, subtitle, color) {
  drawCard(ctx, x, y, width, height, 27, 'rgba(255,255,255,0.8)', colorWithAlpha(color, 0.3), 9);
  ctx.fillStyle = colorWithAlpha(color, 0.12);
  ctx.beginPath(); ctx.arc(x + 52, y + height / 2, 32, 0, Math.PI * 2); ctx.fill();
  drawFeatureGlyph(ctx, type, x + 52, y + height / 2, 35, color);
  drawCenteredText(ctx, title, x + 102, y + (subtitle ? height * 0.34 : height / 2), 23, CONFIG.COLORS.ink, 'left', 900, width - 124);
  if (subtitle) {
    const chipWidth = Math.min(width - 124, Math.max(82, subtitle.length * 25 + 28));
    ctx.fillStyle = colorWithAlpha(color, 0.09);
    const chipY = y + height * 0.55;
    fillRoundRect(ctx, x + 102, chipY, chipWidth, 32, 16);
    drawCenteredText(ctx, subtitle, x + 102 + chipWidth / 2, chipY + 16, 16, color, 'center', 850, chipWidth - 16, 20);
  }
}

function drawNewBadge(ctx, x, y) {
  ctx.save();
  ctx.fillStyle = CONFIG.COLORS.danger;
  fillRoundRect(ctx, x - 19, y, 38, 32, 16);
  drawCenteredText(ctx, '新', x, y + 16, 15, '#FFFFFF', 'center', 900, 24, 20);
  ctx.restore();
}

function drawMysteryMilestone(ctx, x, y, width, height, levelsLeft) {
  drawCard(ctx, x, y, width, height, 26, 'rgba(255,255,255,0.64)', 'rgba(146,119,229,0.2)', 5);
  drawIntroFlowNode(ctx, x + 52, y + height / 2, 60, 'sparkle', '#9277E5');
  drawCenteredText(ctx, '下一惊喜', x + 100, y + height / 2, 22, CONFIG.COLORS.ink, 'left', 900);
  const start = x + 300;
  for (let index = 0; index < 4; index += 1) {
    ctx.fillStyle = index >= levelsLeft ? '#9277E5' : 'rgba(61,49,82,0.14)';
    ctx.beginPath(); ctx.arc(start + index * 48, y + height / 2, 9, 0, Math.PI * 2); ctx.fill();
    if (index < 3) {
      ctx.fillStyle = 'rgba(61,49,82,0.1)';
      fillRoundRect(ctx, start + index * 48 + 12, y + height / 2 - 2, 24, 4, 2);
    }
  }
  drawPill(ctx, x + width - 102, y + height / 2 - 19, 70, 38, `+${levelsLeft}`, 'rgba(146,119,229,0.1)', '#7458C7', 16);
}

function drawStreakChest(ctx, x, y, width, height, winStreak) {
  const progress = Math.max(0, Math.floor(winStreak || 0)) % 3;
  drawCard(ctx, x, y, width, height, 25, 'rgba(255,249,229,0.74)', 'rgba(219,157,45,0.22)', 5);
  drawFeatureGlyph(ctx, 'store', x + 48, y + height / 2, 40, CONFIG.COLORS.goldDark);
  drawCenteredText(ctx, '连胜宝箱', x + 90, y + height / 2, 21, CONFIG.COLORS.ink, 'left', 900);
  const dotsX = x + 310;
  for (let index = 0; index < 3; index += 1) {
    ctx.fillStyle = index < progress ? CONFIG.COLORS.goldDark : 'rgba(61,49,82,0.14)';
    ctx.beginPath(); ctx.arc(dotsX + index * 42, y + height / 2, 10, 0, Math.PI * 2); ctx.fill();
  }
  drawCoin(ctx, x + width - 72, y + height / 2 - 2, 13);
  drawCenteredText(ctx, '+50', x + width - 22, y + height / 2, 19, CONFIG.COLORS.goldDark, 'right', 900);
}

function drawBaseDecorationBackdrop(ctx, width, safeTop, decorations, fresh, home) {
  const shelfColor = fresh ? '#52B8A7' : '#A96947';
  const accent = fresh ? '#32A892' : '#E58C5B';
  const shelfY = safeTop + (home ? 112 : 88);
  ctx.save();
  ctx.globalAlpha = home ? 0.82 : 0.5;
  ctx.shadowColor = colorWithAlpha(shelfColor, 0.22);
  ctx.shadowBlur = home ? 12 : 7;
  ctx.fillStyle = shelfColor;
  fillRoundRect(ctx, 28, shelfY - 8, width - 56, 16, 8);
  ctx.shadowColor = 'transparent';
  ctx.fillStyle = colorWithAlpha('#FFFFFF', 0.3);
  fillRoundRect(ctx, 36, shelfY - 6, width - 72, 4, 2);
  if (home) {
    ctx.fillStyle = shelfColor;
    fillRoundRect(ctx, 42, shelfY + 4, 12, 54, 6);
    fillRoundRect(ctx, width - 54, shelfY + 4, 12, 54, 6);
  }
  decorations.slice(0, 10).forEach((entry, index) => {
    const pointX = 52 + index * ((width - 104) / 9);
    const drop = index % 2 ? 18 : 28;
    ctx.strokeStyle = colorWithAlpha(shelfColor, 0.76);
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(pointX, shelfY + 5);
    ctx.lineTo(pointX, shelfY + drop);
    ctx.stroke();
    if (fresh) {
      ctx.fillStyle = index % 3 === 0 ? CONFIG.COLORS.gold : accent;
      ctx.beginPath();
      ctx.ellipse(pointX - 5, shelfY + drop + 3, 9 + index * 0.3, 5, -0.55, 0, Math.PI * 2);
      ctx.ellipse(pointX + 5, shelfY + drop + 3, 9 + index * 0.3, 5, 0.55, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = index % 3 === 0 ? CONFIG.COLORS.gold : accent;
      ctx.shadowColor = colorWithAlpha(ctx.fillStyle, 0.34);
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(pointX, shelfY + drop + 4, 8 + Math.min(3, index * 0.35), 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowColor = 'transparent';
    }
  });
  ctx.restore();
}

function drawBaseDecorHomeTile(ctx, x, y, width, height, saveData) {
  const decorations = Array.isArray(saveData && saveData.warehouseDecorations)
    ? saveData.warehouseDecorations
    : [];
  const fresh = saveData && saveData.warehouseStyle === 'fresh';
  const color = fresh ? '#278F82' : '#C66F42';
  const pale = fresh ? 'rgba(231,250,246,0.84)' : 'rgba(255,240,210,0.84)';
  drawCard(ctx, x, y, width, height, 24, pale, colorWithAlpha(color, 0.2), 5);
  ctx.fillStyle = colorWithAlpha(color, 0.12);
  fillRoundRect(ctx, x + 18, y + 12, 60, height - 24, 18);
  ctx.fillStyle = color;
  fillRoundRect(ctx, x + 28, y + 27, 40, 6, 3);
  fillRoundRect(ctx, x + 28, y + 47, 40, 6, 3);
  [0, 1, 2].forEach((index) => {
    ctx.fillStyle = index === 1 ? CONFIG.COLORS.gold : color;
    ctx.beginPath();
    ctx.arc(x + 35 + index * 13, y + 40, 5, 0, Math.PI * 2);
    ctx.fill();
  });
  drawCenteredText(ctx, '我的装箱基地', x + 96, y + 25, 20, CONFIG.COLORS.ink, 'left', 900, 280, 24);
  const styleName = fresh ? '清新薄荷架' : '暖光木架';
  drawCenteredText(ctx, `${decorations.length}/10 · 当前 ${styleName}`, x + 96, y + 55, 17, CONFIG.COLORS.mutedInk, 'left', 800, 300, 23);
  drawPill(ctx, x + width - 116, y + 19, 92, 40, '查看', colorWithAlpha(color, 0.1), color, 17);
}

function drawNearestGoal(ctx, x, y, width, height, saveData) {
  const currentDay = dayKey();
  const progress = saveData.dailyTaskDate === currentDay ? (saveData.dailyTaskProgress || {}) : {};
  const completed = saveData.dailyTaskDate === currentDay ? (saveData.dailyTaskCompleted || {}) : {};
  const tasks = [
    { id: 'play', target: 3, label: '今日完成 3 局', icon: 'route' },
    { id: 'win', target: 2, label: '今日通关 2 次', icon: 'box' },
    { id: 'combo', target: 10, label: '今日达成 10 连击', icon: 'combo' }
  ];
  const task = tasks.find((entry) => !completed[entry.id]);
  const color = task ? '#7458C7' : CONFIG.COLORS.goldDark;
  drawCard(ctx, x, y, width, height, 24, 'rgba(255,255,255,0.78)', colorWithAlpha(color, 0.18), 5);
  drawFeatureGlyph(ctx, task ? task.icon : 'store', x + 47, y + height / 2, 31, color);
  if (task) {
    const value = Math.min(task.target, Math.max(0, Math.floor(Number(progress[task.id]) || 0)));
    drawCenteredText(ctx, '最近目标', x + 86, y + 22, 16, CONFIG.COLORS.mutedInk, 'left', 800, 120);
    drawCenteredText(ctx, task.label, x + 86, y + 51, 21, CONFIG.COLORS.ink, 'left', 900, 300);
    drawPill(ctx, x + width - 132, y + 19, 108, 40, `${value}/${task.target}`, colorWithAlpha(color, 0.1), color, 18);
  } else {
    const truckProgress = Math.min(2, Math.max(0, Math.floor(Number(saveData.truckProgress) || 0)));
    drawCenteredText(ctx, '今日任务完成', x + 86, y + 24, 17, CONFIG.COLORS.mutedInk, 'left', 800, 210);
    drawCenteredText(ctx, `再首通 ${3 - truckProgress} 关装满货车`, x + 86, y + 54, 21, CONFIG.COLORS.ink, 'left', 900, 330);
    drawPill(ctx, x + width - 132, y + 19, 108, 40, `${truckProgress}/3`, '#FFF5D8', CONFIG.COLORS.goldDark, 18);
  }
}

function drawRankTab(ctx, x, y, width, height, label, value, active, color) {
  drawCard(ctx, x, y, width, height, 24, active ? colorWithAlpha(color, 0.14) : 'rgba(255,255,255,0.68)', active ? color : 'rgba(61,49,82,0.1)', active ? 10 : 5);
  ctx.fillStyle = colorWithAlpha(color, active ? 0.18 : 0.1);
  ctx.beginPath(); ctx.arc(x + 52, y + height / 2, 26, 0, Math.PI * 2); ctx.fill();
  const score = label !== '藏品数';
  drawFeatureGlyph(ctx, score ? 'score' : 'museum', x + 52, y + height / 2, 29, color);
  drawCenteredText(ctx, score ? '总成绩' : '藏品', x + 100, y + 25, 18, active ? color : CONFIG.COLORS.mutedInk, 'left', 850, width - 142, 22);
  drawCenteredText(ctx, value, x + width - 30, y + 62, 27, active ? color : CONFIG.COLORS.ink, 'right', 950, width - 142, 28);
}

function drawStoreFlow(ctx, y) {
  drawIntroFlowNode(ctx, 144, y + 54, 78, 'collectible', '#9277E5');
  drawFlowArrow(ctx, 190, y + 54, 112, '#A39BA9');
  drawIntroFlowNode(ctx, 375, y + 54, 78, 'coin', CONFIG.COLORS.goldDark);
  drawFlowArrow(ctx, 421, y + 54, 112, '#A39BA9');
  drawIntroFlowNode(ctx, 606, y + 54, 78, 'shield', CONFIG.COLORS.coral);
}

function drawStoreSummaryMetric(ctx, x, y, width, height, icon, value, label, color) {
  ctx.fillStyle = colorWithAlpha(color, 0.08);
  fillRoundRect(ctx, x, y, width, height, 22);
  ctx.fillStyle = colorWithAlpha(color, 0.12);
  ctx.beginPath(); ctx.arc(x + 33, y + height / 2, 23, 0, Math.PI * 2); ctx.fill();
  drawFeatureGlyph(ctx, icon, x + 33, y + height / 2, 25, color);
  drawCenteredText(ctx, label, x + 68, y + 20, 16, CONFIG.COLORS.mutedInk, 'left', 800, width - 82, 22);
  drawCenteredText(ctx, value, x + width - 18, y + 54, 23, color, 'right', 950, width - 86, 28);
}

function drawStoreAdCard(ctx, x, y, width, height, status, rewardAvailable) {
  const current = status || {
    viewed: 0,
    remaining: AD_COIN_DAILY_LIMIT,
    limit: AD_COIN_DAILY_LIMIT,
    reward: AD_COIN_REWARD
  };
  const completed = current.remaining <= 0;
  const color = completed ? CONFIG.COLORS.mutedInk : '#8063D8';
  drawCard(ctx, x, y, width, height, 25, completed ? 'rgba(242,239,243,0.84)' : 'rgba(246,241,255,0.88)', colorWithAlpha(color, 0.2), 5);
  ctx.fillStyle = colorWithAlpha(color, 0.12);
  ctx.beginPath(); ctx.arc(x + 45, y + height / 2, 27, 0, Math.PI * 2); ctx.fill();
  drawFeatureGlyph(ctx, 'video', x + 45, y + height / 2, 28, color);
  drawCenteredText(ctx, '看视频得金币', x + 86, y + height / 2, 22, CONFIG.COLORS.ink, 'left', 900, 218);
  drawPill(ctx, x + 320, y + 18, 108, 40, `+${current.reward || AD_COIN_REWARD}`, 'rgba(248,199,92,0.18)', CONFIG.COLORS.goldDark, 18);
  const stateText = completed ? '今日已领完' : (rewardAvailable ? `${current.viewed}/${current.limit}` : '待开通');
  drawPill(ctx, x + width - 156, y + 18, 132, 40, stateText, colorWithAlpha(color, 0.08), color, 16);
}

function drawStoreCollectibleCard(ctx, item, image, x, y, width, height) {
  const collectible = item.collectible;
  drawCard(ctx, x, y, width, height, 24, 'rgba(255,255,255,0.9)', colorWithAlpha(collectible.color, 0.22), 5);
  drawCollectibleVisual(ctx, collectible, image, x + width / 2, y + height * 0.27, Math.min(72, height * 0.4));
  drawCenteredText(ctx, collectible.name, x + width / 2, y + height * 0.59, 19, CONFIG.COLORS.ink, 'center', 900, width - 38);
  const chipHeight = 34;
  const chipY = y + height - chipHeight - 8;
  drawPill(ctx, x + 18, chipY, 70, chipHeight, `×${item.owned}`, colorWithAlpha(collectible.color, 0.08), collectible.color, 15);
  ctx.fillStyle = colorWithAlpha(CONFIG.COLORS.gold, 0.2);
  fillRoundRect(ctx, x + width - 88, chipY, 70, chipHeight, 17);
  drawCoin(ctx, x + width - 70, chipY + chipHeight / 2 - 1, 8);
  drawCenteredText(ctx, `+${item.unitValue}`, x + width - 27, chipY + chipHeight / 2, 16, CONFIG.COLORS.goldDark, 'right', 900, 36, 22);
}

function drawStoreProductCard(ctx, product, x, y, width, height, coins) {
  const affordable = product.maxed || coins >= (product.cost || 0);
  ctx.save();
  ctx.globalAlpha = product.maxed ? 0.62 : 1;
  drawCard(ctx, x, y, width, height, 25, 'rgba(255,255,255,0.84)', colorWithAlpha(product.color, 0.2), 6);
  ctx.fillStyle = colorWithAlpha(product.color, 0.12);
  ctx.beginPath(); ctx.arc(x + 52, y + height / 2, 34, 0, Math.PI * 2); ctx.fill();
  drawFeatureGlyph(ctx, product.icon, x + 52, y + height / 2, 37, product.color);
  drawCenteredText(ctx, product.label, x + 112, y + height * 0.25, 22, CONFIG.COLORS.ink, 'left', 900, width - 142);
  drawPill(ctx, x + 112, y + height * 0.45, 72, 32, product.owned, colorWithAlpha(product.color, 0.08), product.color, 16);
  const chipWidth = 100;
  ctx.fillStyle = product.maxed ? 'rgba(61,49,82,0.08)' : colorWithAlpha(CONFIG.COLORS.gold, affordable ? 0.23 : 0.1);
  fillRoundRect(ctx, x + width - chipWidth - 20, y + height - 50, chipWidth, 34, 17);
  if (product.maxed) {
    drawCenteredText(ctx, '已满', x + width - chipWidth / 2 - 20, y + height - 33, 17, CONFIG.COLORS.mutedInk, 'center', 850, chipWidth - 20, 22);
  } else {
    drawCoin(ctx, x + width - chipWidth, y + height - 34, 8);
    drawCenteredText(ctx, String(product.cost), x + width - 34, y + height - 33, 18, affordable ? CONFIG.COLORS.goldDark : CONFIG.COLORS.mutedInk, 'right', 900, chipWidth - 34, 22);
  }
  ctx.restore();
}

function drawModeCompareCard(ctx, x, y, width, height, icon, title, line1, line2, color) {
  drawCard(ctx, x, y, width, height, 30, colorWithAlpha(color, 0.08), colorWithAlpha(color, 0.22), 6);
  drawIntroFlowNode(ctx, x + width / 2, y + 60, 82, icon, color);
  drawText(ctx, title, x + width / 2, y + 126, 27, CONFIG.COLORS.ink, 'center', 900);
  drawPill(ctx, x + 34, y + 146, width - 68, 38, line1, colorWithAlpha(color, 0.08), color, 17);
  if (line2) drawPill(ctx, x + 34, y + 192, width - 68, 38, line2, colorWithAlpha(color, 0.08), color, 17);
}

function drawIntroFlowNode(ctx, x, y, size, type, color) {
  ctx.save();
  ctx.shadowColor = colorWithAlpha(color, 0.25);
  ctx.shadowBlur = 14;
  ctx.fillStyle = colorWithAlpha(color, 0.12);
  ctx.beginPath(); ctx.arc(x, y, size / 2, 0, Math.PI * 2); ctx.fill();
  ctx.shadowColor = 'transparent';
  drawFeatureGlyph(ctx, type, x, y, size * 0.52, color);
  ctx.restore();
}

function drawFlowArrow(ctx, x, y, width, color) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + width - 16, y); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x + width - 2, y);
  ctx.lineTo(x + width - 20, y - 12);
  ctx.lineTo(x + width - 20, y + 12);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawReviveOptionCard(ctx, x, y, width, height, icon, label, value, color, enabled) {
  ctx.save();
  ctx.globalAlpha = enabled ? 1 : 0.48;
  drawCard(ctx, x, y, width, height, 30, enabled ? colorWithAlpha(color, 0.08) : 'rgba(238,235,240,0.82)', colorWithAlpha(color, enabled ? 0.28 : 0.08), enabled ? 8 : 3);
  drawIntroFlowNode(ctx, x + width / 2, y + 88, 108, icon, color);
  drawText(ctx, label, x + width / 2, y + 176, 25, CONFIG.COLORS.ink, 'center', 900);
  drawPill(ctx, x + 25, y + 202, width - 50, 50, value, colorWithAlpha(color, 0.12), color, 20);
  if (!enabled) drawLockIcon(ctx, x + width - 28, y + 29, 25, CONFIG.COLORS.mutedInk);
  ctx.restore();
}

function drawFeatureGlyph(ctx, type, x, y, size, color) {
  const radius = size / 2;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = Math.max(3, size * 0.1);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (type === 'score') {
    drawStarOutline(ctx, x, y, radius * 0.72);
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(x, y, radius * 0.17, 0, Math.PI * 2); ctx.fill();
  } else if (type === 'combo') {
    ctx.beginPath();
    ctx.moveTo(x, y + radius * 0.78);
    ctx.bezierCurveTo(x - radius * 0.78, y + radius * 0.32, x - radius * 0.54, y - radius * 0.25, x - radius * 0.06, y - radius * 0.75);
    ctx.bezierCurveTo(x + radius * 0.02, y - radius * 0.24, x + radius * 0.56, y - radius * 0.18, x + radius * 0.5, y - radius * 0.68);
    ctx.bezierCurveTo(x + radius * 0.98, y - radius * 0.05, x + radius * 0.65, y + radius * 0.58, x, y + radius * 0.78);
    ctx.closePath();
    ctx.fill();
  } else if (type === 'precision') {
    ctx.beginPath(); ctx.arc(x, y, radius * 0.62, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(x, y, radius * 0.18, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x - radius, y); ctx.lineTo(x - radius * 0.55, y);
    ctx.moveTo(x + radius * 0.55, y); ctx.lineTo(x + radius, y);
    ctx.moveTo(x, y - radius); ctx.lineTo(x, y - radius * 0.55);
    ctx.moveTo(x, y + radius * 0.55); ctx.lineTo(x, y + radius);
    ctx.stroke();
  } else if (type === 'tap') {
    ctx.beginPath(); ctx.arc(x, y - radius * 0.28, radius * 0.28, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y - radius * 0.02);
    ctx.lineTo(x, y + radius * 0.72);
    ctx.moveTo(x, y + radius * 0.24);
    ctx.quadraticCurveTo(x + radius * 0.65, y + radius * 0.04, x + radius * 0.68, y + radius * 0.66);
    ctx.stroke();
  } else if (type === 'lock') {
    drawLockIcon(ctx, x, y - radius * 0.08, radius * 1.35, color);
  } else if (type === 'clock') {
    drawClockIcon(ctx, x, y, radius * 0.72, color);
  } else if (type === 'pause') {
    drawControlGlyph(ctx, 'pause', x, y, size * 0.76, color, true);
  } else if (type === 'shelf') {
    ctx.strokeRect(x - radius * 0.82, y - radius * 0.52, radius * 1.64, radius * 1.04);
    ctx.beginPath(); ctx.moveTo(x - radius * 0.82, y); ctx.lineTo(x + radius * 0.82, y); ctx.stroke();
    [-0.48, 0.48].forEach((offset) => {
      ctx.beginPath(); ctx.arc(x + radius * offset, y - radius * 0.25, radius * 0.13, 0, Math.PI * 2); ctx.fill();
    });
  } else if (type === 'order' || type === 'box') {
    ctx.fillStyle = colorWithAlpha(color, 0.12);
    fillRoundRect(ctx, x - radius * 0.78, y - radius * 0.56, radius * 1.56, radius * 1.18, radius * 0.16);
    ctx.strokeStyle = color;
    strokeRoundRect(ctx, x - radius * 0.78, y - radius * 0.56, radius * 1.56, radius * 1.18, radius * 0.16);
    ctx.beginPath(); ctx.moveTo(x - radius * 0.78, y - radius * 0.1); ctx.lineTo(x + radius * 0.78, y - radius * 0.1); ctx.stroke();
    drawCenteredText(ctx, type === 'order' ? '3' : '✓', x, y + radius * 0.16, radius * 0.8, color, 'center', 950);
  } else if (type === 'warning') {
    ctx.beginPath();
    ctx.moveTo(x, y - radius * 0.86);
    ctx.lineTo(x + radius * 0.82, y + radius * 0.72);
    ctx.lineTo(x - radius * 0.82, y + radius * 0.72);
    ctx.closePath();
    ctx.stroke();
    drawCenteredText(ctx, '!', x, y + radius * 0.14, radius * 1.05, color, 'center', 950);
  } else if (type === 'coin') {
    drawCoin(ctx, x, y - 2, radius * 0.78);
  } else if (type === 'calendar' || type === 'daily') {
    ctx.fillStyle = colorWithAlpha(color, 0.12);
    fillRoundRect(ctx, x - radius * 0.82, y - radius * 0.7, radius * 1.64, radius * 1.45, radius * 0.2);
    ctx.strokeStyle = color;
    strokeRoundRect(ctx, x - radius * 0.82, y - radius * 0.7, radius * 1.64, radius * 1.45, radius * 0.2);
    ctx.beginPath(); ctx.moveTo(x - radius * 0.82, y - radius * 0.22); ctx.lineTo(x + radius * 0.82, y - radius * 0.22); ctx.stroke();
    drawCenteredText(ctx, '今', x, y + radius * 0.12, radius * 0.9, color, 'center', 900);
  } else if (type === 'route') {
    ctx.beginPath();
    ctx.moveTo(x - radius * 0.74, y + radius * 0.62);
    ctx.bezierCurveTo(x - radius * 0.2, y - radius * 0.75, x + radius * 0.1, y + radius * 0.5, x + radius * 0.68, y - radius * 0.55);
    ctx.stroke();
    ctx.beginPath(); ctx.arc(x - radius * 0.72, y + radius * 0.62, radius * 0.14, 0, Math.PI * 2); ctx.fill();
    drawStar(ctx, x + radius * 0.68, y - radius * 0.56, color, radius * 0.24);
  } else if (type === 'museum') {
    ctx.strokeRect(x - radius * 0.78, y - radius * 0.58, radius * 1.56, radius * 1.22);
    ctx.beginPath(); ctx.moveTo(x - radius * 0.78, y + radius * 0.04); ctx.lineTo(x + radius * 0.78, y + radius * 0.04); ctx.stroke();
    [-0.45, 0, 0.45].forEach((offset, index) => {
      ctx.fillStyle = [CONFIG.COLORS.coral, CONFIG.COLORS.teal, CONFIG.COLORS.goldDark][index];
      ctx.beginPath(); ctx.arc(x + radius * offset, y - radius * 0.24, radius * 0.13, 0, Math.PI * 2); ctx.fill();
    });
  } else if (type === 'store') {
    ctx.fillStyle = colorWithAlpha(color, 0.12);
    fillRoundRect(ctx, x - radius * 0.75, y - radius * 0.35, radius * 1.5, radius * 1.05, radius * 0.16);
    ctx.strokeStyle = color;
    strokeRoundRect(ctx, x - radius * 0.75, y - radius * 0.35, radius * 1.5, radius * 1.05, radius * 0.16);
    ctx.beginPath(); ctx.moveTo(x - radius * 0.82, y - radius * 0.35); ctx.lineTo(x - radius * 0.58, y - radius * 0.74); ctx.lineTo(x + radius * 0.58, y - radius * 0.74); ctx.lineTo(x + radius * 0.82, y - radius * 0.35); ctx.stroke();
  } else if (type === 'collectible' || type === 'sparkle') {
    drawStar(ctx, x, y, color, radius * 0.72);
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath(); ctx.arc(x, y, radius * 0.18, 0, Math.PI * 2); ctx.fill();
  } else if (type === 'shield') {
    ctx.beginPath();
    ctx.moveTo(x, y - radius * 0.78);
    ctx.lineTo(x + radius * 0.7, y - radius * 0.45);
    ctx.lineTo(x + radius * 0.54, y + radius * 0.38);
    ctx.quadraticCurveTo(x, y + radius * 0.86, x - radius * 0.54, y + radius * 0.38);
    ctx.lineTo(x - radius * 0.7, y - radius * 0.45);
    ctx.closePath();
    ctx.stroke();
    drawCenteredText(ctx, '+', x, y, radius * 1.08, color, 'center', 950);
  } else if (type === 'ticket') {
    ctx.fillStyle = colorWithAlpha(color, 0.12);
    fillRoundRect(ctx, x - radius * 0.78, y - radius * 0.48, radius * 1.56, radius * 0.96, radius * 0.18);
    ctx.strokeStyle = color;
    strokeRoundRect(ctx, x - radius * 0.78, y - radius * 0.48, radius * 1.56, radius * 0.96, radius * 0.18);
    drawCenteredText(ctx, '+', x, y, radius * 1.02, color, 'center', 950);
  } else if (type === 'video') {
    ctx.beginPath();
    ctx.moveTo(x - radius * 0.45, y - radius * 0.65);
    ctx.lineTo(x + radius * 0.65, y);
    ctx.lineTo(x - radius * 0.45, y + radius * 0.65);
    ctx.closePath();
    ctx.fill();
  } else if (type === 'slot') {
    ctx.strokeRect(x - radius * 0.72, y - radius * 0.52, radius * 1.44, radius * 1.04);
    ctx.beginPath(); ctx.moveTo(x, y - radius * 0.52); ctx.lineTo(x, y + radius * 0.52); ctx.stroke();
    drawCenteredText(ctx, '+', x + radius * 0.38, y, radius * 0.68, color, 'center', 950);
  } else if (type === 'rank') {
    [0.42, 0.72, 1].forEach((height, index) => {
      ctx.fillRect(x - radius * 0.7 + index * radius * 0.5, y + radius * 0.62 - radius * height, radius * 0.3, radius * height);
    });
  } else if (['hint', 'shuffle', 'time', 'auto'].indexOf(type) >= 0) {
    drawBoosterIcon(ctx, x, y, size * 0.72, type, color);
  }
  ctx.restore();
}

function drawFriendRankFallback(ctx, x, y, width, height, metric, saveData) {
  const value = metric === 'collection_count'
    ? countAllDiscoveredCollectibles(saveData.rareFruits)
    : getTotalPoints(saveData);
  const suffix = metric === 'collection_count' ? '件' : '分';
  const rowHeight = Math.min(92, Math.max(74, height / 7));
  drawCard(ctx, x + 10, y + 8, width - 20, rowHeight - 12, 21, '#FFF3D4', 'rgba(219,157,45,0.25)', 4);
  const firstCenterY = y + 8 + (rowHeight - 12) / 2;
  drawCenteredText(ctx, '1', x + 44, firstCenterY, 25, CONFIG.COLORS.goldDark, 'center', 950);
  ctx.fillStyle = '#DDF6F3';
  ctx.beginPath(); ctx.arc(x + 94, firstCenterY, 25, 0, Math.PI * 2); ctx.fill();
  drawCenteredText(ctx, '我', x + 94, firstCenterY, 22, CONFIG.COLORS.tealDark, 'center', 900);
  drawCenteredText(ctx, '我的成绩', x + 140, firstCenterY, 22, CONFIG.COLORS.ink, 'left', 850);
  drawCenteredText(ctx, `${formatPoints(value)}${suffix}`, x + width - 34, firstCenterY, 25, metric === 'collection_count' ? CONFIG.COLORS.tealDark : CONFIG.COLORS.goldDark, 'right', 950);

  for (let index = 1; index < 6; index += 1) {
    const rowY = y + index * rowHeight + 6;
    const rowCenterY = rowY + (rowHeight - 12) / 2;
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    fillRoundRect(ctx, x + 10, rowY, width - 20, rowHeight - 12, 21);
    drawCenteredText(ctx, String(index + 1), x + 44, rowCenterY, 22, '#A49CAB', 'center', 850);
    drawLockIcon(ctx, x + 94, rowCenterY, 26, '#AAA3AF');
    drawCenteredText(ctx, index === 1 ? '等待好友' : '尚未上榜', x + 140, rowCenterY, 20, '#9B94A2', 'left', 700);
  }
}

function drawTimerChip(ctx, x, y, width, height, text, color) {
  ctx.save();
  ctx.fillStyle = colorWithAlpha(color, 0.12);
  fillRoundRect(ctx, x, y, width, height, height / 2);
  ctx.strokeStyle = colorWithAlpha(color, 0.46);
  ctx.lineWidth = 2;
  strokeRoundRect(ctx, x, y, width, height, height / 2);
  drawClockIcon(ctx, x + 27, y + height / 2, 17, color);
  drawCenteredText(ctx, text, x + 49, y + height / 2, 22, color, 'left', 950, width - 70);
  ctx.restore();
}

function drawCurrencyChip(ctx, x, y, width, height, value) {
  ctx.fillStyle = 'rgba(255,255,255,0.76)';
  fillRoundRect(ctx, x, y, width, height, height / 2);
  drawCoin(ctx, x + 25, y + height / 2 - 2, 16);
  drawCenteredText(ctx, formatPoints(value), x + width - 22, y + height / 2, 20, CONFIG.COLORS.ink, 'right', 900, width - 76);
}

function drawClockIcon(ctx, x, y, radius, color) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(3, radius * 0.18);
  ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - radius * 0.57); ctx.moveTo(x, y); ctx.lineTo(x + radius * 0.46, y + radius * 0.25); ctx.stroke();
  ctx.restore();
}

function drawBoardMetric(ctx, x, y, width, height, icon, value, color) {
  ctx.fillStyle = 'rgba(255,255,255,0.66)';
  fillRoundRect(ctx, x, y, width, height, 18);
  ctx.fillStyle = colorWithAlpha(color, 0.1);
  ctx.beginPath(); ctx.arc(x + 34, y + height / 2, 22, 0, Math.PI * 2); ctx.fill();
  drawFeatureGlyph(ctx, icon, x + 34, y + height / 2, 25, color);
  drawCenteredText(ctx, value, x + width - 28, y + height / 2, 24, color, 'right', 950, width - 86);
}

function drawGuidanceBar(ctx, x, y, width, height, guidance) {
  const color = guidance.color || CONFIG.COLORS.mutedInk;
  ctx.fillStyle = colorWithAlpha(color, 0.09);
  fillRoundRect(ctx, x, y, width, height, height / 2);
  ctx.fillStyle = colorWithAlpha(color, 0.14);
  ctx.beginPath(); ctx.arc(x + 29, y + height / 2, 19, 0, Math.PI * 2); ctx.fill();
  drawFeatureGlyph(ctx, guidance.icon || 'order', x + 29, y + height / 2, 22, color);
  drawCenteredText(ctx, guidance.text, x + 59, y + height / 2, 19, color, 'left', 850, width - 80);
}

function drawStatusChip(ctx, x, y, width, height, icon, value, color) {
  ctx.fillStyle = colorWithAlpha(color, 0.09);
  fillRoundRect(ctx, x, y, width, height, height / 2);
  drawFeatureGlyph(ctx, icon, x + 27, y + height / 2, 22, color);
  drawCenteredText(ctx, value, x + width - 26, y + height / 2, 17, color, 'right', 900, width - 66);
}

function getBoardGuidance(model) {
  const activeCollectible = model.getActiveCollectibleTimer();
  if (activeCollectible) {
    return { text: '闪耀！先点彩虹光圈', icon: 'sparkle', color: '#A65AC5' };
  }
  if (model.getInteractionFrozenMs && model.getInteractionFrozenMs() > 0) {
    return { text: `冻结 ${(model.getInteractionFrozenMs() / 1000).toFixed(1)} 秒`, icon: 'clock', color: '#3E9FD6' };
  }
  if (model.remainingMs <= 10000) {
    return { text: '不足 10 秒', icon: 'clock', color: CONFIG.COLORS.danger };
  }
  const criticalRush = model.activeOrders.find((order) => (
    order.rule && order.rule.type === 'rush' && !order.rule.expired && order.rule.remainingMoves <= 3
  ));
  if (criticalRush) {
    return { text: `加急剩 ${Math.max(0, criticalRush.rule.remainingMoves)} 步`, icon: 'clock', color: CONFIG.COLORS.goldDark };
  }
  const nearlyPacked = model.activeOrders.find((order) => order.target - order.count === 1);
  if (nearlyPacked) {
    return { text: '只差 1 件，先装满', icon: 'box', color: CONFIG.COLORS.goldDark };
  }
  return null;
}

function drawBoardHeaderMotif(ctx, x, y, width, height) {
  const phase = (Date.now() % 2200) / 2200;
  ctx.save();
  ctx.globalAlpha = 0.34;
  ctx.strokeStyle = '#79CFC1';
  ctx.lineWidth = 3;
  ctx.setLineDash([12, 14]);
  ctx.lineDashOffset = -phase * 52;
  ctx.beginPath();
  ctx.moveTo(x + 6, y + height / 2);
  ctx.bezierCurveTo(x + width * 0.26, y - 2, x + width * 0.7, y + height + 2, x + width - 8, y + height / 2);
  ctx.stroke();
  [0.15, 0.5, 0.85].forEach((ratio, index) => {
    ctx.fillStyle = index === 1 ? CONFIG.COLORS.gold : CONFIG.COLORS.teal;
    ctx.beginPath();
    ctx.arc(x + width * ratio, y + height / 2 + Math.sin((phase + ratio) * Math.PI * 2) * 5, index === 1 ? 6 : 5, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.restore();
}

function drawBoardAmbience(ctx, x, y, width, height) {
  if (height <= 40) return;
  const phase = (Date.now() % 2400) / 2400;
  ctx.save();
  ctx.globalAlpha = 0.22;
  ctx.strokeStyle = '#79CFC1';
  ctx.lineWidth = 3;
  ctx.setLineDash([10, 14]);
  ctx.lineDashOffset = -phase * 48;
  ctx.beginPath();
  ctx.moveTo(x + 24, y + height * 0.24);
  ctx.bezierCurveTo(x + width * 0.28, y - 4, x + width * 0.68, y + height * 0.48, x + width - 24, y + height * 0.16);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x + 35, y + height * 0.78);
  ctx.bezierCurveTo(x + width * 0.3, y + height * 0.5, x + width * 0.72, y + height, x + width - 30, y + height * 0.7);
  ctx.stroke();
  ctx.setLineDash([]);
  for (let i = 0; i < 7; i += 1) {
    ctx.fillStyle = i % 2 ? '#9277E5' : '#46C7B7';
    ctx.beginPath();
    ctx.arc(x + ((i / 6 + phase * 0.15) % 1) * width, y + height * (0.18 + (i % 3) * 0.28), 4 + (i % 2) * 2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawFrozenBoardOverlay(ctx, x, y, width, height, remainingMs) {
  ctx.save();
  ctx.fillStyle = 'rgba(224,246,255,0.58)';
  fillRoundRect(ctx, x, y, width, height, 32);
  ctx.strokeStyle = 'rgba(62,159,214,0.48)';
  ctx.lineWidth = 3;
  strokeRoundRect(ctx, x, y, width, height, 32);
  const centerX = x + width / 2;
  const centerY = y + height / 2;
  ctx.strokeStyle = '#3E9FD6';
  ctx.lineWidth = 5;
  for (let index = 0; index < 3; index += 1) {
    const angle = index * Math.PI / 3;
    ctx.beginPath();
    ctx.moveTo(centerX - Math.cos(angle) * 35, centerY - Math.sin(angle) * 35);
    ctx.lineTo(centerX + Math.cos(angle) * 35, centerY + Math.sin(angle) * 35);
    ctx.stroke();
  }
  drawPill(ctx, centerX - 86, centerY + 54, 172, 46, `冻 ${(Math.max(0, remainingMs) / 1000).toFixed(1)}s`, '#EAF8FF', '#3E9FD6', 19);
  ctx.restore();
}

function getMovementState(layout, movement, animationMs, reducedMotion) {
  const positions = layout.positions.map((position) => Object.assign({}, position));
  if (!movement) return { positions, inputBlocked: false, warning: false };
  const motionScale = reducedMotion ? 0.7 : 1;
  // 只缩放时间轴一次。若同时放慢 time 又放大 period，0.7 会被重复应用成
  // 0.49，与“速度降低 30%”的设置文案不一致。
  const time = Math.max(0, Number(animationMs) || 0) * motionScale;
  const amplitude = Math.max(0, Number(movement.amplitude) || 18) * motionScale;
  const period = Math.max(1200, Number(movement.periodMs) || 4200);
  let inputBlocked = false;
  let warning = false;

  if (movement.type === 'horizontal') {
    layout.rows.forEach((row, rowIndex) => {
      const direction = rowIndex % 2 ? -1 : 1;
      const offset = Math.sin(time / period * Math.PI * 2) * amplitude * direction;
      positions.forEach((position) => { if (position.rowIndex === rowIndex) position.x += offset; });
    });
  } else if (movement.type === 'bob') {
    positions.forEach((position, index) => {
      position.y += Math.sin(time / period * Math.PI * 2 + index * 0.82) * amplitude;
    });
  } else if (movement.type === 'carousel') {
    layout.rows.forEach((row, rowIndex) => {
      const phase = time / period * Math.PI * 2 + rowIndex * Math.PI;
      const offsetX = Math.cos(phase) * amplitude;
      const offsetY = Math.sin(phase) * amplitude * 0.72;
      positions.forEach((position) => {
        if (position.rowIndex !== rowIndex) return;
        position.x += offsetX;
        position.y += offsetY;
      });
    });
  } else if (movement.type === 'lane_swap') {
    const warningMs = Math.max(500, Number(movement.warningMs) || 600);
    const transitionMs = Math.max(600, Number(movement.transitionMs) || 820);
    const safetyMs = Math.max(300, Number(movement.safetyMs) || 300);
    const half = period / 2;
    const phase = time % period;
    const direction = phase >= half ? 1 : 0;
    const local = phase % half;
    let factor = direction ? 1 : 0;
    if (local < warningMs) {
      inputBlocked = true;
      warning = true;
    } else if (local < warningMs + transitionMs) {
      inputBlocked = true;
      const raw = (local - warningMs) / transitionMs;
      const smooth = raw * raw * (3 - 2 * raw);
      factor = direction ? 1 - smooth : smooth;
    } else {
      factor = direction ? 0 : 1;
      inputBlocked = local < warningMs + transitionMs + safetyMs;
    }

    const groups = {};
    positions.forEach((position, index) => {
      if (!groups[position.rowIndex]) groups[position.rowIndex] = [];
      groups[position.rowIndex].push(index);
    });
    Object.keys(groups).forEach((key) => {
      const indices = groups[key];
      for (let cursor = 0; cursor + 1 < indices.length; cursor += 2) {
        const firstIndex = indices[cursor];
        const secondIndex = indices[cursor + 1];
        const firstBase = layout.positions[firstIndex];
        const secondBase = layout.positions[secondIndex];
        positions[firstIndex].x = lerp(firstBase.x, secondBase.x, factor);
        positions[secondIndex].x = lerp(secondBase.x, firstBase.x, factor);
        const arc = Math.sin(Math.PI * factor) * layout.cardSize * 0.64;
        positions[firstIndex].y = firstBase.y - arc;
        positions[secondIndex].y = secondBase.y + arc;
      }
    });
  }
  return { positions, inputBlocked, warning };
}

function drawMovementWarning(ctx, centerX, y) {
  drawPill(ctx, centerX - 104, y, 208, 42, '换道预告 · 稍等', '#FFF0F1', CONFIG.COLORS.danger, 18);
}

function drawGoldenPackingBanner(ctx, centerX, y, remainingMs) {
  const seconds = Math.max(0, Number(remainingMs) || 0) / 1000;
  drawPill(ctx, centerX - 132, y, 264, 44, `黄金装箱 ${seconds.toFixed(1)}s · 停表`, '#FFF3C5', CONFIG.COLORS.goldDark, 18);
}

function drawGoldenCardGlow(ctx, x, y, size) {
  ctx.save();
  ctx.strokeStyle = CONFIG.COLORS.gold;
  ctx.lineWidth = 6;
  ctx.shadowColor = CONFIG.COLORS.gold;
  ctx.shadowBlur = 18;
  ctx.globalAlpha = 0.9;
  strokeRoundRect(ctx, x - 3, y - 3, size + 6, size + 6, size * 0.24);
  ctx.restore();
}

function getStackLayout(width, top, bottom, stackCount) {
  const count = Math.max(1, stackCount || 1);
  const height = Math.max(280, bottom - top);
  // 4 个以上货堆改用上下双层传送带：卡片更大，同时把原先大片空白
  // 变成真实可玩的第二条运输线，而不只是增加装饰。
  const rowCount = count >= 4 ? 2 : 1;
  const groupSizes = rowCount === 1 ? [count] : [Math.ceil(count / 2), Math.floor(count / 2)];
  const largest = Math.max.apply(null, groupSizes);
  const gap = rowCount === 1 ? 26 : 30;
  const cardSize = clamp((width - 104 - gap * (largest - 1)) / largest, rowCount === 1 ? 108 : 102, rowCount === 1 ? 154 : 142);
  const centers = rowCount === 1
    ? [top + height * 0.54]
    : [top + height * 0.32, top + height * 0.74];
  const positions = [];
  const rows = [];
  let cursor = 0;
  groupSizes.forEach((groupSize, rowIndex) => {
    const rowWidth = groupSize * cardSize + Math.max(0, groupSize - 1) * gap;
    const startX = (width - rowWidth) / 2;
    const cardY = centers[rowIndex] - cardSize / 2;
    rows.push({ x: startX, y: cardY, width: rowWidth, count: groupSize });
    for (let index = 0; index < groupSize; index += 1) {
      positions[cursor] = { x: startX + index * (cardSize + gap), y: cardY, rowIndex };
      cursor += 1;
    }
  });
  return { cardSize, positions, rows, rowCount };
}

function drawConveyorBelt(ctx, row, cardSize) {
  const beltY = row.y + cardSize * 0.6;
  const beltX = row.x - 26;
  const beltWidth = row.width + 52;
  ctx.save();
  ctx.fillStyle = 'rgba(112,66,47,0.16)';
  fillRoundRect(ctx, beltX, beltY + 12, beltWidth, 42, 20);
  ctx.fillStyle = '#B77551';
  fillRoundRect(ctx, beltX - 4, beltY + 4, beltWidth + 8, 25, 13);
  ctx.fillStyle = 'rgba(255,255,255,0.32)';
  const phase = (Date.now() % 1400) / 1400;
  for (let x = beltX - 30 + phase * 70; x < beltX + beltWidth; x += 70) {
    ctx.beginPath();
    ctx.moveTo(x, beltY + 11);
    ctx.lineTo(x + 13, beltY + 16.5);
    ctx.lineTo(x, beltY + 22);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function drawRainbowHalo(ctx, x, y, radius, progress) {
  const phase = Date.now() / 420;
  const pulse = 1 + Math.sin(Date.now() / 90) * 0.035;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(pulse, pulse);
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineWidth = Math.max(6, radius * 0.11);
  ctx.shadowBlur = 22;
  for (let index = 0; index < 7; index += 1) {
    const start = phase + index * Math.PI * 2 / 7;
    ctx.strokeStyle = `hsla(${(index * 52 + Date.now() / 18) % 360},92%,64%,0.88)`;
    ctx.shadowColor = ctx.strokeStyle;
    ctx.beginPath();
    ctx.arc(0, 0, radius, start, start + Math.PI * 0.72);
    ctx.stroke();
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.strokeStyle = 'rgba(255,255,255,0.92)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(0, 0, radius + 8, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * clamp(progress, 0, 1));
  ctx.stroke();
  ctx.restore();
}

function drawRareCountdownBadge(ctx, x, y, remainingMs) {
  const seconds = Math.max(0, remainingMs || 0) / 1000;
  const danger = seconds <= 2;
  ctx.save();
  ctx.fillStyle = danger ? '#E94B5F' : '#4C3C68';
  fillRoundRect(ctx, x - 22, y, 60, 34, 17);
  drawCenteredText(ctx, seconds.toFixed(1), x + 8, y + 17, 16, '#FFFFFF', 'center', 950, 48, 22);
  ctx.restore();
}

function drawBoosterTool(ctx, x, y, width, height, tool, affordable) {
  ctx.save();
  ctx.globalAlpha = affordable ? 1 : 0.62;
  drawCard(ctx, x, y, width, height, 22, 'rgba(255,255,255,0.88)', colorWithAlpha(tool.color, 0.18), 6);
  ctx.fillStyle = colorWithAlpha(tool.color, 0.12);
  ctx.beginPath(); ctx.arc(x + 38, y + height / 2, 23, 0, Math.PI * 2); ctx.fill();
  drawBoosterIcon(ctx, x + 38, y + height / 2, 22, tool.icon, tool.color);
  const costColor = affordable ? tool.color : CONFIG.COLORS.mutedInk;
  const pillX = x + 66;
  const pillWidth = width - 76;
  ctx.fillStyle = colorWithAlpha(costColor, 0.1);
  fillRoundRect(ctx, pillX, y + 18, pillWidth, 36, 18);
  if (typeof tool.cost === 'number') {
    drawMiniCoin(ctx, pillX + 12, y + height / 2, 7);
    drawCenteredText(ctx, String(tool.cost), pillX + pillWidth - 8, y + height / 2, 15, costColor, 'right', 900, pillWidth - 26, 24);
  } else {
    drawCenteredText(ctx, String(tool.cost), pillX + pillWidth / 2, y + height / 2, 15, costColor, 'center', 900, pillWidth - 12, 24);
  }
  ctx.restore();
}

function drawBoosterIcon(ctx, x, y, size, type, color) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (type === 'hint') {
    ctx.beginPath(); ctx.arc(x, y - 4, size * 0.48, Math.PI * 0.1, Math.PI * 0.9, true); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x - 6, y + 7); ctx.lineTo(x + 6, y + 7); ctx.moveTo(x - 4, y + 13); ctx.lineTo(x + 4, y + 13); ctx.stroke();
  } else if (type === 'shuffle') {
    ctx.beginPath(); ctx.moveTo(x - 12, y - 8); ctx.quadraticCurveTo(x, y - 18, x + 11, y - 7); ctx.lineTo(x + 7, y - 8); ctx.moveTo(x + 11, y - 7); ctx.lineTo(x + 10, y - 12); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + 12, y + 8); ctx.quadraticCurveTo(x, y + 18, x - 11, y + 7); ctx.lineTo(x - 7, y + 8); ctx.moveTo(x - 11, y + 7); ctx.lineTo(x - 10, y + 12); ctx.stroke();
  } else if (type === 'time') {
    drawClockIcon(ctx, x, y, size * 0.55, color);
    ctx.beginPath(); ctx.moveTo(x + 10, y - 12); ctx.lineTo(x + 10, y - 3); ctx.moveTo(x + 5, y - 7.5); ctx.lineTo(x + 15, y - 7.5); ctx.stroke();
  } else {
    drawStarOutline(ctx, x, y, size * 0.56);
    ctx.beginPath(); ctx.moveTo(x - 15, y + 15); ctx.lineTo(x + 15, y + 15); ctx.stroke();
  }
  ctx.restore();
}

function drawLockIcon(ctx, x, y, size, color) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(3, size * 0.13);
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.arc(x, y - size * 0.17, size * 0.27, Math.PI, 0); ctx.stroke();
  ctx.fillStyle = colorWithAlpha(color, 0.13);
  fillRoundRect(ctx, x - size * 0.42, y - size * 0.05, size * 0.84, size * 0.62, size * 0.14);
  ctx.strokeStyle = color;
  strokeRoundRect(ctx, x - size * 0.42, y - size * 0.05, size * 0.84, size * 0.62, size * 0.14);
  ctx.beginPath(); ctx.arc(x, y + size * 0.2, size * 0.06, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill();
  ctx.restore();
}

function drawLargeClock(ctx, x, y, color) {
  ctx.save();
  ctx.shadowColor = colorWithAlpha(color, 0.35);
  ctx.shadowBlur = 25;
  ctx.fillStyle = colorWithAlpha(color, 0.12);
  ctx.beginPath(); ctx.arc(x, y, 65, 0, Math.PI * 2); ctx.fill();
  ctx.shadowColor = 'transparent';
  drawClockIcon(ctx, x, y, 48, color);
  ctx.restore();
}

function drawFailureGlyph(ctx, x, y, type) {
  ctx.save();
  ctx.fillStyle = '#FFECEF';
  ctx.beginPath(); ctx.arc(x, y, 65, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = CONFIG.COLORS.danger;
  ctx.fillStyle = CONFIG.COLORS.danger;
  ctx.lineWidth = 6;
  ctx.lineCap = 'round';
  if (type === 'bomb') {
    ctx.beginPath(); ctx.arc(x, y + 8, 34, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x + 20, y - 21);
    ctx.quadraticCurveTo(x + 40, y - 52, x + 58, y - 35);
    ctx.stroke();
    drawStar(ctx, x + 61, y - 39, CONFIG.COLORS.goldDark, 13);
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath(); ctx.arc(x - 12, y - 4, 7, 0, Math.PI * 2); ctx.fill();
  } else {
    ctx.strokeStyle = CONFIG.COLORS.danger;
    strokeRoundRect(ctx, x - 40, y - 34, 80, 68, 18);
    ctx.beginPath();
    ctx.moveTo(x - 22, y - 20); ctx.lineTo(x + 22, y + 20);
    ctx.moveTo(x + 22, y - 20); ctx.lineTo(x - 22, y + 20);
    ctx.stroke();
  }
  ctx.restore();
}

function drawCollectibleItemCard(ctx, collectible, image, x, y, size, alpha, top) {
  ctx.save();
  ctx.globalAlpha = alpha;
  if (top) {
    ctx.shadowColor = collectible.glow;
    ctx.shadowBlur = 19;
    ctx.shadowOffsetY = 5;
  }
  const gradient = ctx.createLinearGradient(x, y, x, y + size);
  gradient.addColorStop(0, '#FFFDF8');
  gradient.addColorStop(1, colorWithAlpha(collectible.glow, 0.33));
  ctx.fillStyle = gradient;
  fillRoundRect(ctx, x, y, size, size, size * 0.24);
  ctx.shadowColor = 'transparent';
  ctx.strokeStyle = top ? collectible.glow : 'rgba(61,49,82,0.08)';
  ctx.lineWidth = top ? 4 : 2;
  strokeRoundRect(ctx, x, y, size, size, size * 0.24);
  drawCollectibleVisual(ctx, collectible, image, x + size / 2, y + size / 2, size * 0.82);
  ctx.fillStyle = CONFIG.COLORS.gold;
  ctx.beginPath();
  ctx.arc(x + size - 15, y + 16, Math.max(5, size * 0.07), 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawCollectionCard(ctx, collectible, image, entry, status, x, y, width, height, theme) {
  const discovered = status === 'discovered' && Boolean(entry && entry.count > 0);
  const revealed = status === 'revealed';
  const mastery = getCollectibleMastery(entry && entry.count || 0);
  const fill = discovered ? 'rgba(255,255,255,0.92)' : (revealed ? 'rgba(249,247,250,0.88)' : 'rgba(241,239,243,0.72)');
  const stroke = discovered ? colorWithAlpha(RARITY_COLORS[collectible.rarity], 0.36) : colorWithAlpha(theme.color, revealed ? 0.24 : 0.1);
  drawCard(ctx, x, y, width, height, 30, fill, stroke, discovered ? 12 : 6);
  const headerColor = discovered ? RARITY_COLORS[collectible.rarity] : '#9F97A7';
  ctx.fillStyle = discovered ? colorWithAlpha(headerColor, 0.09) : colorWithAlpha(theme.color, 0.06);
  fillRoundRect(ctx, x + 24, y + 18, width - 48, 46, 20);
  if (discovered) {
    drawRarityStars(ctx, x + 42, y + 41, collectible.rarity, headerColor);
    drawCoin(ctx, x + width - 82, y + 39, 11);
    drawCenteredText(ctx, String(getCollectibleSellValue(collectible)), x + width - 42, y + 41, 19, CONFIG.COLORS.goldDark, 'right', 900, 40);
  } else {
    drawFeatureGlyph(ctx, revealed ? 'sparkle' : 'box', x + 46, y + 41, 25, revealed ? theme.color : '#AAA3AF');
    drawLockIcon(ctx, x + width - 46, y + 40, 25, '#AAA3AF');
  }

  const imageY = y + height * 0.44;
  const imageSize = clamp(height * 0.36, 98, 136);
  if (discovered) {
    ctx.save();
    ctx.shadowColor = collectible.glow;
    ctx.shadowBlur = 22;
    ctx.fillStyle = 'rgba(255,255,255,0.65)';
    ctx.beginPath();
    ctx.arc(x + width / 2, imageY, imageSize * 0.45, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    drawCollectibleVisual(ctx, collectible, image, x + width / 2, imageY, imageSize);
    drawCenteredText(ctx, collectible.name, x + width / 2, y + height - 76, 24, CONFIG.COLORS.ink, 'center', 900, width - 56);
    const owned = getOwnedCount(entry);
    drawCollectionMeta(ctx, x + 28, y + height - 48, width - 56, 34, owned, mastery.crown, headerColor);
  } else if (revealed) {
    drawLockedCollectibleSilhouette(ctx, collectible, x + width / 2, imageY, imageSize * 0.8, '#938B9B');
    drawCenteredText(ctx, '？？？', x + width / 2, y + height - 77, 26, '#8F8797', 'center', 950);
    drawPill(ctx, x + width / 2 - 70, y + height - 50, 140, 36, `第${collectible.minLevel}关`, 'rgba(147,139,155,0.08)', '#938B9B', 17);
  } else {
    drawSealedCollectionIcon(ctx, x + width / 2, imageY, imageSize * 0.68, '#AAA3AF');
    drawLockDots(ctx, x + width / 2, y + height - 38, '#AAA3AF');
  }
}

function drawRarityStars(ctx, x, y, rarity, color) {
  const tiers = { rare: 1, epic: 2, legendary: 3, mythic: 4 };
  const count = tiers[rarity] || 1;
  for (let index = 0; index < 4; index += 1) {
    drawStar(ctx, x + index * 24, y, index < count ? color : colorWithAlpha(color, 0.16), 8);
  }
}

function drawCollectionMeta(ctx, x, y, width, height, owned, crown, color) {
  ctx.fillStyle = colorWithAlpha(color, 0.08);
  fillRoundRect(ctx, x, y, width, height, height / 2);
  drawFeatureGlyph(ctx, 'box', x + 25, y + height / 2, 22, color);
  drawCenteredText(ctx, `×${owned}`, x + 48, y + height / 2, 17, color, 'left', 900, Math.max(28, width - 132), Math.max(18, height - 12));
  const startX = x + width - 78;
  for (let index = 0; index < 4; index += 1) {
    drawStar(ctx, startX + index * 18, y + height / 2, index < crown ? color : colorWithAlpha(color, 0.16), 6);
  }
}

function drawLockDots(ctx, x, y, color) {
  for (let index = -1; index <= 1; index += 1) {
    ctx.fillStyle = colorWithAlpha(color, 0.42 + (index === 0 ? 0.18 : 0));
    ctx.beginPath(); ctx.arc(x + index * 20, y, 5, 0, Math.PI * 2); ctx.fill();
  }
}

function drawLockedCollectibleSilhouette(ctx, collectible, x, y, size, color) {
  if (!collectible) {
    drawSealedCollectionIcon(ctx, x, y, size, color);
    return;
  }
  if (collectible.themeId !== 'fruit') {
    drawGenericCollectibleSilhouette(ctx, collectible, x, y, size, color);
    return;
  }
  drawLockedRareSilhouetteBase(ctx, collectible.shape, x, y, size, color);
  drawFruitSilhouetteMotif(ctx, collectible, x, y, size, color);
}

function drawLockedRareSilhouetteBase(ctx, shape, x, y, size, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 100, size / 100);
  ctx.strokeStyle = color || '#AAA3AF';
  ctx.lineWidth = 7;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.fillStyle = 'transparent';

  if (shape === 'strawberry') {
    ctx.beginPath();
    ctx.moveTo(0, 45);
    ctx.bezierCurveTo(-58, 12, -48, -37, -16, -28);
    ctx.bezierCurveTo(-6, -49, 6, -49, 16, -28);
    ctx.bezierCurveTo(48, -37, 58, 12, 0, 45);
    ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-32, -29); ctx.lineTo(-4, -18); ctx.lineTo(0, -46); ctx.lineTo(8, -18); ctx.lineTo(34, -29); ctx.stroke();
  } else if (shape === 'grapes' || shape === 'cluster') {
    [[-18,-28,21],[18,-28,21],[-34,4,21],[0,5,23],[34,4,21],[-18,36,22],[18,36,22],[0,65,19]].forEach(([cx,cy,r]) => {
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
    });
    ctx.beginPath(); ctx.moveTo(0,-49); ctx.quadraticCurveTo(10,-73,34,-75); ctx.stroke();
  } else if (shape === 'pear') {
    ctx.beginPath();
    ctx.moveTo(0, -48);
    ctx.bezierCurveTo(-31, -46, -21, -10, -43, 9);
    ctx.bezierCurveTo(-70, 35, -45, 67, 0, 68);
    ctx.bezierCurveTo(45, 67, 70, 35, 43, 9);
    ctx.bezierCurveTo(21, -10, 31, -46, 0, -48);
    ctx.stroke();
    ctx.beginPath(); ctx.moveTo(4,-50); ctx.quadraticCurveTo(5,-72,24,-82); ctx.stroke();
  } else if (shape === 'dragonfruit') {
    ctx.beginPath(); ctx.ellipse(0, 8, 43, 61, 0, 0, Math.PI * 2); ctx.stroke();
    [[0,-56,0,-82],[-37,-25,-63,-39],[-43,5,-72,8],[-32,38,-57,56],[37,-25,63,-39],[43,5,72,8],[32,38,57,56]].forEach(([x1,y1,x2,y2]) => {
      ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.lineTo(x1 + (x1 < 0 ? 8 : -8), y1 + 15); ctx.stroke();
    });
  } else if (shape === 'kiwi') {
    ctx.beginPath(); ctx.arc(0, 0, 65, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, 21, 0, Math.PI * 2); ctx.stroke();
    for (let i = 0; i < 12; i += 1) {
      const a = i * Math.PI * 2 / 12;
      ctx.beginPath(); ctx.ellipse(Math.cos(a) * 40, Math.sin(a) * 40, 3, 7, a, 0, Math.PI * 2); ctx.stroke();
    }
  } else if (shape === 'pineapple') {
    ctx.beginPath(); ctx.ellipse(0, 15, 45, 62, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0,-45); ctx.lineTo(-35,-88); ctx.lineTo(-10,-52); ctx.lineTo(0,-94); ctx.lineTo(10,-52); ctx.lineTo(35,-88); ctx.lineTo(18,-45); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-36,-20); ctx.lineTo(35,50); ctx.moveTo(-42,20); ctx.lineTo(16,76); ctx.moveTo(36,-20); ctx.lineTo(-35,50); ctx.moveTo(42,20); ctx.lineTo(-16,76); ctx.stroke();
  } else if (shape === 'watermelon') {
    ctx.beginPath(); ctx.moveTo(-68,-35); ctx.quadraticCurveTo(0,-80,68,-35); ctx.quadraticCurveTo(48,63,0,68); ctx.quadraticCurveTo(-48,63,-68,-35); ctx.closePath(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-55,-27); ctx.quadraticCurveTo(0,-61,55,-27); ctx.stroke();
    for (let i = -1; i <= 1; i += 1) { ctx.beginPath(); ctx.ellipse(i * 25, i === 0 ? 8 : 2, 4, 9, i * 0.2, 0, Math.PI * 2); ctx.stroke(); }
  } else if (shape === 'cherry') {
    ctx.beginPath(); ctx.arc(-28, 18, 33, 0, Math.PI * 2); ctx.arc(28, 18, 33, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-28, -12); ctx.quadraticCurveTo(-18, -58, 4, -70); ctx.quadraticCurveTo(20, -52, 28, -12); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(5, -66); ctx.quadraticCurveTo(35, -84, 58, -62); ctx.quadraticCurveTo(32, -45, 5, -66); ctx.stroke();
  } else if (shape === 'round' || shape === 'citrus' || shape === 'shell') {
    ctx.beginPath(); ctx.arc(0, 7, 60, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(2, -51); ctx.quadraticCurveTo(4, -77, 24, -84); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(14, -70); ctx.quadraticCurveTo(48, -79, 61, -54); ctx.quadraticCurveTo(35, -42, 14, -70); ctx.stroke();
    if (shape === 'citrus') {
      for (let i = 0; i < 6; i += 1) {
        const angle = i * Math.PI / 3;
        ctx.beginPath(); ctx.moveTo(0, 7); ctx.lineTo(Math.cos(angle) * 50, 7 + Math.sin(angle) * 50); ctx.stroke();
      }
    } else if (shape === 'shell') {
      ctx.beginPath(); ctx.arc(0, 7, 40, -Math.PI * 0.9, Math.PI * 0.9); ctx.stroke();
    }
  } else if (shape === 'peach') {
    ctx.beginPath();
    ctx.moveTo(0, 66);
    ctx.bezierCurveTo(-58, 53, -70, 5, -49, -31);
    ctx.bezierCurveTo(-31, -63, -6, -56, 0, -34);
    ctx.bezierCurveTo(6, -56, 31, -63, 49, -31);
    ctx.bezierCurveTo(70, 5, 58, 53, 0, 66);
    ctx.closePath();
    ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, -31); ctx.quadraticCurveTo(12, 14, 0, 60); ctx.stroke();
  } else if (shape === 'starfruit') {
    ctx.beginPath();
    for (let i = 0; i < 10; i += 1) {
      const radius = i % 2 === 0 ? 68 : 32;
      const angle = -Math.PI / 2 + Math.PI * i / 5;
      const px = Math.cos(angle) * radius;
      const py = 5 + Math.sin(angle) * radius;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath(); ctx.stroke();
  } else if (shape === 'spiky') {
    ctx.beginPath(); ctx.ellipse(0, 7, 49, 56, 0, 0, Math.PI * 2); ctx.stroke();
    for (let i = 0; i < 12; i += 1) {
      const angle = i * Math.PI * 2 / 12;
      ctx.beginPath();
      ctx.moveTo(Math.cos(angle - 0.12) * 47, 7 + Math.sin(angle - 0.12) * 54);
      ctx.lineTo(Math.cos(angle) * 77, 7 + Math.sin(angle) * 82);
      ctx.lineTo(Math.cos(angle + 0.12) * 47, 7 + Math.sin(angle + 0.12) * 54);
      ctx.stroke();
    }
  } else if (shape === 'banana') {
    ctx.beginPath();
    ctx.moveTo(-66, -35);
    ctx.bezierCurveTo(-43, 45, 18, 73, 72, 19);
    ctx.bezierCurveTo(41, 47, -2, 38, -38, -47);
    ctx.closePath();
    ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-42, -46); ctx.lineTo(-50, -69); ctx.stroke();
  } else if (shape === 'melon') {
    ctx.beginPath(); ctx.ellipse(0, 7, 66, 55, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(0, 7, 24, 52, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(0, 7, 45, 52, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, -47); ctx.quadraticCurveTo(4, -70, 25, -76); ctx.stroke();
  } else if (shape === 'mangosteen') {
    ctx.beginPath(); ctx.arc(0, 8, 61, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-45,-40); ctx.lineTo(-10,-32); ctx.lineTo(0,-66); ctx.lineTo(12,-32); ctx.lineTo(47,-40); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 15, 35, 0, Math.PI * 2); ctx.stroke();
  } else {
    ctx.beginPath(); ctx.arc(0, 7, 60, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-45,-40); ctx.lineTo(-10,-32); ctx.lineTo(0,-66); ctx.lineTo(12,-32); ctx.lineTo(47,-40); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-48,15); ctx.quadraticCurveTo(0,-18,48,15); ctx.quadraticCurveTo(25,58,0,65); ctx.quadraticCurveTo(-25,58,-48,15); ctx.stroke();
  }
  ctx.restore();
}

function drawFruitSilhouetteMotif(ctx, collectible, x, y, size, color) {
  const motif = collectible.motif || 'star';
  const signature = hashText(collectible.id);
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 100, size / 100);
  ctx.strokeStyle = color || '#AAA3AF';
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (motif === 'moon') {
    ctx.beginPath(); ctx.arc(1, 7, 21, 0.35, Math.PI * 1.65); ctx.stroke();
  } else if (['crystal', 'prism', 'jade', 'ruby', 'violet'].indexOf(motif) >= 0) {
    ctx.beginPath(); ctx.moveTo(0, -25); ctx.lineTo(24, -6); ctx.lineTo(13, 25); ctx.lineTo(-14, 25); ctx.lineTo(-25, -6); ctx.closePath(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-25, -6); ctx.lineTo(24, -6); ctx.moveTo(0, -25); ctx.lineTo(0, 25); ctx.stroke();
  } else if (motif === 'frost' || motif === 'snow') {
    for (let i = 0; i < 3; i += 1) { ctx.save(); ctx.rotate(i * Math.PI / 3); ctx.beginPath(); ctx.moveTo(-27, 0); ctx.lineTo(27, 0); ctx.stroke(); ctx.restore(); }
  } else if (motif === 'flame' || motif === 'phoenix') {
    ctx.beginPath(); ctx.moveTo(0, 29); ctx.bezierCurveTo(-24, 16, -20, -7, -4, -28); ctx.bezierCurveTo(-4, -8, 7, -2, 8, -18); ctx.bezierCurveTo(28, 3, 23, 22, 0, 29); ctx.closePath(); ctx.stroke();
  } else if (motif === 'crown' || motif === 'oracle') {
    ctx.beginPath(); ctx.moveTo(-29, 20); ctx.lineTo(-24, -17); ctx.lineTo(-8, 1); ctx.lineTo(0, -27); ctx.lineTo(9, 1); ctx.lineTo(25, -17); ctx.lineTo(29, 20); ctx.closePath(); ctx.stroke();
  } else if (['galaxy', 'aurora', 'rainbow', 'nebula', 'cosmic', 'ring', 'chaos'].indexOf(motif) >= 0) {
    ctx.beginPath(); ctx.ellipse(0, 6, 34, 13, -0.26, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(27, -3, 4, 0, Math.PI * 2); ctx.stroke();
  } else if (motif === 'lightning') {
    ctx.beginPath(); ctx.moveTo(8, -31); ctx.lineTo(-19, 4); ctx.lineTo(-3, 3); ctx.lineTo(-12, 33); ctx.lineTo(23, -10); ctx.lineTo(7, -9); ctx.closePath(); ctx.stroke();
  } else if (motif === 'time') {
    ctx.beginPath(); ctx.arc(0, 6, 24, 0, Math.PI * 2); ctx.moveTo(0, 6); ctx.lineTo(0, -13); ctx.moveTo(0, 6); ctx.lineTo(15, 16); ctx.stroke();
  } else if (motif === 'cloud' || motif === 'mist' || motif === 'dream') {
    ctx.beginPath(); ctx.arc(-15, 7, 11, Math.PI, Math.PI * 2); ctx.arc(0, 1, 16, Math.PI, Math.PI * 2); ctx.arc(17, 8, 11, Math.PI, Math.PI * 2); ctx.lineTo(27, 17); ctx.lineTo(-25, 17); ctx.closePath(); ctx.stroke();
  } else {
    drawStarOutline(ctx, 0, 5, 24);
  }

  const marks = 1 + signature % 3;
  for (let i = 0; i < marks; i += 1) {
    const markX = -28 + i * 28 + ((signature >> (i * 2)) & 3);
    const markY = 39 + ((signature >> (i * 3)) & 3) * 4;
    ctx.beginPath(); ctx.arc(markX, markY, 3.2, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.restore();
}

function drawStarOutline(ctx, x, y, radius) {
  ctx.beginPath();
  for (let i = 0; i < 10; i += 1) {
    const r = i % 2 === 0 ? radius : radius * 0.44;
    const angle = -Math.PI / 2 + Math.PI * i / 5;
    const px = x + Math.cos(angle) * r;
    const py = y + Math.sin(angle) * r;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.stroke();
}

function drawSealedCollectionIcon(ctx, x, y, size, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 100, size / 100);
  ctx.strokeStyle = color || '#AAA3AF';
  ctx.lineWidth = 7;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  roundedPath(ctx, -50, -34, 100, 72, 15);
  ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-47, -24); ctx.lineTo(0, 8); ctx.lineTo(47, -24); ctx.stroke();
  ctx.beginPath(); ctx.arc(0, 31, 22, Math.PI, Math.PI * 2); ctx.lineTo(22, 57); ctx.lineTo(-22, 57); ctx.closePath(); ctx.stroke();
  ctx.beginPath(); ctx.arc(0, 42, 4, 0, Math.PI * 2); ctx.moveTo(0, 46); ctx.lineTo(0, 52); ctx.stroke();
  ctx.restore();
}

function drawLockedThemeGate(ctx, theme, y, width) {
  drawCard(ctx, 92, y, width - 184, 390, 40, 'rgba(255,255,255,0.84)', colorWithAlpha(theme.color, 0.22), 14);
  ctx.fillStyle = theme.paleColor;
  ctx.beginPath(); ctx.arc(width / 2, y + 105, 66, 0, Math.PI * 2); ctx.fill();
  drawSealedCollectionIcon(ctx, width / 2, y + 99, 104, theme.darkColor);
  drawPill(ctx, width / 2 - 82, y + 181, 164, 40, '下一主题', theme.paleColor, theme.darkColor, 18);
  drawText(ctx, theme.name, width / 2, y + 266, 38, CONFIG.COLORS.ink, 'center', 950);
  drawStatusChip(ctx, width / 2 - 126, y + 300, 252, 44, 'lock', '每 20 个全局首通开启', theme.darkColor);
}

function getVisibleBoosterActions(level, daily) {
  if (daily) return Object.keys(BOOSTER_UNLOCK_LEVELS);
  const currentLevel = Math.max(1, Math.floor(Number(level) || 1));
  return Object.keys(BOOSTER_UNLOCK_LEVELS).filter((action) => currentLevel >= BOOSTER_UNLOCK_LEVELS[action]);
}

function hashText(value) {
  let hash = 2166136261;
  const text = String(value || '');
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function colorWithAlpha(hex, alpha) {
  const value = String(hex || '#000000').replace('#', '');
  if (value.length !== 6) return `rgba(0,0,0,${alpha})`;
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function darkenColor(hex, amount) {
  const value = String(hex || '#000000').replace('#', '');
  if (value.length !== 6) return '#3D3152';
  const ratio = Math.max(0, Math.min(1, 1 - (Number(amount) || 0)));
  const channel = (start) => Math.round(parseInt(value.slice(start, start + 2), 16) * ratio)
    .toString(16).padStart(2, '0');
  return `#${channel(0)}${channel(2)}${channel(4)}`;
}

function drawText(ctx, text, x, y, size, color, align, weight, maxWidth, maxHeight) {
  const readableWeight = normalizeFontWeight(weight);
  const fitted = fitTextToBox(ctx, text, getReadableTextSize(size), readableWeight, maxWidth, maxHeight);
  ctx.save();
  ctx.font = `${readableWeight} ${fitted.size}px ${FONT}`;
  ctx.fillStyle = color;
  ctx.textAlign = align || 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(fitted.text, x, y);
  ctx.restore();
}

function drawCenteredText(ctx, text, x, y, size, color, align, weight, maxWidth, maxHeight) {
  const readableWeight = normalizeFontWeight(weight);
  const fitted = fitTextToBox(ctx, text, getReadableTextSize(size), readableWeight, maxWidth, maxHeight);
  const content = fitted.text;
  ctx.save();
  ctx.font = `${readableWeight} ${fitted.size}px ${FONT}`;
  ctx.fillStyle = color;
  ctx.textAlign = align || 'center';
  // 微信不同基础库对 textBaseline="middle" 的中文字形处理并不完全一致。
  // 优先使用真实字形上下边界换算 alphabetic 基线；旧基础库只返回 width
  // 时使用稳定回退值，保证胶囊、Tag、角标和榜单标签视觉居中。
  ctx.textBaseline = 'alphabetic';
  const metrics = ctx.measureText(content);
  const ascent = Number(metrics && metrics.actualBoundingBoxAscent);
  const descent = Number(metrics && metrics.actualBoundingBoxDescent);
  const hasBounds = Number.isFinite(ascent) && Number.isFinite(descent) && ascent + descent > 0;
  const baselineY = y + (hasBounds ? (ascent - descent) / 2 : fitted.size * 0.34);
  ctx.fillText(content, x, baselineY);
  ctx.restore();
}

function fitTextToBox(ctx, text, requestedSize, readableWeight, maxWidth, maxHeight) {
  let size = Math.max(12, Number(requestedSize) || 12);
  const widthLimit = Math.max(0, Number(maxWidth) || 0);
  const heightLimit = Math.max(0, Number(maxHeight) || 0);
  if (heightLimit) size = Math.min(size, Math.max(12, heightLimit));

  const minimumSize = Math.min(size, heightLimit ? Math.max(12, Math.min(18, heightLimit)) : 18);
  let content = String(text);
  ctx.save();
  ctx.font = `${readableWeight} ${size}px ${FONT}`;
  if (widthLimit) {
    const measured = ctx.measureText(content).width;
    if (measured > widthLimit && measured > 0) {
      size = Math.max(minimumSize, Math.floor(size * widthLimit / measured));
      ctx.font = `${readableWeight} ${size}px ${FONT}`;
    }
    while (size > minimumSize && ctx.measureText(content).width > widthLimit) {
      size -= 1;
      ctx.font = `${readableWeight} ${size}px ${FONT}`;
    }
    if (ctx.measureText(content).width > widthLimit + 0.5) {
      const suffix = '…';
      while (content.length > 1 && ctx.measureText(`${content}${suffix}`).width > widthLimit) {
        content = content.slice(0, -1);
      }
      if (content !== String(text)) content += suffix;
    }
  }
  ctx.restore();
  return { text: content, size };
}

function drawWrappedText(ctx, text, x, y, size, color, align, weight, maxWidth, lineHeight, maxLines) {
  const readableSize = getReadableTextSize(size);
  const readableWeight = normalizeFontWeight(weight);
  const width = Math.max(40, Number(maxWidth) || 500);
  const limit = Math.max(1, Math.floor(Number(maxLines) || 2));
  const characters = Array.from(String(text || ''));
  const lines = [];
  let current = '';

  ctx.save();
  ctx.font = `${readableWeight} ${readableSize}px ${FONT}`;
  characters.forEach((character) => {
    const candidate = current + character;
    if (current && ctx.measureText(candidate).width > width) {
      lines.push(current);
      current = character;
    } else {
      current = candidate;
    }
  });
  if (current) lines.push(current);
  if (!lines.length) lines.push('');
  if (lines.length > limit) {
    lines.length = limit;
    let last = lines[limit - 1];
    while (last.length && ctx.measureText(`${last}…`).width > width) last = last.slice(0, -1);
    lines[limit - 1] = `${last}…`;
  }

  ctx.fillStyle = color;
  ctx.textAlign = align || 'left';
  ctx.textBaseline = 'alphabetic';
  const gap = Math.max(readableSize, Number(lineHeight) || readableSize * 1.25);
  lines.forEach((line, index) => ctx.fillText(line, x, y + index * gap));
  ctx.restore();
  return lines.length;
}

function normalizeFontWeight(weight) {
  const value = Math.max(100, Math.min(900, Number(weight) || 600));
  return Math.max(100, Math.min(900, Math.round(value / 100) * 100));
}

function getReadableTextSize(size) {
  const value = Math.max(1, Number(size) || 1);
  // 750 设计宽在 375px 真机上会缩放为 0.5。把所有说明、角标和胶囊
  // 提升到约 14–17 CSS px；窄屏也不再出现“有些字正常、有些字像脚注”的落差。
  if (value <= 16) return 28;
  if (value < 20) return 29;
  if (value < 23) return 30;
  if (value < 27) return 32;
  if (value < 31) return 34;
  return value;
}

function getContainedRect(sourceWidth, sourceHeight, x, y, width, height) {
  const sw = Math.max(1, Number(sourceWidth) || 1);
  const sh = Math.max(1, Number(sourceHeight) || 1);
  const targetWidth = Math.max(1, Number(width) || 1);
  const targetHeight = Math.max(1, Number(height) || 1);
  const scale = Math.min(targetWidth / sw, targetHeight / sh);
  const fittedWidth = sw * scale;
  const fittedHeight = sh * scale;
  return {
    x: Number(x) + (targetWidth - fittedWidth) / 2,
    y: Number(y) + (targetHeight - fittedHeight) / 2,
    width: fittedWidth,
    height: fittedHeight
  };
}

function drawImageContained(ctx, image, x, y, width, height) {
  const rect = getContainedRect(image && image.width, image && image.height, x, y, width, height);
  ctx.drawImage(image, rect.x, rect.y, rect.width, rect.height);
  return rect;
}

function drawOutlinedText(ctx, text, x, y, size, fill, stroke, lineWidth) {
  ctx.save();
  ctx.font = `${normalizeFontWeight(900)} ${getReadableTextSize(size)}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.lineJoin = 'round';
  ctx.lineWidth = lineWidth || 6;
  ctx.strokeStyle = stroke;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
  ctx.restore();
}

function roundedPath(ctx, x, y, width, height, radius) {
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

function fillRoundRect(ctx, x, y, width, height, radius) {
  roundedPath(ctx, x, y, width, height, radius);
  ctx.fill();
}

function strokeRoundRect(ctx, x, y, width, height, radius) {
  roundedPath(ctx, x, y, width, height, radius);
  ctx.stroke();
}

function drawCard(ctx, x, y, width, height, radius, fill, stroke, shadowBlur) {
  ctx.save();
  ctx.shadowColor = 'rgba(70,43,35,0.14)';
  ctx.shadowBlur = shadowBlur || 12;
  ctx.shadowOffsetY = Math.max(3, (shadowBlur || 12) * 0.28);
  ctx.fillStyle = fill;
  fillRoundRect(ctx, x, y, width, height, radius);
  ctx.shadowColor = 'transparent';
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 2;
    strokeRoundRect(ctx, x, y, width, height, radius);
  }
  ctx.restore();
}

function drawProgressBar(ctx, x, y, width, height, progress, color) {
  ctx.fillStyle = 'rgba(61,49,82,0.12)';
  fillRoundRect(ctx, x, y, width, height, height / 2);
  const inner = clamp(progress, 0, 1) * width;
  if (inner > 2) {
    const gradient = ctx.createLinearGradient(x, y, x + width, y);
    gradient.addColorStop(0, color);
    gradient.addColorStop(1, '#79E0D0');
    ctx.fillStyle = gradient;
    fillRoundRect(ctx, x, y, inner, height, height / 2);
    ctx.fillStyle = 'rgba(255,255,255,0.36)';
    fillRoundRect(ctx, x + 5, y + 4, Math.max(0, inner - 10), Math.max(2, height * 0.28), height / 4);
  }
}

function drawHomePrimaryButton(ctx, x, y, width, height, label, sublabel, attention) {
  const pulse = (Math.sin(Date.now() / 420) + 1) / 2;
  const glowAlpha = attention ? 0.18 + pulse * 0.13 : 0.17;
  ctx.save();
  ctx.fillStyle = colorWithAlpha(CONFIG.COLORS.coral, glowAlpha);
  fillRoundRect(ctx, x - 9 - pulse * 2, y - 8 - pulse, width + 18 + pulse * 4, height + 16 + pulse * 2, 38);

  ctx.shadowColor = `rgba(167,70,64,${attention ? 0.32 + pulse * 0.08 : 0.28})`;
  ctx.shadowBlur = attention ? 22 + pulse * 9 : 22;
  ctx.shadowOffsetY = 10;
  const gradient = ctx.createLinearGradient(x, y, x, y + height);
  gradient.addColorStop(0, '#FF8478');
  gradient.addColorStop(1, '#EC554E');
  ctx.fillStyle = gradient;
  fillRoundRect(ctx, x, y, width, height, 35);
  ctx.shadowColor = 'transparent';

  ctx.strokeStyle = 'rgba(255,255,255,0.58)';
  ctx.lineWidth = 2;
  strokeRoundRect(ctx, x + 1, y + 1, width - 2, height - 2, 34);
  ctx.fillStyle = 'rgba(255,255,255,0.24)';
  fillRoundRect(ctx, x + 13, y + 10, width - 26, Math.max(25, height * 0.27), 18);

  const playX = x + 67;
  const playY = y + height / 2;
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.beginPath(); ctx.arc(playX, playY, 36, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.46)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(playX, playY, 35, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.moveTo(playX - 9, playY - 16);
  ctx.lineTo(playX - 9, playY + 16);
  ctx.lineTo(playX + 18, playY);
  ctx.closePath();
  ctx.fill();

  const textCenter = x + width / 2 + 18;
  drawCenteredText(ctx, label, textCenter, y + height * 0.42, 32, '#FFFFFF', 'center', 950, width - 178);
  drawCenteredText(ctx, sublabel, textCenter, y + height * 0.72, 19, 'rgba(255,255,255,0.86)', 'center', 720, width - 178);

  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const arrowX = x + width - 43;
  ctx.beginPath();
  ctx.moveTo(arrowX - 6, playY - 10);
  ctx.lineTo(arrowX + 5, playY);
  ctx.lineTo(arrowX - 6, playY + 10);
  ctx.stroke();
  ctx.restore();
}

function drawHomeControlDock(ctx, centerX, y, soundEnabled, musicEnabled) {
  const width = 344;
  const height = 82;
  const x = centerX - width / 2;
  const itemWidth = (width - 20) / 3;
  ctx.save();
  ctx.shadowColor = 'rgba(61,49,82,0.18)';
  ctx.shadowBlur = 16;
  ctx.shadowOffsetY = 7;
  const dockGradient = ctx.createLinearGradient(x, y, x, y + height);
  dockGradient.addColorStop(0, 'rgba(255,255,255,0.94)');
  dockGradient.addColorStop(1, 'rgba(255,248,239,0.86)');
  ctx.fillStyle = dockGradient;
  fillRoundRect(ctx, x, y, width, height, 31);
  ctx.shadowColor = 'transparent';
  ctx.strokeStyle = 'rgba(255,255,255,0.84)';
  ctx.lineWidth = 2;
  strokeRoundRect(ctx, x + 1, y + 1, width - 2, height - 2, 30);

  const entries = [
    { type: 'sound', enabled: soundEnabled, color: CONFIG.COLORS.tealDark },
    { type: 'music', enabled: musicEnabled, color: '#8063D8' },
    { type: 'help', enabled: true, color: CONFIG.COLORS.goldDark }
  ];
  entries.forEach((entry, index) => {
    const itemX = x + 10 + itemWidth * index;
    const cellX = itemX + 7;
    const cellY = y + 8;
    const cellWidth = itemWidth - 14;
    const cellHeight = height - 16;
    ctx.fillStyle = entry.enabled ? colorWithAlpha(entry.color, 0.1) : 'rgba(117,106,132,0.07)';
    fillRoundRect(ctx, cellX, cellY, cellWidth, cellHeight, 23);
    if (index > 0) {
      ctx.fillStyle = 'rgba(61,49,82,0.08)';
      fillRoundRect(ctx, itemX, y + 22, 2, height - 44, 1);
    }
    drawControlGlyph(ctx, entry.type, itemX + itemWidth / 2, y + height / 2 - 1, 31, entry.enabled ? entry.color : '#9D95A5', entry.enabled);
    if (entry.type !== 'help') {
      ctx.fillStyle = entry.enabled ? CONFIG.COLORS.success : '#B8B0BC';
      ctx.beginPath();
      ctx.arc(cellX + cellWidth - 12, cellY + 12, 4.5, 0, Math.PI * 2);
      ctx.fill();
    }
  });
  ctx.restore();
  return { x, y, width, height, itemWidth };
}

function drawButton(ctx, x, y, width, height, label, sublabel, icon, topColor, bottomColor, textColor) {
  ctx.save();
  ctx.shadowColor = 'rgba(61,49,82,0.24)';
  ctx.shadowBlur = 16;
  ctx.shadowOffsetY = 9;
  const gradient = ctx.createLinearGradient(x, y, x, y + height);
  gradient.addColorStop(0, topColor);
  gradient.addColorStop(1, bottomColor);
  ctx.fillStyle = gradient;
  fillRoundRect(ctx, x, y, width, height, 31);
  ctx.shadowColor = 'transparent';
  ctx.fillStyle = 'rgba(255,255,255,0.23)';
  fillRoundRect(ctx, x + 12, y + 9, width - 24, height * 0.31, 18);

  const color = textColor || '#FFFFFF';
  if (icon === 'play') {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x + 50, y + height / 2 - 15);
    ctx.lineTo(x + 50, y + height / 2 + 15);
    ctx.lineTo(x + 76, y + height / 2);
    ctx.closePath();
    ctx.fill();
  }
  const textOffset = icon === 'play' ? 13 : 0;
  const textWidth = Math.max(60, width - (icon === 'play' ? 150 : 64));
  drawCenteredText(ctx, label, x + width / 2 + textOffset, y + (sublabel ? height * 0.4 : height / 2), sublabel ? 30 : 29, color, 'center', 900, textWidth);
  if (sublabel) drawCenteredText(ctx, sublabel, x + width / 2 + textOffset, y + height * 0.7, 19, 'rgba(255,255,255,0.82)', 'center', 650, textWidth);
  ctx.restore();
}

function drawSmallButton(ctx, x, y, width, height, label, icon, topColor, bottomColor) {
  ctx.save();
  ctx.shadowColor = 'rgba(61,49,82,0.18)';
  ctx.shadowBlur = 12;
  ctx.shadowOffsetY = 6;
  const gradient = ctx.createLinearGradient(x, y, x, y + height);
  gradient.addColorStop(0, topColor);
  gradient.addColorStop(1, bottomColor);
  ctx.fillStyle = gradient;
  fillRoundRect(ctx, x, y, width, height, 27);
  ctx.shadowColor = 'transparent';
  const iconX = x + Math.max(38, Math.min(46, width * 0.18));
  const labelCenter = x + width * 0.62;
  drawSmallButtonGlyph(ctx, icon, iconX, y + height / 2, 30, '#FFFFFF');
  drawCenteredText(ctx, label, labelCenter, y + height / 2, 23, '#FFFFFF', 'center', 850, Math.max(80, width - 94));
  ctx.restore();
}

function drawCircleButton(ctx, centerX, centerY, diameter, label, active) {
  ctx.save();
  ctx.shadowColor = active ? 'rgba(61,49,82,0.16)' : 'rgba(61,49,82,0.08)';
  ctx.shadowBlur = Math.max(7, diameter * 0.18);
  ctx.shadowOffsetY = Math.max(3, diameter * 0.09);
  const gradient = ctx.createLinearGradient(centerX, centerY - diameter / 2, centerX, centerY + diameter / 2);
  gradient.addColorStop(0, active ? 'rgba(255,255,255,0.98)' : 'rgba(255,255,255,0.66)');
  gradient.addColorStop(1, active ? 'rgba(249,244,239,0.91)' : 'rgba(239,235,240,0.58)');
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(centerX, centerY, diameter / 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.strokeStyle = active ? 'rgba(255,255,255,0.9)' : 'rgba(117,106,132,0.1)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(centerX, centerY, Math.max(3, diameter / 2 - 1), 0, Math.PI * 2);
  ctx.stroke();
  drawControlGlyph(ctx, label, centerX, centerY, diameter * 0.48, active ? CONFIG.COLORS.ink : '#A594A6', active);
  ctx.restore();
}

function drawSmallButtonGlyph(ctx, icon, x, y, size, color) {
  const typeMap = {
    '日': 'daily',
    '榜': 'rank',
    '店': 'store',
    '▶': 'play',
    '⌂': 'home',
    '↗': 'share',
    '↻': 'retry',
    '✓': 'check',
    '×': 'close'
  };
  const type = typeMap[icon];
  if (!type) {
    drawCenteredText(ctx, icon, x, y, size, color, 'center', 900, size * 1.5);
    return;
  }
  if (type === 'daily' || type === 'rank' || type === 'store') {
    drawFeatureGlyph(ctx, type, x, y, size, color);
    return;
  }
  drawControlGlyph(ctx, type, x, y, size, color, true);
}

function drawControlGlyph(ctx, type, x, y, size, color, enabled) {
  const radius = size / 2;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = Math.max(2.5, size * 0.12);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (type === 'sound') {
    ctx.beginPath();
    ctx.moveTo(x - radius * 0.8, y - radius * 0.24);
    ctx.lineTo(x - radius * 0.4, y - radius * 0.24);
    ctx.lineTo(x + radius * 0.05, y - radius * 0.64);
    ctx.lineTo(x + radius * 0.05, y + radius * 0.64);
    ctx.lineTo(x - radius * 0.4, y + radius * 0.24);
    ctx.lineTo(x - radius * 0.8, y + radius * 0.24);
    ctx.closePath();
    ctx.stroke();
    if (enabled !== false) {
      ctx.beginPath();
      ctx.arc(x + radius * 0.1, y, radius * 0.46, -Math.PI * 0.34, Math.PI * 0.34);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x + radius * 0.1, y, radius * 0.76, -Math.PI * 0.3, Math.PI * 0.3);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(x + radius * 0.22, y - radius * 0.46);
      ctx.lineTo(x + radius * 0.78, y + radius * 0.46);
      ctx.stroke();
    }
  } else if (type === 'music') {
    ctx.beginPath();
    ctx.moveTo(x - radius * 0.08, y - radius * 0.62);
    ctx.lineTo(x + radius * 0.62, y - radius * 0.82);
    ctx.lineTo(x + radius * 0.62, y + radius * 0.28);
    ctx.moveTo(x - radius * 0.08, y - radius * 0.62);
    ctx.lineTo(x - radius * 0.08, y + radius * 0.52);
    ctx.stroke();
    ctx.beginPath(); ctx.ellipse(x - radius * 0.34, y + radius * 0.56, radius * 0.31, radius * 0.22, -0.22, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(x + radius * 0.36, y + radius * 0.3, radius * 0.31, radius * 0.22, -0.22, 0, Math.PI * 2); ctx.fill();
    if (enabled === false) {
      ctx.strokeStyle = '#9D95A5';
      ctx.beginPath();
      ctx.moveTo(x - radius * 0.76, y - radius * 0.78);
      ctx.lineTo(x + radius * 0.8, y + radius * 0.78);
      ctx.stroke();
    }
  } else if (type === 'help' || type === '?') {
    if (type === 'help') {
      ctx.beginPath();
      ctx.arc(x, y, radius * 0.86, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(x, y - radius * 0.22, radius * 0.32, Math.PI * 1.08, Math.PI * 2.06);
    ctx.quadraticCurveTo(x + radius * 0.12, y + radius * 0.18, x, y + radius * 0.3);
    ctx.stroke();
    ctx.beginPath(); ctx.arc(x, y + radius * 0.6, radius * 0.1, 0, Math.PI * 2); ctx.fill();
  } else if (type === '‹' || type === 'back') {
    ctx.beginPath();
    ctx.moveTo(x + radius * 0.28, y - radius * 0.62);
    ctx.lineTo(x - radius * 0.28, y);
    ctx.lineTo(x + radius * 0.28, y + radius * 0.62);
    ctx.stroke();
  } else if (type === '›' || type === 'next') {
    ctx.beginPath();
    ctx.moveTo(x - radius * 0.28, y - radius * 0.62);
    ctx.lineTo(x + radius * 0.28, y);
    ctx.lineTo(x - radius * 0.28, y + radius * 0.62);
    ctx.stroke();
  } else if (type === 'Ⅱ' || type === 'pause') {
    fillRoundRect(ctx, x - radius * 0.52, y - radius * 0.68, radius * 0.34, radius * 1.36, radius * 0.12);
    fillRoundRect(ctx, x + radius * 0.18, y - radius * 0.68, radius * 0.34, radius * 1.36, radius * 0.12);
  } else if (type === '×' || type === 'close') {
    ctx.beginPath();
    ctx.moveTo(x - radius * 0.52, y - radius * 0.52);
    ctx.lineTo(x + radius * 0.52, y + radius * 0.52);
    ctx.moveTo(x + radius * 0.52, y - radius * 0.52);
    ctx.lineTo(x - radius * 0.52, y + radius * 0.52);
    ctx.stroke();
  } else if (type === 'check') {
    ctx.beginPath();
    ctx.moveTo(x - radius * 0.64, y);
    ctx.lineTo(x - radius * 0.15, y + radius * 0.48);
    ctx.lineTo(x + radius * 0.7, y - radius * 0.5);
    ctx.stroke();
  } else if (type === 'play') {
    ctx.beginPath();
    ctx.moveTo(x - radius * 0.42, y - radius * 0.66);
    ctx.lineTo(x + radius * 0.7, y);
    ctx.lineTo(x - radius * 0.42, y + radius * 0.66);
    ctx.closePath();
    ctx.fill();
  } else if (type === 'share') {
    ctx.beginPath();
    ctx.moveTo(x - radius * 0.68, y + radius * 0.56);
    ctx.quadraticCurveTo(x - radius * 0.38, y - radius * 0.32, x + radius * 0.45, y - radius * 0.28);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + radius * 0.1, y - radius * 0.68);
    ctx.lineTo(x + radius * 0.62, y - radius * 0.3);
    ctx.lineTo(x + radius * 0.22, y + radius * 0.12);
    ctx.stroke();
  } else if (type === 'home') {
    ctx.beginPath();
    ctx.moveTo(x - radius * 0.72, y - radius * 0.02);
    ctx.lineTo(x, y - radius * 0.68);
    ctx.lineTo(x + radius * 0.72, y - radius * 0.02);
    ctx.moveTo(x - radius * 0.52, y - radius * 0.06);
    ctx.lineTo(x - radius * 0.52, y + radius * 0.62);
    ctx.lineTo(x + radius * 0.52, y + radius * 0.62);
    ctx.lineTo(x + radius * 0.52, y - radius * 0.06);
    ctx.stroke();
  } else if (type === 'retry') {
    ctx.beginPath();
    ctx.arc(x, y, radius * 0.62, -Math.PI * 0.72, Math.PI * 1.25);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - radius * 0.76, y - radius * 0.32);
    ctx.lineTo(x - radius * 0.68, y - radius * 0.82);
    ctx.lineTo(x - radius * 0.2, y - radius * 0.66);
    ctx.stroke();
  } else {
    drawCenteredText(ctx, String(type || ''), x, y, size, color, 'center', 900, size * 1.6);
  }
  ctx.restore();
}

function drawPill(ctx, x, y, width, height, text, fill, stroke, fontSize) {
  ctx.fillStyle = fill;
  fillRoundRect(ctx, x, y, width, height, height / 2);
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 2;
    strokeRoundRect(ctx, x, y, width, height, height / 2);
  }
  drawCenteredText(
    ctx,
    text,
    x + width / 2,
    y + height / 2,
    fontSize || 18,
    stroke && stroke !== 'rgba(61,49,82,0.18)' ? stroke : CONFIG.COLORS.ink,
    'center',
    800,
    Math.max(24, width - 24),
    Math.max(16, height - 12)
  );
}

function drawSmallTool(ctx, x, y, width, height, label, icon, cost) {
  drawCard(ctx, x, y, width, height, 22, 'rgba(255,255,255,0.87)', 'rgba(61,49,82,0.1)', 8);
  ctx.fillStyle = '#FFF1CE';
  ctx.beginPath();
  ctx.arc(x + 34, y + height / 2, 23, 0, Math.PI * 2);
  ctx.fill();
  drawCenteredText(ctx, icon, x + 34, y + height / 2, 24, CONFIG.COLORS.goldDark, 'center', 900);
  drawText(ctx, label, x + 66, y + 29, 18, CONFIG.COLORS.ink, 'left', 800);
  drawText(ctx, String(cost), x + 66, y + 53, 15, CONFIG.COLORS.mutedInk, 'left', 650);
}

function drawCoin(ctx, x, y, radius) {
  ctx.fillStyle = CONFIG.COLORS.goldDark;
  ctx.beginPath();
  ctx.arc(x, y + 3, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = CONFIG.COLORS.gold;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
  drawCenteredText(ctx, '★', x, y, radius, '#FFF7D1', 'center', 900);
}

function drawMiniCoin(ctx, x, y, radius) {
  ctx.fillStyle = CONFIG.COLORS.goldDark;
  ctx.beginPath(); ctx.arc(x, y + 2, radius, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = CONFIG.COLORS.gold;
  ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#FFF7D1';
  ctx.beginPath(); ctx.arc(x, y, Math.max(2, radius * 0.28), 0, Math.PI * 2); ctx.fill();
}

function drawRuleBadge(ctx, rule, centerX, centerY, size) {
  if (!rule) return;
  const diameter = Math.max(28, size || 28);
  ctx.save();
  ctx.shadowColor = colorWithAlpha(rule.color, 0.34);
  ctx.shadowBlur = 7;
  ctx.fillStyle = rule.fill || '#FFFFFF';
  ctx.beginPath();
  ctx.arc(centerX, centerY, diameter / 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.strokeStyle = rule.color;
  ctx.lineWidth = 2.5;
  ctx.stroke();
  drawCenteredBadgeText(ctx, rule.badge || rule.name.slice(0, 1), centerX, centerY, 16, rule.color, diameter);
  ctx.restore();
}

function drawStackCountBadge(ctx, centerX, centerY, size, count) {
  const diameter = Math.max(28, size || 28);
  ctx.save();
  ctx.shadowColor = 'rgba(61,49,82,0.16)';
  ctx.shadowBlur = 6;
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.arc(centerX, centerY, diameter / 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.strokeStyle = 'rgba(61,49,82,0.22)';
  ctx.lineWidth = 2;
  ctx.stroke();
  drawCenteredBadgeText(ctx, `+${Math.max(1, count || 1)}`, centerX, centerY, 16, CONFIG.COLORS.ink, diameter);
  ctx.restore();
}

function drawCenteredBadgeText(ctx, text, centerX, centerY, size, color, diameter) {
  // 物件角标也必须走与胶囊、Tag 相同的真实字形居中逻辑。
  // 微信不同基础库对 textBaseline="middle" 的中文、数字和“+”号
  // 偏移并不一致，直接复用 drawCenteredText 可保证五种角标对齐。
  const safeDiameter = Math.max(24, Number(diameter) || 28);
  drawCenteredText(ctx, text, centerX, centerY, size, color, 'center', 900, safeDiameter - 10, safeDiameter - 10);
}

function drawItemCard(ctx, item, x, y, size, alpha, top, rule) {
  ctx.save();
  ctx.globalAlpha = alpha;
  if (top) {
    ctx.shadowColor = rule ? colorWithAlpha(rule.color, 0.42) : 'rgba(61,49,82,0.19)';
    ctx.shadowBlur = 13;
    ctx.shadowOffsetY = 7;
  }
  const gradient = ctx.createLinearGradient(x, y, x, y + size);
  gradient.addColorStop(0, '#FFFFFF');
  gradient.addColorStop(1, '#FFF8EC');
  ctx.fillStyle = gradient;
  fillRoundRect(ctx, x, y, size, size, size * 0.22);
  ctx.shadowColor = 'transparent';
  ctx.strokeStyle = rule ? colorWithAlpha(rule.color, top ? 0.68 : 0.34) : (top ? 'rgba(61,49,82,0.1)' : 'rgba(61,49,82,0.06)');
  ctx.lineWidth = rule && top ? 3.5 : 2;
  strokeRoundRect(ctx, x, y, size, size, size * 0.22);
  drawItemIcon(ctx, item, x + size / 2, y + size / 2, size * (rule ? 0.62 : 0.67));
  if (rule) {
    const tagSize = clamp(size * 0.29, 32, 38);
    drawRuleBadge(ctx, rule, x + size - tagSize / 2 - 10, y + tagSize / 2 + 10, tagSize);
  }
  ctx.restore();
}

function drawOrderBox(ctx, item, x, y, width, height, count, target, rule) {
  const rush = rule && rule.type === 'rush';
  const sequence = rule && rule.sequence;
  const nearlyPacked = target - count === 1;
  ctx.save();
  ctx.shadowColor = (rush && !rule.expired) || nearlyPacked ? 'rgba(232,167,45,0.42)' : 'rgba(80,49,34,0.16)';
  ctx.shadowBlur = rush || nearlyPacked ? 12 : 8;
  ctx.shadowOffsetY = 5;
  const gradient = ctx.createLinearGradient(x, y, x, y + height);
  gradient.addColorStop(0, rush && !rule.expired ? '#E6AA4D' : '#D99A5D');
  gradient.addColorStop(1, rush && !rule.expired ? '#B97631' : '#B97043');
  ctx.fillStyle = gradient;
  fillRoundRect(ctx, x, y + 10, width, height - 10, 18);
  ctx.shadowColor = 'transparent';
  if (rush) {
    ctx.strokeStyle = rule.expired ? 'rgba(117,106,132,0.5)' : CONFIG.COLORS.gold;
    ctx.lineWidth = 3;
    strokeRoundRect(ctx, x, y + 10, width, height - 10, 18);
  }

  ctx.fillStyle = '#F0BB7B';
  ctx.beginPath();
  ctx.moveTo(x + 8, y + 17);
  ctx.lineTo(x + width * 0.44, y + 1);
  ctx.lineTo(x + width * 0.49, y + 19);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x + width - 8, y + 17);
  ctx.lineTo(x + width * 0.56, y + 1);
  ctx.lineTo(x + width * 0.51, y + 19);
  ctx.closePath();
  ctx.fill();

  const panelWidth = Math.min(88, width * 0.42);
  ctx.fillStyle = '#FFF6DA';
  fillRoundRect(ctx, x + 13, y + 21, panelWidth, height - 29, 13);
  drawItemIcon(ctx, item, x + 13 + panelWidth / 2, y + 21 + (height - 29) / 2, Math.min(46, height * 0.53));

  if (rush) {
    const label = rule.expired ? '超时' : `急${Math.max(0, rule.remainingMoves || 0)}`;
    drawPill(
      ctx,
      x + width - 68,
      y - 3,
      62,
      30,
      label,
      rule.expired ? '#F0EDF1' : '#FFF4D7',
      rule.expired ? CONFIG.COLORS.mutedInk : CONFIG.COLORS.goldDark,
      14
    );
  } else if (sequence) {
    drawPill(ctx, x + width - 68, y - 3, 62, 30, `序${rule.sequencePosition || 1}`, '#F0EBFF', '#7458C7', 14);
  } else if (nearlyPacked) {
    ctx.strokeStyle = colorWithAlpha(CONFIG.COLORS.gold, 0.9);
    ctx.lineWidth = 3;
    strokeRoundRect(ctx, x, y + 10, width, height - 10, 18);
  }

  const slotGap = width < 220 ? 6 : 8;
  const slotSize = width < 220 ? 20 : 22;
  const slotsTotal = slotSize * 3 + slotGap * 2;
  const slotStart = x + width - slotsTotal - 18;
  const slotY = y + height * 0.61;
  for (let i = 0; i < target; i += 1) {
    ctx.fillStyle = i < count ? CONFIG.COLORS.gold : 'rgba(255,255,255,0.34)';
    ctx.beginPath();
    ctx.arc(slotStart + slotSize / 2 + i * (slotSize + slotGap), slotY, slotSize / 2, 0, Math.PI * 2);
    ctx.fill();
    if (i < count) drawCenteredText(ctx, '✓', slotStart + slotSize / 2 + i * (slotSize + slotGap), slotY, 14, '#FFFFFF', 'center', 900);
  }
  ctx.restore();
}

function drawItemIcon(ctx, item, x, y, size) {
  if (!item) return;
  ctx.save();
  ctx.translate(x, y);
  const s = size / 100;
  ctx.scale(s, s);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (item.collectible) {
    drawCollectibleVisual(ctx, item.collectible, null, 0, 0, 92);
    ctx.restore();
    return;
  }

  switch (item.icon) {
    case 'apple': drawApple(ctx, item); break;
    case 'strawberry': drawProgrammaticThemeItem(ctx, item, 'strawberry'); break;
    case 'grapes': drawProgrammaticThemeItem(ctx, item, 'grapes'); break;
    case 'orange': drawProgrammaticThemeItem(ctx, item, 'citrus'); break;
    case 'pear': drawProgrammaticThemeItem(ctx, item, 'pear'); break;
    case 'peach': drawProgrammaticThemeItem(ctx, item, 'peach'); break;
    case 'watermelon': drawProgrammaticThemeItem(ctx, item, 'watermelon'); break;
    case 'cherry': drawProgrammaticThemeItem(ctx, item, 'cherry'); break;
    case 'banana': drawProgrammaticThemeItem(ctx, item, 'banana'); break;
    case 'kiwi': drawProgrammaticThemeItem(ctx, item, 'kiwi'); break;
    case 'pineapple': drawProgrammaticThemeItem(ctx, item, 'pineapple'); break;
    case 'milk': drawMilk(ctx, item); break;
    case 'bear': drawBear(ctx, item); break;
    case 'bread': drawBread(ctx, item); break;
    case 'soap': drawSoap(ctx, item); break;
    case 'juice': drawJuice(ctx, item); break;
    case 'flower': drawFlower(ctx, item); break;
    case 'shoe': drawShoe(ctx, item); break;
    case 'cookie': drawCookie(ctx, item); break;
    case 'lemon': drawLemon(ctx, item); break;
    case 'book': drawBook(ctx, item); break;
    case 'mug': drawMug(ctx, item); break;
    case 'carrot': drawCarrot(ctx, item); break;
    case 'candy': drawCandy(ctx, item); break;
    case 'camera': drawCamera(ctx, item); break;
    case 'ball': drawBall(ctx, item); break;
    case 'plant': drawPlantIcon(ctx, item); break;
    case 'gift': drawGift(ctx, item); break;
    default:
      if (item.themeId && item.themeId !== 'legacy') drawProgrammaticThemeItem(ctx, item);
      else {
        ctx.fillStyle = item.color;
        ctx.beginPath();
        ctx.arc(0, 0, 35, 0, Math.PI * 2);
        ctx.fill();
      }
  }
  ctx.restore();
}

const THEMED_ITEM_SHAPES = Object.freeze({
  fruit: [
    'round', 'strawberry', 'grapes', 'citrus', 'pear', 'peach', 'citrus', 'watermelon',
    'cherry', 'banana', 'kiwi', 'pineapple', 'mango', 'dragonfruit', 'cluster', 'coconut',
    'mangosteen', 'papaya', 'pomegranate', 'cluster', 'persimmon', 'plum', 'starfruit', 'avocado'
  ],
  vegetable: [
    'tomato', 'carrot', 'eggplant', 'pepper', 'broccoli', 'corn', 'pumpkin', 'mushroom',
    'cucumber', 'cabbage', 'onion', 'potato', 'pepper', 'radish', 'lotus', 'asparagus',
    'pea', 'garlic', 'beet', 'artichoke', 'yam', 'bamboo', 'gourd', 'harvest'
  ],
  animal: [
    'cat', 'dog', 'rabbit', 'panda', 'fox', 'lion', 'elephant', 'penguin', 'whale',
    'turtle', 'owl', 'deer', 'otter', 'bear', 'tiger', 'bird', 'alpaca', 'octopus',
    'hedgehog', 'dolphin', 'bird', 'dragon', 'guardian', 'beast'
  ],
  toy: [
    'bear', 'robot', 'car', 'rocket', 'blocks', 'duck', 'drum', 'kite', 'train', 'yoyo',
    'dinosaur', 'doll', 'puzzle', 'top', 'plane', 'horse', 'slime', 'capsule',
    'pinwheel', 'marble', 'musicbox', 'spaceship', 'castle', 'chest'
  ],
  dessert: [
    'cake', 'donut', 'cupcake', 'icecream', 'macaron', 'cookie', 'pudding', 'candy',
    'chocolate', 'waffle', 'pie', 'jelly', 'tart', 'mousse', 'soda', 'parfait',
    'lollipop', 'popcorn', 'bread', 'teapot', 'house', 'bento', 'banquet', 'dessertcore'
  ],
  appliance: [
    'fridge', 'washer', 'fan', 'kettle', 'toaster', 'vacuum', 'lamp', 'cooker',
    'microwave', 'iron', 'dryer', 'mixer', 'humidifier', 'heater', 'scale', 'purifier',
    'coffee', 'dishwasher', 'oven', 'aircon', 'hood', 'cleaner', 'kitchen', 'homecore'
  ],
  digital: [
    'phone', 'tablet', 'laptop', 'headphones', 'camera', 'console', 'watch', 'drone',
    'keyboard', 'mouse', 'projector', 'vr', 'chip', 'router', 'speaker', 'earbuds',
    'powerbank', 'reader', 'gamepad', 'glasses', 'hologram', 'satellite', 'aicore', 'quantum'
  ],
  vehicle: [
    'car', 'bus', 'train', 'plane', 'boat', 'bicycle', 'rocket', 'scooter', 'truck',
    'submarine', 'helicopter', 'taxi', 'balloon', 'metro', 'motorcycle', 'carriage',
    'sailboat', 'rover', 'ufo', 'capsulecar', 'airship', 'gateway', 'cruiser', 'engine'
  ],
  fashion: [
    'hat', 'shirt', 'dress', 'shoe', 'bag', 'glasses', 'watch', 'scarf', 'crown',
    'sock', 'jacket', 'umbrella', 'necklace', 'boot', 'bow', 'belt', 'glove', 'mask',
    'robe', 'suitcase', 'cape', 'outfit', 'wardrobe', 'stylecore'
  ],
  mascot: [
    'mochi', 'rabbit', 'cat', 'fox', 'blob', 'bird', 'dragon', 'penguin', 'axolotl',
    'bee', 'mushroom', 'whale', 'deer', 'ghost', 'turtle', 'lion', 'bear', 'octopus',
    'flower', 'robot', 'owl', 'sprite', 'guardian', 'friend'
  ]
});

const ITEM_MOTIFS = Object.freeze(['star', 'moon', 'crystal', 'rainbow', 'cloud', 'crown', 'frost', 'flame', 'ring', 'time', 'aurora', 'comet']);

function drawProgrammaticThemeItem(ctx, item, forcedShape) {
  const themeId = item.themeId || 'fruit';
  const shapes = THEMED_ITEM_SHAPES[themeId] || [];
  const variant = Math.max(0, Math.floor(Number(item.variant) || 0));
  const collectible = {
    id: `item:${item.id}`,
    themeId,
    color: item.color,
    accent: item.accent,
    glow: item.accent,
    shape: forcedShape || shapes[variant % Math.max(1, shapes.length)] || 'round',
    motif: ITEM_MOTIFS[variant % ITEM_MOTIFS.length],
    variant,
    plain: true
  };
  drawCollectibleVisual(ctx, collectible, null, 0, 0, 92);
}

function drawApple(ctx, item) {
  ctx.fillStyle = item.color;
  ctx.beginPath();
  ctx.arc(-17, 5, 28, 0, Math.PI * 2);
  ctx.arc(17, 5, 28, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#6E412C';
  fillRoundRect(ctx, -4, -43, 8, 24, 4);
  ctx.fillStyle = item.accent;
  ctx.beginPath();
  ctx.ellipse(17, -31, 18, 9, -0.45, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.38)';
  ctx.beginPath();
  ctx.arc(-23, -6, 8, 0, Math.PI * 2);
  ctx.fill();
}

function drawMilk(ctx, item) {
  ctx.fillStyle = item.color;
  ctx.beginPath();
  ctx.moveTo(-29, -30);
  ctx.lineTo(18, -30);
  ctx.lineTo(31, -14);
  ctx.lineTo(31, 39);
  ctx.lineTo(-31, 39);
  ctx.lineTo(-31, -14);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = item.accent;
  ctx.fillRect(-31, 4, 62, 24);
  ctx.beginPath();
  ctx.moveTo(-29, -30);
  ctx.lineTo(-8, -45);
  ctx.lineTo(18, -30);
  ctx.closePath();
  ctx.fill();
  drawText(ctx, 'M', 0, 24, 22, '#FFFFFF', 'center', 900);
}

function drawBear(ctx, item) {
  ctx.fillStyle = item.color;
  ctx.beginPath();
  ctx.arc(-28, -22, 18, 0, Math.PI * 2);
  ctx.arc(28, -22, 18, 0, Math.PI * 2);
  ctx.arc(0, 2, 43, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#EBC49D';
  ctx.beginPath();
  ctx.ellipse(0, 18, 24, 19, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = item.accent;
  ctx.beginPath();
  ctx.arc(-15, -2, 4, 0, Math.PI * 2);
  ctx.arc(15, -2, 4, 0, Math.PI * 2);
  ctx.arc(0, 11, 6, 0, Math.PI * 2);
  ctx.fill();
}

function drawBread(ctx, item) {
  ctx.fillStyle = item.accent;
  fillRoundRect(ctx, -38, -27, 76, 70, 20);
  ctx.fillStyle = item.color;
  fillRoundRect(ctx, -32, -32, 64, 65, 18);
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.beginPath();
  ctx.ellipse(-12, -12, 13, 7, -0.4, 0, Math.PI * 2);
  ctx.fill();
}

function drawSoap(ctx, item) {
  ctx.fillStyle = item.color;
  fillRoundRect(ctx, -39, -25, 78, 55, 22);
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = 5;
  strokeRoundRect(ctx, -28, -15, 56, 35, 16);
  ctx.fillStyle = item.accent;
  [-30, -8, 20].forEach((dx, index) => {
    ctx.globalAlpha = 0.75;
    ctx.beginPath();
    ctx.arc(dx, -34 - index * 5, 7 + index * 2, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.globalAlpha = 1;
}

function drawJuice(ctx, item) {
  ctx.fillStyle = '#FFFFFF';
  fillRoundRect(ctx, -29, -32, 58, 72, 12);
  ctx.fillStyle = item.color;
  fillRoundRect(ctx, -25, -10, 50, 45, 8);
  ctx.strokeStyle = item.accent;
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.moveTo(8, -30);
  ctx.lineTo(24, -50);
  ctx.stroke();
  ctx.fillStyle = item.accent;
  ctx.beginPath();
  ctx.arc(0, 10, 9, 0, Math.PI * 2);
  ctx.fill();
}

function drawFlower(ctx, item) {
  ctx.fillStyle = item.color;
  for (let i = 0; i < 6; i += 1) {
    const angle = Math.PI * 2 * i / 6;
    ctx.beginPath();
    ctx.ellipse(Math.cos(angle) * 24, Math.sin(angle) * 24, 19, 12, angle, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = item.accent;
  ctx.beginPath();
  ctx.arc(0, 0, 15, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#5EA856';
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.moveTo(0, 18);
  ctx.lineTo(0, 48);
  ctx.stroke();
}

function drawShoe(ctx, item) {
  ctx.fillStyle = item.color;
  ctx.beginPath();
  ctx.moveTo(-39, 8);
  ctx.quadraticCurveTo(-25, -15, -8, -12);
  ctx.lineTo(5, 5);
  ctx.quadraticCurveTo(25, 10, 39, 23);
  ctx.lineTo(35, 38);
  ctx.lineTo(-40, 38);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = item.accent;
  fillRoundRect(ctx, -41, 31, 80, 12, 6);
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = 4;
  for (let i = 0; i < 3; i += 1) {
    ctx.beginPath();
    ctx.moveTo(-13 + i * 11, 2 + i * 3);
    ctx.lineTo(2 + i * 9, 0 + i * 4);
    ctx.stroke();
  }
}

function drawCookie(ctx, item) {
  ctx.fillStyle = item.color;
  ctx.beginPath();
  ctx.arc(0, 0, 39, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = item.accent;
  [[-16,-13],[13,-17],[-4,5],[18,15],[-19,21]].forEach(([x,y]) => {
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fill();
  });
}

function drawLemon(ctx, item) {
  ctx.fillStyle = item.color;
  ctx.beginPath();
  ctx.ellipse(0, 4, 43, 29, -0.35, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = item.accent;
  ctx.beginPath();
  ctx.ellipse(28, -28, 17, 8, -0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(-8, -3, 18, Math.PI * 0.8, Math.PI * 1.65);
  ctx.stroke();
}

function drawBook(ctx, item) {
  ctx.fillStyle = item.color;
  fillRoundRect(ctx, -38, -34, 70, 72, 8);
  ctx.fillStyle = item.accent;
  ctx.fillRect(-29, -26, 5, 56);
  ctx.fillRect(-13, -18, 31, 5);
  ctx.fillRect(-13, -5, 25, 4);
  ctx.fillRect(-13, 8, 30, 4);
  ctx.fillStyle = '#FFFFFF';
  fillRoundRect(ctx, 29, -29, 8, 62, 3);
}

function drawMug(ctx, item) {
  ctx.fillStyle = item.color;
  fillRoundRect(ctx, -33, -28, 58, 64, 13);
  ctx.strokeStyle = item.color;
  ctx.lineWidth = 11;
  ctx.beginPath();
  ctx.arc(28, 2, 20, -Math.PI / 2, Math.PI / 2);
  ctx.stroke();
  ctx.fillStyle = item.accent;
  ctx.beginPath();
  ctx.ellipse(-4, -24, 26, 8, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawCarrot(ctx, item) {
  ctx.fillStyle = item.color;
  ctx.beginPath();
  ctx.moveTo(-28, -18);
  ctx.quadraticCurveTo(0, -32, 28, -18);
  ctx.lineTo(0, 44);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = item.accent;
  ctx.lineWidth = 10;
  [-1, 0, 1].forEach((n) => {
    ctx.beginPath();
    ctx.moveTo(n * 7, -20);
    ctx.lineTo(n * 16, -48);
    ctx.stroke();
  });
}

function drawCandy(ctx, item) {
  ctx.fillStyle = item.accent;
  ctx.beginPath();
  ctx.moveTo(-50, -20);
  ctx.lineTo(-25, -12);
  ctx.lineTo(-25, 12);
  ctx.lineTo(-50, 22);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(50, -20);
  ctx.lineTo(25, -12);
  ctx.lineTo(25, 12);
  ctx.lineTo(50, 22);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = item.color;
  fillRoundRect(ctx, -29, -27, 58, 54, 18);
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  fillRoundRect(ctx, -16, -17, 14, 34, 7);
}

function drawCamera(ctx, item) {
  ctx.fillStyle = item.color;
  fillRoundRect(ctx, -43, -25, 86, 62, 13);
  ctx.fillStyle = '#3C4352';
  fillRoundRect(ctx, -25, -39, 32, 18, 6);
  ctx.fillStyle = item.accent;
  ctx.beginPath();
  ctx.arc(5, 6, 24, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#394057';
  ctx.beginPath();
  ctx.arc(5, 6, 14, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#FFDA68';
  ctx.beginPath();
  ctx.arc(-28, -8, 6, 0, Math.PI * 2);
  ctx.fill();
}

function drawBall(ctx, item) {
  ctx.fillStyle = item.color;
  ctx.beginPath();
  ctx.arc(0, 0, 41, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = item.accent;
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.arc(-18, 0, 27, -Math.PI / 2, Math.PI / 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(18, 0, 27, Math.PI / 2, Math.PI * 1.5);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-40, 0);
  ctx.lineTo(40, 0);
  ctx.stroke();
}

function drawPlantIcon(ctx, item) {
  ctx.fillStyle = item.accent;
  ctx.beginPath();
  ctx.moveTo(-29, 4);
  ctx.lineTo(29, 4);
  ctx.lineTo(19, 42);
  ctx.lineTo(-19, 42);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = item.color;
  [[-17,-18,0.5],[11,-27,-0.45],[0,-8,0]].forEach(([x,y,r]) => {
    ctx.beginPath();
    ctx.ellipse(x, y, 20, 11, r, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.strokeStyle = '#4D9658';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(0, 3);
  ctx.lineTo(0, -35);
  ctx.stroke();
}

function drawGift(ctx, item) {
  ctx.fillStyle = item.color;
  fillRoundRect(ctx, -38, -23, 76, 62, 10);
  ctx.fillStyle = item.accent;
  ctx.fillRect(-7, -23, 14, 62);
  ctx.fillRect(-38, -10, 76, 12);
  ctx.beginPath();
  ctx.ellipse(-13, -31, 17, 10, 0.55, 0, Math.PI * 2);
  ctx.ellipse(13, -31, 17, 10, -0.55, 0, Math.PI * 2);
  ctx.fill();
}

function drawPlant(ctx, x, y, scale) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.globalAlpha = 0.36;
  ctx.fillStyle = '#BC7B52';
  fillRoundRect(ctx, -32, 0, 64, 65, 12);
  ctx.fillStyle = '#4DA66C';
  [-32, 0, 32].forEach((dx, index) => {
    ctx.beginPath();
    ctx.ellipse(dx * 0.55, -20 - index * 6, 26, 14, dx * 0.015, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.restore();
}

function drawLamp(ctx, x, y, scale) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.globalAlpha = 0.28;
  ctx.strokeStyle = '#7B5B46';
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.moveTo(0, -90);
  ctx.lineTo(0, 35);
  ctx.stroke();
  ctx.fillStyle = '#F7C860';
  ctx.beginPath();
  ctx.moveTo(-36, -25);
  ctx.lineTo(36, -25);
  ctx.lineTo(22, 10);
  ctx.lineTo(-22, 10);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawHangingSign(ctx, x, y) {
  ctx.save();
  ctx.globalAlpha = 0.16;
  ctx.strokeStyle = '#7B5B46';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(x - 70, y - 20);
  ctx.lineTo(x - 70, y + 14);
  ctx.moveTo(x + 70, y - 20);
  ctx.lineTo(x + 70, y + 14);
  ctx.stroke();
  ctx.fillStyle = '#FFFFFF';
  fillRoundRect(ctx, x - 92, y + 10, 184, 48, 14);
  ctx.restore();
}

function drawFloorRug(ctx, x, y) {
  ctx.save();
  ctx.globalAlpha = 0.2;
  const gradient = ctx.createLinearGradient(x - 180, y, x + 180, y);
  gradient.addColorStop(0, '#F59A7B');
  gradient.addColorStop(0.5, '#F8C75C');
  gradient.addColorStop(1, '#67CDBB');
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.ellipse(x, y, 210, 42, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.ellipse(x, y, 168, 27, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawParcelCart(ctx, x, y, scale) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale || 1, scale || 1);
  ctx.globalAlpha = 0.3;
  ctx.strokeStyle = '#70422F';
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.moveTo(-56, -73);
  ctx.lineTo(-42, 29);
  ctx.lineTo(51, 29);
  ctx.stroke();
  ctx.fillStyle = '#D99255';
  fillRoundRect(ctx, -43, -59, 54, 42, 8);
  ctx.fillStyle = '#F0B875';
  fillRoundRect(ctx, 5, -38, 50, 50, 8);
  ctx.fillStyle = '#70422F';
  [-28, 37].forEach((wheelX) => {
    ctx.beginPath();
    ctx.arc(wheelX, 39, 13, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.restore();
}

function drawCeilingLights(ctx, x, y) {
  ctx.save();
  ctx.globalAlpha = 0.18;
  [-170, 0, 170].forEach((offset, index) => {
    const lampY = y + (index % 2) * 15;
    ctx.strokeStyle = '#7B5B46';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(x + offset, -8);
    ctx.lineTo(x + offset, lampY + 25);
    ctx.stroke();
    const glow = ctx.createRadialGradient(x + offset, lampY + 48, 2, x + offset, lampY + 48, 46);
    glow.addColorStop(0, 'rgba(255,224,126,0.9)');
    glow.addColorStop(1, 'rgba(255,224,126,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x + offset, lampY + 48, 46, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#F7C860';
    ctx.beginPath();
    ctx.moveTo(x + offset - 20, lampY + 28);
    ctx.lineTo(x + offset + 20, lampY + 28);
    ctx.lineTo(x + offset + 13, lampY + 46);
    ctx.lineTo(x + offset - 13, lampY + 46);
    ctx.closePath();
    ctx.fill();
  });
  ctx.restore();
}

function drawWindowBunting(ctx, x, y) {
  ctx.save();
  ctx.globalAlpha = 0.2;
  ctx.strokeStyle = '#806F92';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(x - 250, y - 24);
  ctx.quadraticCurveTo(x, y + 32, x + 250, y - 24);
  ctx.stroke();
  const colors = ['#FF786B', '#F8C75C', '#46C7B7', '#9277E5'];
  for (let i = 0; i < 9; i += 1) {
    const progress = i / 8;
    const flagX = x - 240 + progress * 480;
    const flagY = y - 20 + Math.sin(progress * Math.PI) * 42;
    ctx.fillStyle = colors[i % colors.length];
    ctx.beginPath();
    ctx.moveTo(flagX - 18, flagY);
    ctx.lineTo(flagX + 18, flagY);
    ctx.lineTo(flagX, flagY + 35);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function drawShopCat(ctx, x, y, scale) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale || 1, scale || 1);
  ctx.globalAlpha = 0.3;
  ctx.fillStyle = '#8B6A61';
  ctx.beginPath();
  ctx.arc(0, -28, 36, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-30, -50); ctx.lineTo(-21, -84); ctx.lineTo(-5, -57); ctx.closePath(); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(30, -50); ctx.lineTo(21, -84); ctx.lineTo(5, -57); ctx.closePath(); ctx.fill();
  ctx.beginPath();
  ctx.ellipse(0, 28, 42, 55, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#8B6A61';
  ctx.lineWidth = 13;
  ctx.beginPath();
  ctx.moveTo(35, 24);
  ctx.quadraticCurveTo(76, 10, 59, -29);
  ctx.stroke();
  ctx.fillStyle = '#FFF6E7';
  ctx.beginPath();
  ctx.ellipse(0, 42, 20, 29, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#3D3152';
  ctx.beginPath(); ctx.arc(-13, -31, 4, 0, Math.PI * 2); ctx.arc(13, -31, 4, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function drawGrandOpeningStars(ctx, x, y) {
  ctx.save();
  ctx.globalAlpha = 0.2;
  const colors = [CONFIG.COLORS.gold, CONFIG.COLORS.coral, CONFIG.COLORS.teal, '#9277E5'];
  for (let i = 0; i < 13; i += 1) {
    const angle = Math.PI * 2 * i / 13;
    const radius = 118 + (i % 3) * 31;
    drawStar(ctx, x + Math.cos(angle) * radius, y + Math.sin(angle) * radius * 0.42, colors[i % colors.length], 7 + (i % 3) * 3);
  }
  ctx.restore();
}

function drawLogoBox(ctx, x, y, scale) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.shadowColor = 'rgba(61,49,82,0.18)';
  ctx.shadowBlur = 24;
  ctx.shadowOffsetY = 10;
  const gradient = ctx.createLinearGradient(0, -20, 0, 94);
  gradient.addColorStop(0, '#F3AE62');
  gradient.addColorStop(1, '#C96F3F');
  ctx.fillStyle = gradient;
  fillRoundRect(ctx, -86, -8, 172, 112, 27);
  ctx.shadowColor = 'transparent';
  ctx.fillStyle = '#FFD493';
  ctx.beginPath();
  ctx.moveTo(-82, -5);
  ctx.lineTo(-25, -58);
  ctx.lineTo(-4, -4);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(82, -5);
  ctx.lineTo(25, -58);
  ctx.lineTo(4, -4);
  ctx.closePath();
  ctx.fill();
  const parcelColors = [CONFIG.COLORS.coral, CONFIG.COLORS.teal, '#9277E5'];
  [-42, 0, 42].forEach((offset, index) => {
    ctx.fillStyle = parcelColors[index];
    ctx.beginPath(); ctx.arc(offset, -4 - (index === 1 ? 12 : 0), 25, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.beginPath(); ctx.arc(offset - 8, -12 - (index === 1 ? 12 : 0), 7, 0, Math.PI * 2); ctx.fill();
  });
  ctx.fillStyle = 'rgba(255,244,211,0.92)';
  fillRoundRect(ctx, -48, 36, 96, 48, 14);
  ctx.strokeStyle = CONFIG.COLORS.goldDark;
  ctx.lineWidth = 8;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-22, 60);
  ctx.lineTo(-5, 74);
  ctx.lineTo(26, 48);
  ctx.stroke();
  ctx.restore();
}

function drawMiniShop(ctx, x, y, width, height, stars) {
  ctx.fillStyle = '#E9B889';
  fillRoundRect(ctx, x, y + 28, width, height - 28, 24);
  ctx.fillStyle = '#FFF6DF';
  fillRoundRect(ctx, x + 18, y + 48, width - 36, height - 72, 18);
  ctx.fillStyle = '#70C5B6';
  fillRoundRect(ctx, x + 35, y + 68, 70, 69, 12);
  ctx.fillStyle = '#A76949';
  ctx.fillRect(x + 125, y + 70, 82, 13);
  ctx.fillRect(x + 125, y + 114, 82, 13);
  const boxes = Math.min(5, 1 + Math.floor(stars / 9));
  for (let i = 0; i < boxes; i += 1) {
    ctx.fillStyle = i % 2 ? '#F09971' : '#E4A65F';
    fillRoundRect(ctx, x + 127 + (i % 3) * 28, y + 86 + Math.floor(i / 3) * 43, 23, 25, 5);
  }
  ctx.fillStyle = '#D67954';
  ctx.beginPath();
  ctx.moveTo(x - 8, y + 32);
  ctx.lineTo(x + width / 2, y - 6);
  ctx.lineTo(x + width + 8, y + 32);
  ctx.closePath();
  ctx.fill();
}

function drawStars(ctx, x, y, count) {
  for (let i = 0; i < 3; i += 1) {
    drawStar(ctx, x + (i - 1) * 82, y, i < count ? CONFIG.COLORS.gold : '#E4DDD2', 34);
  }
}

function drawStar(ctx, x, y, color, radius) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < 10; i += 1) {
    const r = i % 2 === 0 ? radius : radius * 0.46;
    const angle = -Math.PI / 2 + Math.PI * i / 5;
    const px = Math.cos(angle) * r;
    const py = Math.sin(angle) * r;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawOverflowBox(ctx, x, y) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-0.03);
  ctx.fillStyle = '#C97E4A';
  fillRoundRect(ctx, -82, -10, 164, 96, 21);
  drawItemIcon(ctx, ITEM_MAP.apple, -42, -15, 52);
  drawItemIcon(ctx, ITEM_MAP.bear, 2, -27, 58);
  drawItemIcon(ctx, ITEM_MAP.milk, 45, -11, 49);
  ctx.fillStyle = '#F3B872';
  ctx.beginPath();
  ctx.moveTo(-78, -7);
  ctx.lineTo(-18, -54);
  ctx.lineTo(-5, -2);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(78, -7);
  ctx.lineTo(18, -54);
  ctx.lineTo(5, -2);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawModalMask(ctx, width, height, alpha) {
  ctx.fillStyle = `rgba(36,27,49,${alpha == null ? 0.48 : alpha})`;
  ctx.fillRect(0, 0, width, height);
}

module.exports = {
  Renderer,
  drawItemIcon,
  fillRoundRect,
  getContainedRect,
  getMovementState,
  getVisibleBoosterActions,
  normalizeFontWeight,
  roundedPath
};
