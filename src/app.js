'use strict';

const CONFIG = require('./config');
const { AdManager } = require('./ads');
const { Analytics } = require('./analytics');
const { AudioManager } = require('./audio');
const { getItemById } = require('./catalog');
const { FriendRankManager } = require('./friend-rank');
const { GameModel } = require('./game-model');
const {
  BOOSTER_COIN_COSTS,
  MAX_STORE_PURCHASE_QUANTITY,
  REVIVE_COIN_COST,
  getAccountProgressLevel,
  getCollectibleSellValue,
  getStoreProductDefinition,
  isFeatureUnlocked
} = require('./economy');
const { generateLevel, getDailyLevel, removeCollectibleFromLevel } = require('./level-generator');
const { getCollectionTargetMechanic, getMechanicForLevel } = require('./mechanics');
const { createPlatform } = require('./platform');
const { getJourneyInfo, getPointRank, getTotalPoints } = require('./progression');
const {
  COLLECTIBLE_MAP,
  countDiscoveredCollectibles,
  getRarestDiscoveredCollectible,
  getThemeCollectibles,
  getVisibleCollectionEntries
} = require('./theme-collectibles');
const { Renderer } = require('./renderer');
const { ShareManager } = require('./share');
const { Storage } = require('./storage');
const { getTheme, getVisibleThemes } = require('./themes');

const BOOSTER_COSTS = Object.freeze({
  hint: BOOSTER_COIN_COSTS.hint,
  shuffle: BOOSTER_COIN_COSTS.shuffle,
  addTime: BOOSTER_COIN_COSTS.add_time,
  autoPackFallback: BOOSTER_COIN_COSTS.auto_pack,
  reviveFallback: REVIVE_COIN_COST
});

class GameApp {
  constructor(options) {
    const opts = options || {};
    this.platform = opts.platform || createPlatform();
    this.canvas = opts.canvas || this.platform.createCanvas();
    this.storage = opts.storage || new Storage(this.platform);
    this.dailyLogin = this.storage.claimDailyLogin();
    this.analytics = opts.analytics || new Analytics(this.platform);
    this.renderer = opts.renderer || new Renderer(this.canvas, this.platform);
    this.audio = opts.audio || new AudioManager(this.platform, this.storage.data);
    this.ads = opts.ads || new AdManager(this.platform, this.analytics);
    this.share = opts.share || new ShareManager(this.platform, this.analytics);
    this.friendRank = opts.friendRank || new FriendRankManager(this.platform);

    this.model = null;
    this.currentConfig = null;
    this.currentRun = null;
    this.runId = 0;
    this.busy = false;
    this.hidden = false;
    this.running = false;
    this.rafId = null;
    this.lastFrameAt = Date.now();
    this.touchStart = null;
    this.resultRecorded = false;
    this.interstitialTimer = null;
    const openFruitShop = this.share.consumeFruitShopEntry();
    const sharedCollectionThemeId = openFruitShop ? this.share.consumeFruitShopTheme() : null;

    this.view = {
      screen: openFruitShop ? 'fruit_shop' : 'home',
      overlay: null,
      helpOpen: false,
      challenge: this.share.consumeChallenge(),
      result: null,
      doubleClaimed: false,
      rareDiscovery: null,
      fruitShopPage: 0,
      collectionThemeId: sharedCollectionThemeId || this.storage.data.activeThemeId || 'fruit',
      tutorialStep: 0,
      mechanicIntro: null,
      dailyLogin: this.dailyLogin,
      fruitShopShareImage: '',
      friendRankMetric: 'total_points',
      friendRankCanvas: null,
      friendRankAvailable: this.friendRank.available,
      activeRareTimerId: '',
      featureIntro: '',
      storeSellPage: 0,
      storeSaleOffer: null,
      storePurchaseOffer: null,
      adCoinStatus: this.storage.getAdCoinStatus(),
      revivePanel: '',
      reviveExchangeOffer: null,
      boosterChoice: null,
      missedCollectible: null,
      decorationChoice: this.storage.data.pendingDecorationNode || 0,
      baseDecorOpen: false,
      reviveEligibleNewcomer: 0,
      resumeCountdown: 0,
      adPlaying: false,
      pendingLevelToast: ''
    };
    this.pendingBooster = null;
    this.resumeCountdownStartedAt = 0;
    this.wasPlayingWhenHidden = false;

    this.share.setup(() => this.getShareContext());
    this.friendRank.sync(this.storage.data);
    this._bindEvents();
  }

  start() {
    if (this.running) return this;
    this.running = true;
    this.lastFrameAt = Date.now();
    this.analytics.report('app_launch', {
      version: CONFIG.VERSION,
      challenge: Boolean(this.view.challenge)
    });
    if (this.view.challenge) {
      this.renderer.showToast(`好友发来第 ${this.view.challenge.level} 关挑战`);
    } else if (this.view.screen === 'fruit_shop') {
      this.renderer.showToast('好友邀请你来参观奇趣藏馆');
      this._refreshFruitShopShareImage();
    } else if (this.dailyLogin && this.dailyLogin.claimed) {
      const ticketText = this.dailyLogin.rescueTicketBonus ? '，救援券 +1' : '';
      this.renderer.showToast(`连续签到第 ${this.dailyLogin.day} 天，金币 +${this.dailyLogin.reward}${ticketText}`);
    }
    this._loop();
    return this;
  }

  stop() {
    this.running = false;
    if (this.rafId != null) this.platform.cancelAnimationFrame(this.rafId);
    this.rafId = null;
    if (this.interstitialTimer != null) clearTimeout(this.interstitialTimer);
    this.interstitialTimer = null;
    this.audio.pauseMusic();
  }

  _bindEvents() {
    this.platform.onTouchStart((event) => {
      const touch = event && event.touches && event.touches[0];
      if (!touch) return;
      this.audio.unlock();
      const point = this.renderer.toDesignPoint(touch.clientX, touch.clientY);
      const region = this.renderer.hitTest(point.x, point.y);
      this.touchStart = {
        x: point.x,
        y: point.y,
        lastX: point.x,
        lastY: point.y,
        moved: 0,
        region: region ? { action: region.action, data: region.data && Object.assign({}, region.data) } : null
      };
    });

    this.platform.onTouchMove((event) => {
      if (!this.touchStart) return;
      const touch = event && event.touches && event.touches[0];
      if (!touch) return;
      const point = this.renderer.toDesignPoint(touch.clientX, touch.clientY);
      const dx = point.x - this.touchStart.x;
      const dy = point.y - this.touchStart.y;
      this.touchStart.lastX = point.x;
      this.touchStart.lastY = point.y;
      this.touchStart.moved = Math.max(this.touchStart.moved, Math.sqrt(dx * dx + dy * dy));
    });

    this.platform.onTouchEnd((event) => {
      const start = this.touchStart;
      this.touchStart = null;
      if (!start) return;
      const touch = event && event.changedTouches && event.changedTouches[0];
      if (!touch) return;
      const point = this.renderer.toDesignPoint(touch.clientX, touch.clientY);
      const dx = point.x - start.x;
      const dy = point.y - start.y;
      const gestureDistance = Math.max(start.moved || 0, Math.sqrt(dx * dx + dy * dy));
      if (gestureDistance > 32) {
        if (this.view.screen === 'fruit_shop' && Math.abs(dx) >= 54 && Math.abs(dx) > Math.abs(dy) * 1.08) {
          this._changeFruitShopPage(dx < 0 ? 1 : -1);
        } else if (this.view.screen === 'friend_rank' && Math.abs(dy) >= 42 && Math.abs(dy) > Math.abs(dx)) {
          this.friendRank.scroll(-dy);
        }
        return;
      }
      // 移动卡片以 touch-start 时的身份为准，避免按下后卡片移到邻位，
      // touch-end 却误选了另一件商品。普通按钮仍以松手位置为准。
      const region = start.region && start.region.action === 'stack'
        ? start.region
        : this.renderer.hitTest(point.x, point.y);
      if (!region) return;
      Promise.resolve(this.handleAction(region.action, region.data, point)).catch((error) => {
        this.platform.log('[action:error]', error && error.stack || error);
        this.busy = false;
        this.renderer.showToast('操作失败，请再试一次');
      });
    });

    this.platform.onHide(() => {
      this.wasPlayingWhenHidden = Boolean(this.view.screen === 'game' && this.model && this.model.status === 'playing');
      this.hidden = true;
      this.audio.pauseMusic();
    });

    this.platform.onShow(() => {
      this.hidden = false;
      this.lastFrameAt = Date.now();
      this.audio.playMusic();
      if (this.wasPlayingWhenHidden && this.view.screen === 'game' && this.model && this.model.status === 'playing' && this.view.overlay == null) {
        this._startResumeCountdown();
      }
      this.wasPlayingWhenHidden = false;
    });

    if (typeof this.platform.onResize === 'function') {
      this.platform.onResize(() => {
        this.renderer.resize();
        this.lastFrameAt = Date.now();
      });
    }
  }

  _loop() {
    if (!this.running) return;
    const now = Date.now();
    const deltaMs = Math.max(0, Math.min(100, now - this.lastFrameAt));
    this.lastFrameAt = now;

    if (!this.hidden) {
      this.renderer.update(deltaMs);
      this._updateResumeCountdown(now);
      if (this.view.screen === 'game' && this.model) {
        const guidedTutorialActive = this.view.tutorialStep > 0;
        const blockingModal = Boolean(
          this.view.overlay != null || this.view.helpOpen || guidedTutorialActive || this.busy ||
          this.view.boosterChoice || this.view.missedCollectible || this.view.decorationChoice ||
          this.view.revivePanel
        );
        const timerEvents = this.model.tick(deltaMs, {
          // 新手需要先看懂光圈和目标再操作。三步手把手引导期间暂停关卡
          // 倒计时，避免玩家认真阅读反而输掉第一局；已经出现的闪耀藏品
          // 仍由 GameModel 独立计时，不受这里影响。
          pauseLevelTimer: blockingModal,
          allowCollectibleStart: !blockingModal
        });
        this._handleTimerEvents(timerEvents);
        this._handleTerminalState();
      }
      this.view.rewardAvailable = this._canOfferReward();
      this.renderer.draw(this.view, this.model, this.storage.data);
    }

    this.rafId = this.platform.requestAnimationFrame(() => this._loop());
  }

  _startResumeCountdown() {
    if (!this.model || this.model.status !== 'playing') return false;
    this.view.overlay = 'countdown';
    this.view.resumeCountdown = 3;
    this.resumeCountdownStartedAt = Date.now();
    this.lastFrameAt = Date.now();
    return true;
  }

  _updateResumeCountdown(now) {
    if (this.view.overlay !== 'countdown') return;
    const elapsed = Math.max(0, Number(now) - this.resumeCountdownStartedAt);
    const value = 3 - Math.floor(elapsed / 700);
    this.view.resumeCountdown = Math.max(1, value);
    if (elapsed < 2100) return;
    this.view.resumeCountdown = 0;
    this.view.overlay = null;
    this.lastFrameAt = Date.now();
  }

  handleAction(action, data, point) {
    if (!this._isActionAllowed(action)) return false;

    if (action !== 'stack') this.audio.play('tap');

    switch (action) {
      case 'play':
        this.startNormalLevel(this.storage.getActiveLevel());
        break;
      case 'daily':
        if (!isFeatureUnlocked(this.storage.data, 'daily')) {
          this.renderer.showToast('继续主线即可开启今日挑战');
        } else if (!this.storage.hasSeenMechanic('daily_mode')) {
          this.view.featureIntro = 'daily';
        } else {
          this.startDailyLevel();
        }
        break;
      case 'challenge':
        this.startChallenge();
        break;
      case 'share':
        return this._shareCurrentView();
      case 'fruit_shop':
        if (!isFeatureUnlocked(this.storage.data, 'museum')) {
          this.renderer.showToast('首次发现闪耀藏品后开启藏馆');
        } else if (!this.storage.hasSeenMechanic('museum')) {
          this.view.featureIntro = 'museum';
        } else {
          this.showFruitShop();
        }
        break;
      case 'store':
        if (!isFeatureUnlocked(this.storage.data, 'store')) {
          this.renderer.showToast('继续闯关即可开启补给商店');
        } else if (!this.storage.hasSeenMechanic('store')) {
          this.view.featureIntro = 'store';
        } else {
          this.showStore();
        }
        break;
      case 'feature_intro_continue':
        this._continueFeatureIntro();
        break;
      case 'feature_intro_close':
        this.view.featureIntro = '';
        break;
      case 'friend_rank':
        this.showFriendRank('total_points');
        break;
      case 'friend_rank_score':
        this._changeFriendRankMetric('total_points');
        break;
      case 'friend_rank_collection':
        this._changeFriendRankMetric('collection_count');
        break;
      case 'back_home':
        this.showHome();
        break;
      case 'fruit_detail':
        this._showFruitDetail(data && data.id);
        break;
      case 'fruit_page_prev':
        this._changeFruitShopPage(-1);
        break;
      case 'fruit_page_next':
        this._changeFruitShopPage(1);
        break;
      case 'collection_theme_prev':
        this._changeCollectionTheme(-1);
        break;
      case 'collection_theme_next':
        this._changeCollectionTheme(1);
        break;
      case 'store_sell_prev':
        this._changeStoreSellPage(-1);
        break;
      case 'store_sell_next':
        this._changeStoreSellPage(1);
        break;
      case 'store_sell_request':
        this._requestStoreSell(data && data.id);
        break;
      case 'store_sell_confirm':
        this._confirmStoreSell();
        break;
      case 'store_sell_cancel':
        this.view.storeSaleOffer = null;
        break;
      case 'store_buy':
        this._requestStorePurchase(data && data.id);
        break;
      case 'store_purchase_dec':
        this._adjustStorePurchase(-1);
        break;
      case 'store_purchase_inc':
        this._adjustStorePurchase(1);
        break;
      case 'store_purchase_confirm':
        this._confirmStorePurchase();
        break;
      case 'store_purchase_cancel':
        this.view.storePurchaseOffer = null;
        break;
      case 'store_ad_coins':
        return this._watchStoreCoinAd();
        break;
      case 'tutorial_start':
        this.view.overlay = null;
        this.view.tutorialStep = 1;
        this.storage.data.tutorialIntroSeen = true;
        this.storage.save();
        this.lastFrameAt = Date.now();
        this._showPendingLevelToast();
        break;
      case 'mechanic_continue': {
        const mechanic = this.view.mechanicIntro;
        if (mechanic) {
          if (mechanic.id === 'basic_target') this.storage.data.tutorialIntroSeen = true;
          const saved = this.storage.markMechanicSeen(mechanic.id);
          if (!saved && mechanic.id === 'basic_target') this.storage.save();
          this.analytics.report('mechanic_tutorial_complete', {
            mechanic_id: mechanic.id,
            level: this.model && this.model.level || mechanic.unlockLevel
          });
        }
        this.view.overlay = null;
        this.view.mechanicIntro = null;
        this.lastFrameAt = Date.now();
        this._showPendingLevelToast();
        break;
      }
      case 'rare_continue':
        this.view.overlay = null;
        this.view.rareDiscovery = null;
        this.lastFrameAt = Date.now();
        this._handleTerminalState();
        break;
      case 'toggle_sound':
        this._toggleSound();
        break;
      case 'toggle_music':
        this._toggleMusic();
        break;
      case 'help':
        this.view.helpOpen = true;
        this.analytics.report('help_open', { screen: this.view.screen });
        break;
      case 'close_help':
        this.view.helpOpen = false;
        break;
      case 'pause':
        return this._pauseLevel();
      case 'resume':
        this._startResumeCountdown();
        break;
      case 'toggle_motion':
        this._toggleReducedMotion();
        break;
      case 'quit':
        this._recordPendingFailure();
        this.showHome();
        break;
      case 'stack':
        this._selectStack(data && data.index, point, data && data.token);
        break;
      case 'hint':
        return this._useHint();
      case 'shuffle':
        return this._useShuffle();
      case 'auto_pack':
        return this._useAutoPack();
      case 'add_time':
        return this._useAddTime();
      case 'booster_coin':
        return this._confirmBoosterChoice('coins');
      case 'booster_ad':
        return this._confirmBoosterChoice('ad');
      case 'booster_cancel':
        this.view.boosterChoice = null;
        this.pendingBooster = null;
        break;
      case 'collectible_recover_coin':
        return this._recoverMissedCollectible('coins');
      case 'collectible_recover_ad':
        return this._recoverMissedCollectible('ad');
      case 'collectible_recover_skip':
        this.view.missedCollectible = null;
        this.lastFrameAt = Date.now();
        break;
      case 'decoration_warm':
        return this._chooseDecoration('warm');
      case 'decoration_fresh':
        return this._chooseDecoration('fresh');
      case 'base_decor_open':
        return this._openBaseDecor();
      case 'base_decor_warm':
        return this._applyBaseDecorStyle('warm');
      case 'base_decor_fresh':
        return this._applyBaseDecorStyle('fresh');
      case 'base_decor_close':
        this.view.baseDecorOpen = false;
        break;
      case 'revive':
        return this._openReviveChoice();
      case 'revive_ticket':
        return this._revive('ticket');
      case 'revive_ad':
        return this._revive('ad');
      case 'revive_coin':
        return this._revive('coins');
      case 'revive_exchange_confirm':
        return this._confirmReviveExchange();
      case 'revive_panel_close':
        this.view.revivePanel = '';
        this.view.reviveExchangeOffer = null;
        break;
      case 'revive_go_store':
        this._recordPendingFailure();
        this.storage.markMechanicSeen('store');
        this.showStore();
        break;
      case 'restart':
        this._recordPendingFailure();
        this.restartLevel();
        break;
      case 'next':
        return this._startNextLevel();
      case 'replay':
        this.restartLevel();
        break;
      case 'double_reward':
        return this._doubleReward();
      default:
        return false;
    }
    return true;
  }

  _isActionAllowed(action) {
    if (this.busy && action !== 'toggle_sound' && action !== 'toggle_music') return false;
    if (this.view.helpOpen) return action === 'close_help';
    if (this.view.featureIntro) {
      return action === 'feature_intro_continue' || action === 'feature_intro_close';
    }
    if (this.view.storeSaleOffer) {
      return action === 'store_sell_confirm' || action === 'store_sell_cancel';
    }
    if (this.view.storePurchaseOffer) {
      return [
        'store_purchase_dec', 'store_purchase_inc', 'store_purchase_confirm', 'store_purchase_cancel'
      ].indexOf(action) >= 0;
    }
    if (this.view.boosterChoice) {
      return ['booster_coin', 'booster_ad', 'booster_cancel'].indexOf(action) >= 0;
    }
    if (this.view.missedCollectible) {
      return ['collectible_recover_coin', 'collectible_recover_ad', 'collectible_recover_skip'].indexOf(action) >= 0;
    }
    if (this.view.decorationChoice) {
      return action === 'decoration_warm' || action === 'decoration_fresh';
    }
    if (this.view.baseDecorOpen) {
      return ['base_decor_warm', 'base_decor_fresh', 'base_decor_close'].indexOf(action) >= 0;
    }
    if (this.view.revivePanel) {
      if (this.view.revivePanel === 'exchange') {
        return action === 'revive_exchange_confirm' || action === 'revive_panel_close';
      }
      if (this.view.revivePanel === 'guide') {
        return action === 'revive_go_store' || action === 'revive_panel_close';
      }
      return ['revive_ticket', 'revive_ad', 'revive_coin', 'revive_panel_close'].indexOf(action) >= 0;
    }

    if (this.view.screen === 'home') {
      return [
        'play', 'daily', 'challenge', 'share', 'fruit_shop', 'store', 'friend_rank',
        'base_decor_open', 'toggle_sound', 'toggle_music', 'help'
      ].indexOf(action) >= 0;
    }

    if (this.view.screen === 'friend_rank') {
      return [
        'back_home', 'share', 'friend_rank_score', 'friend_rank_collection'
      ].indexOf(action) >= 0;
    }

    if (this.view.screen === 'fruit_shop') {
      return [
        'back_home', 'share', 'fruit_detail', 'fruit_page_prev', 'fruit_page_next',
        'collection_theme_prev', 'collection_theme_next'
      ].indexOf(action) >= 0;
    }

    if (this.view.screen === 'store') {
      return [
        'back_home', 'store_sell_prev', 'store_sell_next', 'store_sell_request', 'store_buy', 'store_ad_coins'
      ].indexOf(action) >= 0;
    }

    if (this.view.overlay === 'mechanic_intro') return action === 'mechanic_continue';
    if (this.view.overlay === 'tutorial_intro') return action === 'tutorial_start';
    if (this.view.overlay === 'pause') return action === 'resume' || action === 'quit' || action === 'toggle_motion';
    if (this.view.overlay === 'countdown') return false;
    if (this.view.overlay === 'rare') return action === 'rare_continue' || action === 'share';
    if (this.view.overlay === 'win') {
      return ['next', 'replay', 'share', 'double_reward', 'quit'].indexOf(action) >= 0;
    }
    if (this.view.overlay === 'fail') {
      return ['revive', 'restart', 'share', 'quit'].indexOf(action) >= 0;
    }
    return ['stack', 'hint', 'shuffle', 'auto_pack', 'add_time', 'pause', 'help'].indexOf(action) >= 0;
  }

  startNormalLevel(level, options) {
    const opts = options || {};
    const themeId = opts.themeId || this.storage.data.activeThemeId || 'fruit';
    const targetLevel = Math.max(1, Math.floor(Number(level) || this.storage.getThemeLevel(themeId)));
    const config = generateLevel(targetLevel, {
      themeId,
      accountProgress: Math.max(getAccountProgressLevel(this.storage.data), (this.storage.data.firstClearCount || 0) + 1),
      seed: opts.seed,
      variant: opts.variant || 0,
      collection: this.storage.data.rareFruits,
      pity: this.storage.data.themePity[themeId] || 0
    });
    this._beginLevel(config, {
      source: opts.source || 'normal',
      challengeScore: opts.challengeScore || 0
    });
  }

  startDailyLevel(options) {
    const opts = options || {};
    const themeId = opts.themeId || this.storage.data.activeThemeId || 'fruit';
    const config = opts.seed == null
      ? getDailyLevel(undefined, {
        themeId,
        accountProgress: Math.max(getAccountProgressLevel(this.storage.data), (this.storage.data.firstClearCount || 0) + 1),
        collection: this.storage.data.rareFruits,
        pity: this.storage.data.themePity[themeId] || 0
      })
      : generateLevel(opts.level || 24, {
        daily: true,
        themeId,
        accountProgress: Math.max(getAccountProgressLevel(this.storage.data), (this.storage.data.firstClearCount || 0) + 1),
        seed: opts.seed,
        collection: this.storage.data.rareFruits,
        pity: this.storage.data.themePity[themeId] || 0
      });
    this._beginLevel(config, {
      source: opts.source || 'daily',
      challengeScore: opts.challengeScore || 0
    });
  }

  startChallenge() {
    const challenge = this.view.challenge;
    if (!challenge) {
      this.renderer.showToast('暂时没有新的好友挑战');
      return;
    }
    this.view.challenge = null;
    if (challenge.daily) {
      this.startDailyLevel({
        themeId: challenge.themeId,
        level: challenge.level,
        seed: challenge.seed,
        challengeScore: challenge.score,
        source: 'friend_challenge'
      });
    } else {
      this.startNormalLevel(challenge.level, {
        themeId: challenge.themeId,
        seed: challenge.seed,
        challengeScore: challenge.score,
        source: 'friend_challenge'
      });
    }
  }

  _beginLevel(config, runInfo) {
    this.runId += 1;
    if (typeof this.renderer.clearTransientEffects === 'function') this.renderer.clearTransientEffects();
    this.currentConfig = config;
    this.currentRun = Object.assign({ source: 'normal', challengeScore: 0 }, runInfo || {});
    this.model = new GameModel(config);
    if (!config.daily && this.currentRun.source !== 'restart' && this.currentRun.source !== 'friend_challenge') {
      this.storage.recordCollectibleRoll(config.themeId, config.level, Boolean(config.collectibleId));
    }
    this.resultRecorded = false;
    this.view.screen = 'game';
    const needsTutorial = !config.daily && config.themeId === 'fruit' && config.level === 1 &&
      (this.storage.data.tutorialVersion || 0) < CONFIG.TUTORIAL_VERSION &&
      this.currentRun.source !== 'friend_challenge';
    // 第 1 关使用更直观的“目标 → 顶层 → 装满”图形教学，不再先叠加
    // 一层文字较多的通用机制弹窗。后续新机制仍按关卡逐步教学。
    const scheduledMechanic = needsTutorial
      ? null
      : getMechanicForLevel(config.level, this.storage.data.seenMechanics, {
        daily: config.daily,
        challenge: this.currentRun.source === 'friend_challenge'
      });
    const collectionTargetMechanic = !scheduledMechanic && !config.daily && config.promotedCollectibleTargetId
      ? getCollectionTargetMechanic(
        config.level,
        this.storage.data.seenMechanics,
        COLLECTIBLE_MAP[config.promotedCollectibleTargetId]
      )
      : null;
    const mechanicIntro = scheduledMechanic || collectionTargetMechanic;
    this.view.mechanicIntro = mechanicIntro;
    this.view.overlay = mechanicIntro
      ? 'mechanic_intro'
      : (needsTutorial && !this.storage.data.tutorialIntroSeen ? 'tutorial_intro' : null);
    this.view.helpOpen = false;
    this.view.result = null;
    this.view.doubleClaimed = false;
    this.view.rareDiscovery = null;
    this.view.activeRareTimerId = '';
    this.view.tutorialStep = needsTutorial ? 1 : 0;
    this.view.featureIntro = '';
    this.view.storeSaleOffer = null;
    this.view.storePurchaseOffer = null;
    this.view.revivePanel = '';
    this.view.reviveExchangeOffer = null;
    this.view.boosterChoice = null;
    this.view.missedCollectible = null;
    this.view.decorationChoice = 0;
    this.view.baseDecorOpen = false;
    this.view.resumeCountdown = 0;
    this.pendingBooster = null;
    this.view.reviveEligibleNewcomer = 0;
    const levelNotices = [];
    const newItem = config.newItemId ? getItemById(config.newItemId) : null;
    const promotedCollectible = config.promotedCollectibleTargetId
      ? COLLECTIBLE_MAP[config.promotedCollectibleTargetId]
      : null;
    if (newItem) levelNotices.push(`新物品 · ${newItem.name}`);
    if (promotedCollectible && (!mechanicIntro || mechanicIntro.id !== 'collection_target')) {
      levelNotices.push(`闪耀目标 · ${promotedCollectible.name}`);
    }
    this.view.pendingLevelToast = levelNotices.join('  ·  ');
    this.lastFrameAt = Date.now();
    this.analytics.report('level_start', {
      level: config.level,
      theme_id: config.themeId,
      daily: Boolean(config.daily),
      seed: config.seed,
      source: this.currentRun.source
    });
    if (promotedCollectible) {
      this.analytics.report('collection_target_start', {
        level: config.level,
        theme_id: config.themeId,
        collectible_id: promotedCollectible.id
      });
    }
    if (mechanicIntro) {
      this.analytics.report('mechanic_tutorial_show', {
        mechanic_id: mechanicIntro.id,
        level: config.level,
        theme_id: config.themeId
      });
    }
    if (this.currentRun.challengeScore > 0) {
      this.renderer.showToast(`好友成绩 ${this.currentRun.challengeScore}，来超越 TA！`);
    } else if (!needsTutorial && !mechanicIntro && !config.daily) {
      const journey = getJourneyInfo(config.level, config.themeId);
      if (journey.endless && (journey.wave === 1 || (journey.wave - 1) % 20 === 0)) {
        this.renderer.showToast(`${journey.title} · ${journey.subtitle}`);
      }
    }
    if (this.view.overlay == null) this._showPendingLevelToast();
  }

  restartLevel() {
    if (!this.currentConfig) return;
    const runInfo = Object.assign({}, this.currentRun, { source: 'restart' });
    this._beginLevel(this.currentConfig, runInfo);
  }

  async _startNextLevel() {
    const result = this.view.result || (this.model && this.model.getResult());
    if (!result) return;
    if (!result.daily && this.ads && typeof this.ads.showInterstitial === 'function') {
      this.busy = true;
      await this.ads.showInterstitial(result.level, { suppress: Boolean(result.truckChest) });
      this.busy = false;
    }
    const activeThemeId = this.storage.data.activeThemeId || result.themeId || 'fruit';
    if (activeThemeId !== result.themeId) {
      this.renderer.showToast(`新主题已开启 · ${getTheme(activeThemeId).name}`);
      this.startNormalLevel(this.storage.getThemeLevel(activeThemeId), { themeId: activeThemeId });
      return;
    }
    this.startNormalLevel(result.level + 1, { themeId: result.themeId });
  }

  showHome() {
    this.runId += 1;
    if (typeof this.renderer.clearTransientEffects === 'function') this.renderer.clearTransientEffects();
    this.friendRank.hide();
    this.friendRank.sync(this.storage.data);
    this.model = null;
    this.currentConfig = null;
    this.currentRun = null;
    this.resultRecorded = false;
    this.view.screen = 'home';
    this.view.overlay = null;
    this.view.helpOpen = false;
    this.view.result = null;
    this.view.doubleClaimed = false;
    this.view.rareDiscovery = null;
    this.view.activeRareTimerId = '';
    this.view.mechanicIntro = null;
    this.view.featureIntro = '';
    this.view.storeSaleOffer = null;
    this.view.storePurchaseOffer = null;
    this.view.revivePanel = '';
    this.view.reviveExchangeOffer = null;
    this.view.boosterChoice = null;
    this.view.missedCollectible = null;
    this.view.decorationChoice = 0;
    this.view.baseDecorOpen = false;
    this.view.resumeCountdown = 0;
    this.pendingBooster = null;
    this.view.tutorialStep = 0;
    this.view.pendingLevelToast = '';
    this.lastFrameAt = Date.now();
  }

  _showPendingLevelToast() {
    const message = this.view && this.view.pendingLevelToast || '';
    if (!message) return false;
    this.view.pendingLevelToast = '';
    this.renderer.showToast(message);
    return true;
  }

  _continueFeatureIntro() {
    const feature = this.view.featureIntro;
    if (!feature) return false;
    const mechanicId = feature === 'daily' ? 'daily_mode' : feature;
    this.storage.markMechanicSeen(mechanicId);
    this.view.featureIntro = '';
    if (feature === 'daily') this.startDailyLevel();
    else if (feature === 'museum') this.showFruitShop();
    else if (feature === 'store') this.showStore();
    return true;
  }

  showFruitShop() {
    this.runId += 1;
    if (typeof this.renderer.clearTransientEffects === 'function') this.renderer.clearTransientEffects();
    this.friendRank.hide();
    this.model = null;
    this.currentConfig = null;
    this.currentRun = null;
    this.view.screen = 'fruit_shop';
    this.view.overlay = null;
    this.view.helpOpen = false;
    this.view.result = null;
    this.view.rareDiscovery = null;
    this.view.mechanicIntro = null;
    this.view.featureIntro = '';
    this.view.storeSaleOffer = null;
    this.view.storePurchaseOffer = null;
    this.view.revivePanel = '';
    this.view.reviveExchangeOffer = null;
    this.view.pendingLevelToast = '';
    const lastCollectible = COLLECTIBLE_MAP[this.storage.data.lastCollectibleId || this.storage.data.lastRareFruitId] || null;
    const selectedThemeId = lastCollectible && this.storage.data.unlockedThemes.indexOf(lastCollectible.themeId) >= 0
      ? lastCollectible.themeId
      : (this.storage.data.activeThemeId || 'fruit');
    this.view.collectionThemeId = selectedThemeId;
    const themeCollectibles = getThemeCollectibles(selectedThemeId);
    const lastIndex = lastCollectible && lastCollectible.themeId === selectedThemeId
      ? themeCollectibles.findIndex((collectible) => collectible.id === lastCollectible.id)
      : -1;
    this.view.fruitShopPage = Math.max(0, Math.floor((lastIndex < 0 ? 0 : lastIndex) / 6));
    this.lastFrameAt = Date.now();
    this.analytics.report('fruit_shop_open', {
      theme_id: selectedThemeId,
      discovered: countDiscoveredCollectibles(this.storage.data.rareFruits, selectedThemeId)
    });
    this._refreshFruitShopShareImage();
  }

  showStore() {
    this.runId += 1;
    if (typeof this.renderer.clearTransientEffects === 'function') this.renderer.clearTransientEffects();
    this.friendRank.hide();
    this.model = null;
    this.currentConfig = null;
    this.currentRun = null;
    this.resultRecorded = false;
    this.view.screen = 'store';
    this.view.overlay = null;
    this.view.helpOpen = false;
    this.view.result = null;
    this.view.rareDiscovery = null;
    this.view.mechanicIntro = null;
    this.view.featureIntro = '';
    this.view.storeSellPage = 0;
    this.view.storeSaleOffer = null;
    this.view.storePurchaseOffer = null;
    this.view.adCoinStatus = this.storage.getAdCoinStatus();
    this.view.revivePanel = '';
    this.view.reviveExchangeOffer = null;
    this.view.pendingLevelToast = '';
    this.lastFrameAt = Date.now();
    this.analytics.report('store_open', {
      coins: this.storage.data.coins || 0,
      collection_value: this.storage.getCollectionValue()
    });
  }

  _changeStoreSellPage(delta) {
    const owned = Object.keys(this.storage.data.rareFruits || {}).filter((id) => {
      const entry = this.storage.data.rareFruits[id];
      return entry && (entry.owned == null ? entry.count : entry.owned) > 0;
    });
    const pages = Math.max(1, Math.ceil(owned.length / 3));
    this.view.storeSellPage = (this.view.storeSellPage + delta + pages) % pages;
  }

  _requestStoreSell(id) {
    const collectible = COLLECTIBLE_MAP[id];
    const entry = this.storage.data.rareFruits[id];
    const owned = entry && (entry.owned == null ? entry.count : entry.owned) || 0;
    if (!collectible || owned <= 0) {
      this.renderer.showToast('这件藏品已经没有可出售库存');
      return false;
    }
    this.view.storeSaleOffer = {
      id,
      collectible,
      owned,
      value: getCollectibleSellValue(collectible)
    };
    return true;
  }

  _confirmStoreSell() {
    const offer = this.view.storeSaleOffer;
    if (!offer) return false;
    const result = this.storage.sellCollectible(offer.id, 1);
    this.view.storeSaleOffer = null;
    if (!result.sold) {
      this.renderer.showToast('藏品库存发生变化，请重新选择');
      return false;
    }
    this.audio.play('pack');
    this.renderer.burst(this.renderer.width / 2, this.renderer.height * 0.42, CONFIG.COLORS.gold, 14);
    this.renderer.showToast(`回收完成 · 金币 +${result.coins}`);
    this.analytics.report('collectible_sell', {
      collectible_id: offer.id,
      rarity: offer.collectible.rarity,
      coins: result.coins
    });
    this._syncFriendRank();
    return true;
  }

  _getStoreProductOwned(id) {
    if (id === 'rescue_ticket') return Math.max(0, this.storage.data.rescueTickets || 0);
    if (id === 'pause_ticket') return this.storage.getPauseTicketCount();
    if (typeof id === 'string' && id.indexOf('voucher_') === 0) {
      return this.storage.getBoosterVoucherCount(id.slice('voucher_'.length));
    }
    return 0;
  }

  _requestStorePurchase(id) {
    const definition = getStoreProductDefinition(id);
    if (!definition) return false;
    const owned = this._getStoreProductOwned(id);
    const maxQuantity = Math.max(0, Math.min(
      MAX_STORE_PURCHASE_QUANTITY,
      Math.max(0, (definition.maxOwned || MAX_STORE_PURCHASE_QUANTITY) - owned)
    ));
    if (!maxQuantity) {
      this.renderer.showToast('这项补给已经装满');
      return false;
    }
    this.view.storePurchaseOffer = {
      product: definition,
      quantity: 1,
      maxQuantity,
      owned
    };
    return true;
  }

  _adjustStorePurchase(delta) {
    const offer = this.view.storePurchaseOffer;
    if (!offer) return false;
    offer.quantity = Math.max(1, Math.min(offer.maxQuantity, offer.quantity + delta));
    return true;
  }

  _confirmStorePurchase() {
    const offer = this.view.storePurchaseOffer;
    if (!offer || !offer.product) return false;
    const result = this.storage.buyStoreProduct(offer.product.id, offer.quantity);
    if (!result.bought) {
      if (result.reason === 'max') this.renderer.showToast('持有数量已达到上限');
      else this.renderer.showToast(`金币不足 · 还差 ${Math.max(0, (result.cost || 0) - (this.storage.data.coins || 0))}`);
      return false;
    }
    this.view.storePurchaseOffer = null;
    this.audio.play('pack');
    this.platform.vibrate(false);
    this.renderer.burst(this.renderer.width / 2, this.renderer.height * 0.62, CONFIG.COLORS.gold, 14);
    this.renderer.showToast(`${offer.product.label} ×${result.quantity || 1} 已放入背包`);
    this.analytics.report('store_buy', {
      product_id: offer.product.id,
      quantity: result.quantity || 1,
      cost: result.cost || 0
    });
    this._syncFriendRank();
    return true;
  }

  _watchStoreCoinAd() {
    const status = this.storage.getAdCoinStatus();
    this.view.adCoinStatus = status;
    if (!status.remaining) {
      this.renderer.showToast('今天的视频金币已经领完');
      return false;
    }
    if (!this._canOfferReward()) {
      this.renderer.showToast('广告功能筹备中，不影响正常闯关');
      return false;
    }
    return this._runReward('store_coins', () => {
      const result = this.storage.claimAdCoinReward();
      this.view.adCoinStatus = result.status || this.storage.getAdCoinStatus();
      if (!result.claimed) {
        this.renderer.showToast('今天的视频金币已经领完');
        return;
      }
      this.audio.play('pack');
      this.renderer.burst(this.renderer.width / 2, this.renderer.height * 0.38, CONFIG.COLORS.gold, 16);
      this.renderer.showToast(`金币 +${result.coins}`);
      this.analytics.report('store_ad_coins', { coins: result.coins, viewed: this.view.adCoinStatus.viewed });
      this._syncFriendRank();
    });
  }

  _syncFriendRank() {
    if (!this.friendRank || typeof this.friendRank.sync !== 'function') return;
    try {
      const pending = this.friendRank.sync(this.storage.data);
      if (pending && typeof pending.catch === 'function') pending.catch(() => false);
    } catch (_) {}
  }

  _getFriendRankViewportSize() {
    const layout = this.renderer && typeof this.renderer.getFriendRankViewport === 'function'
      ? this.renderer.getFriendRankViewport()
      : null;
    return {
      width: Math.max(320, Math.floor(Number(layout && layout.viewportWidth) || 614)),
      height: Math.max(400, Math.floor(Number(layout && layout.viewportHeight) || 820))
    };
  }

  showFriendRank(metric) {
    this.runId += 1;
    if (typeof this.renderer.clearTransientEffects === 'function') this.renderer.clearTransientEffects();
    this.model = null;
    this.currentConfig = null;
    this.currentRun = null;
    this.view.screen = 'friend_rank';
    this.view.overlay = null;
    this.view.helpOpen = false;
    this.view.result = null;
    this.view.rareDiscovery = null;
    this.view.mechanicIntro = null;
    this.view.featureIntro = '';
    this.view.storeSaleOffer = null;
    this.view.storePurchaseOffer = null;
    this.view.revivePanel = '';
    this.view.reviveExchangeOffer = null;
    this.view.friendRankMetric = metric === 'collection_count' ? 'collection_count' : 'total_points';
    this.friendRank.sync(this.storage.data);
    const viewport = this._getFriendRankViewportSize();
    this.view.friendRankCanvas = this.friendRank.show(this.view.friendRankMetric, viewport.width, viewport.height);
    this.view.friendRankAvailable = this.friendRank.available;
    this.lastFrameAt = Date.now();
    this.analytics.report('friend_rank_open', { metric: this.view.friendRankMetric });
  }

  _changeFriendRankMetric(metric) {
    this.view.friendRankMetric = metric === 'collection_count' ? 'collection_count' : 'total_points';
    const viewport = this._getFriendRankViewportSize();
    this.view.friendRankCanvas = this.friendRank.show(this.view.friendRankMetric, viewport.width, viewport.height);
    this.analytics.report('friend_rank_switch', { metric: this.view.friendRankMetric });
  }

  _pauseLevel() {
    if (!this.model || this.model.status !== 'playing') return false;
    this.view.overlay = 'pause';
    this.analytics.report('level_pause', {
      level: this.model.level,
      source: 'free'
    });
    return true;
  }

  _selectStack(stackIndex, point, capturedToken) {
    if (!this.model || stackIndex == null) return;
    if (this.renderer.boardInputBlocked) {
      this.renderer.showToast('货架正在安全换道，请稍等');
      return;
    }
    if (capturedToken != null && (!this.model.stacks[stackIndex] || this.model.stacks[stackIndex][0] !== capturedToken)) {
      this.renderer.showToast('货物已换位，请重新点击');
      return;
    }
    if (this.view.tutorialStep > 0 && this.model.level === 1 && this.model.moves < 3) {
      const expected = this.model.getHint();
      if (expected >= 0 && stackIndex !== expected) {
        this.renderer.showHint(expected);
        this.renderer.showToast('先点金色光圈里的物件，它正好属于当前目标');
        return;
      }
    }
    const result = this.model.selectStack(stackIndex);
    if (!result.accepted) {
      if (result.reason === 'frozen') this.renderer.showToast(`冻结中 · ${(result.remainingMs / 1000).toFixed(1)} 秒`);
      else if (result.reason === 'protected') this.renderer.showToast('准备中，请看金色安全提示');
      return;
    }

    const x = point ? point.x : this.renderer.width / 2;
    const y = point ? point.y : this.renderer.height * 0.46;
    if (result.collectible) {
      this._handleCollectibleFound(result.collectible, x, y);
      return;
    } else if (result.sealBroken) {
      this.audio.play('place');
      this.platform.vibrate(false);
      this.renderer.burst(x, y, result.rule && result.rule.color || '#3E9FD6', 8);
      this.renderer.floatText('封条拆开，再点一次', x, y - 28, '#3E9FD6');
    } else if (result.matched) {
      this.audio.play('place');
      this.platform.vibrate(false);
      this.renderer.burst(x, y, result.item && result.item.color || CONFIG.COLORS.teal, 7);
      if (result.ruleEffect) {
        this.renderer.floatText(result.ruleEffect, x, y - 30, result.rule && result.rule.color || CONFIG.COLORS.tealDark);
        if (result.clearedCount > 0) this.renderer.burst(x, y, result.rule.color, 16);
      } else if (result.comboMilestone) {
        this.audio.play('combo');
        this.renderer.floatText(`${result.comboMilestone} 连击 · 黄金装箱 +3 秒`, x, y - 30, CONFIG.COLORS.goldDark);
        this.renderer.burst(x, y, CONFIG.COLORS.gold, 22);
      } else if (this.model.combo >= 3) {
        this.audio.play('combo');
        this.renderer.floatText(`${this.model.combo} 连击！`, x, y - 28, CONFIG.COLORS.coral);
      } else {
        this.renderer.floatText(`分数 +${result.pointsGained}`, x, y - 24, CONFIG.COLORS.tealDark);
      }
      if (result.safeHighlightStack >= 0) this.renderer.showHint(result.safeHighlightStack);
    } else {
      if (result.shieldUsed) {
        this.audio.play('place');
        this.platform.vibrate(false);
        this.renderer.burst(x, y, CONFIG.COLORS.teal, 12);
        this.renderer.floatText('护盾抵消误触', x, y - 24, CONFIG.COLORS.tealDark);
      } else {
        this.audio.play(result.warning ? 'tap' : 'fail');
        this.platform.vibrate(!result.warning);
        this.renderer.kickShake(result.bomb ? 16 : (result.warning ? 5 : 11));
        this.renderer.burst(x, y, CONFIG.COLORS.danger, result.bomb ? 22 : 10);
        this.renderer.floatText(
          result.bomb ? '炸弹！' : (result.warning ? '警告 · 时间 -8 秒' : '再次点错！'),
          x,
          y - 24,
          CONFIG.COLORS.danger
        );
      }
    }

    if (result.completed.length) {
      this.audio.play('pack');
      this.platform.vibrate(true);
      this.renderer.burst(this.renderer.width / 2, this.renderer.height - 330, CONFIG.COLORS.gold, 18);
      this.renderer.floatText(
        result.priorityBonus > 0
          ? `限步完成 +${result.priorityBonus}`
          : (result.completed.length > 1 ? `连装 ${result.completed.length} 箱！` : '目标完成 · 货架换位！'),
        this.renderer.width / 2,
        this.renderer.height - 360,
        CONFIG.COLORS.goldDark
      );
    }
    if (result.waveCompleted) {
      this.renderer.showToast(`第 ${result.waveCompleted} 波完成 · 检查点已保存`);
    }

    if (this.view.tutorialStep > 0 && this.model.level === 1) {
      if (result.completed.length) {
        this.view.tutorialStep = 0;
        this.storage.markMechanicSeen('basic_target');
        this.storage.setTutorialComplete(CONFIG.TUTORIAL_VERSION);
        this.renderer.showToast('学会啦！第一次点错会扣 8 秒，再错才失败');
      } else {
        this.view.tutorialStep = Math.min(3, this.model.moves + 1);
      }
    }

    this.analytics.report('item_select', {
      level: this.model.level,
      matched: result.matched,
      combo: this.model.combo,
      warning: Boolean(result.warning),
      shield_used: Boolean(result.shieldUsed),
      combo_milestone: result.comboMilestone || 0,
      wave_completed: result.waveCompleted || 0,
      failure_reason: result.failureReason || ''
    });
    this._handleTerminalState();
  }

  _handleCollectibleFound(collectible, x, y) {
    removeCollectibleFromLevel(this.currentConfig, collectible.id);
    const collection = this.storage.collectCollectible(collectible.id, this.model.level);
    if (!collection) return;
    const bonus = collection.coinBonus || 0;
    this.storage.addCoins(bonus);
    const coins = this.storage.data.coins || 0;
    const totalPoints = getTotalPoints(this.storage.data);
    const rankAfter = getPointRank(totalPoints);
    this.view.rareDiscovery = {
      collectible,
      fruit: collectible,
      isNew: collection.isNew,
      count: collection.count,
      bonus,
      points: collection.points,
      collectionPoints: collection.collectionPoints,
      fruitPoints: collection.collectionPoints,
      totalPoints,
      coins,
      rescueTicketBonus: collection.rescueTicketBonus,
      rankAfter,
      rankUp: rankAfter.index > collection.rankBefore.index,
      themeProgress: collection.themeProgress,
      themeCompleted: collection.themeCompleted,
      cosmeticTitle: collection.cosmeticTitle,
      unlockedTheme: collection.unlockedTheme
    };
    if (typeof this.renderer.clearToast === 'function') this.renderer.clearToast();
    this.view.overlay = 'rare';
    this.friendRank.sync(this.storage.data);
    this.audio.play('rare');
    this.platform.vibrate(true);
    this.renderer.burst(x, y, collectible.glow, 28);
    this.renderer.confetti();
    this.analytics.report('rare_fruit_found', {
      collectible_id: collectible.id,
      theme_id: collectible.themeId,
      rarity: collectible.rarity,
      level: this.model.level,
      first: collection.isNew,
      count: collection.count,
      points: collection.points
    });
    this._refreshFruitShopShareImage();
  }

  _showFruitDetail(id) {
    const collectible = COLLECTIBLE_MAP[id];
    if (!collectible) return;
    const selectedThemeId = this.view.collectionThemeId || this.storage.data.activeThemeId || 'fruit';
    if (collectible.themeId !== selectedThemeId) return;
    const entry = this.storage.data.rareFruits[id];
    if (entry) {
      const owned = entry.owned == null ? entry.count : entry.owned;
      this.renderer.showToast(`${collectible.name}  ×${owned}  ·  价值 ${getCollectibleSellValue(collectible)}`);
      return;
    }
    const level = this.storage.getThemeLevel(selectedThemeId);
    const visible = getVisibleCollectionEntries(selectedThemeId, this.storage.data.rareFruits, level, 4)
      .find((item) => item.collectible.id === id);
    if (!visible || visible.status === 'sealed') this.renderer.showToast('仍在封存 · 继续闯关');
    else this.renderer.showToast(`第 ${collectible.minLevel} 关起有机会遇见`);
  }

  _changeFruitShopPage(delta) {
    const direction = delta < 0 ? -1 : 1;
    const visibleThemes = getVisibleThemes(this.storage.data.unlockedThemes);
    const currentThemeId = this.view.collectionThemeId || this.storage.data.activeThemeId || 'fruit';
    const pageCountFor = (themeId) => (
      this.storage.data.unlockedThemes.indexOf(themeId) >= 0
        ? Math.max(1, Math.ceil(getThemeCollectibles(themeId).length / 6))
        : 1
    );
    let themeIndex = Math.max(0, visibleThemes.findIndex((theme) => theme.id === currentThemeId));
    let theme = visibleThemes[themeIndex];
    let pages = pageCountFor(theme.id);
    let page = Math.max(0, Math.min(pages - 1, Math.floor(Number(this.view.fruitShopPage) || 0)));

    if (direction > 0 && page < pages - 1) page += 1;
    else if (direction < 0 && page > 0) page -= 1;
    else {
      themeIndex = (themeIndex + direction + visibleThemes.length) % visibleThemes.length;
      theme = visibleThemes[themeIndex];
      pages = pageCountFor(theme.id);
      page = direction > 0 ? 0 : pages - 1;
      this.view.collectionThemeId = theme.id;
      this.view.fruitShopShareImage = '';
      this._refreshFruitShopShareImage();
    }

    this.view.collectionThemeId = theme.id;
    this.view.fruitShopPage = page;
    const unlocked = this.storage.data.unlockedThemes.indexOf(theme.id) >= 0;
    this.renderer.showToast(unlocked
      ? `${theme.name} · ${page + 1}/${pages}`
      : `${theme.name} · 完成上一主题后解锁`);
  }

  _changeCollectionTheme(delta) {
    const visibleThemes = getVisibleThemes(this.storage.data.unlockedThemes);
    const currentThemeId = this.view.collectionThemeId || this.storage.data.activeThemeId || 'fruit';
    const currentIndex = Math.max(0, visibleThemes.findIndex((theme) => theme.id === currentThemeId));
    const nextIndex = (currentIndex + delta + visibleThemes.length) % visibleThemes.length;
    const theme = visibleThemes[nextIndex];
    this.view.collectionThemeId = theme.id;
    this.view.fruitShopPage = 0;
    this.view.fruitShopShareImage = '';
    const unlocked = this.storage.data.unlockedThemes.indexOf(theme.id) >= 0;
    this.renderer.showToast(unlocked ? `${theme.name} · 可以查看` : `${theme.name} · 完成上一主题后解锁`);
    this._refreshFruitShopShareImage();
  }

  async _refreshFruitShopShareImage() {
    try {
      const imageUrl = await this.renderer.createFruitShopShareImage(
        this.storage.data,
        this.view.collectionThemeId || this.storage.data.activeThemeId || 'fruit'
      );
      this.view.fruitShopShareImage = imageUrl || '';
      return imageUrl;
    } catch (error) {
      this.platform.log('[fruit-shop-share:error]', error && error.message || error);
      return '';
    }
  }

  async _shareCurrentView() {
    if ((this.view.screen === 'fruit_shop' || this.view.overlay === 'rare') && !this.view.fruitShopShareImage) {
      await this._refreshFruitShopShareImage();
    }
    return this.share.shareNow(this.getShareContext());
  }

  _handleTerminalState() {
    if (!this.model || this.view.screen !== 'game') return;
    if (this.model.status === 'won' && this.view.overlay !== 'win') this._showWin();
    else if (this.model.status === 'failed' && this.view.overlay !== 'fail') this._showFail();
  }

  _handleTimerEvents(events) {
    if (!this.model) return;
    const active = this.model.getActiveCollectibleTimer();
    if (active && this.view.activeRareTimerId !== active.id) {
      this.view.activeRareTimerId = active.id;
      this.audio.play('rare');
      this.platform.vibrate(false);
      this.renderer.showToast('闪耀藏品出现！6 秒内点中它');
      this.analytics.report('collectible_countdown_start', {
        collectible_id: active.id,
        level: this.model.level
      });
    }
    if (!active && !(events && events.collectibleExpired)) this.view.activeRareTimerId = '';
    if (events && events.collectibleExpired) {
      const expired = events.collectibleExpired;
      this.view.activeRareTimerId = '';
      if (this.currentConfig) removeCollectibleFromLevel(this.currentConfig, expired.id);
      this.audio.play('fail');
      this.view.missedCollectible = {
        collectible: expired.collectible,
        cost: 400,
        rewardAvailable: this._canOfferReward()
      };
      this.analytics.report('collectible_countdown_expire', {
        collectible_id: expired.id,
        level: this.model.level
      });
    }
  }

  _recoverMissedCollectible(source) {
    const offer = this.view.missedCollectible;
    const collectible = offer && offer.collectible;
    if (!collectible || !this.model) return false;
    const expectedRunId = this.runId;
    const apply = (paymentSource) => {
      if (this.runId !== expectedRunId || !this.model) return false;
      const collection = this.storage.collectCollectible(collectible.id, this.model.level);
      if (!collection) return false;
      if (collection.coinBonus) this.storage.addCoins(collection.coinBonus);
      this.view.missedCollectible = null;
      this.audio.play('rare');
      this.renderer.confetti();
      this.renderer.showToast(`${collectible.name} 已追回并收入藏馆`);
      this.analytics.report('collectible_recover', {
        collectible_id: collectible.id,
        level: this.model.level,
        source: paymentSource
      });
      this._syncFriendRank();
      return true;
    };
    if (source === 'coins') {
      if (!this.storage.spendCoins(400)) {
        this.renderer.showToast('金币不足，可选择视频追回或放弃');
        return false;
      }
      return apply('coins');
    }
    if (source === 'ad' && this._canOfferReward()) {
      return this._runReward('collectible_recover', () => apply('rewarded_video'));
    }
    this.renderer.showToast('视频暂时不可用');
    return false;
  }

  _chooseDecoration(style) {
    if (!this.view.decorationChoice) return false;
    if (!this.storage.chooseWarehouseDecoration(style)) return false;
    this.view.decorationChoice = 0;
    this.renderer.confetti();
    const name = style === 'fresh' ? '清新薄荷架' : '暖光木架';
    this.renderer.showToast(`已应用到首页：${name}`);
    this.analytics.report('base_decor_choose', {
      style: style === 'fresh' ? 'fresh' : 'warm',
      unlocked: this.storage.data.warehouseDecorations.length
    });
    return true;
  }

  _openBaseDecor() {
    const decorations = Array.isArray(this.storage.data.warehouseDecorations)
      ? this.storage.data.warehouseDecorations
      : [];
    if (!decorations.length) {
      this.renderer.showToast(`累计 ${CONFIG.SHOP_NODE_STARS} 颗星后解锁第 1 个基地装饰`);
      return false;
    }
    this.view.baseDecorOpen = true;
    this.analytics.report('base_decor_open', {
      unlocked: decorations.length,
      style: this.storage.data.warehouseStyle || 'warm'
    });
    return true;
  }

  _applyBaseDecorStyle(style) {
    const choice = style === 'fresh' ? 'fresh' : 'warm';
    if (!this.storage.setWarehouseStyle(choice)) {
      this.renderer.showToast('该风格尚未解锁，下次装饰奖励可选择');
      return false;
    }
    const name = choice === 'fresh' ? '清新薄荷架' : '暖光木架';
    this.renderer.showToast(`首页已切换为${name}`);
    this.analytics.report('base_decor_apply', { style: choice });
    return true;
  }

  _showWin() {
    const result = this.model.getResult();
    const challengeScore = this.currentRun && this.currentRun.challengeScore || 0;
    result.challenge = Boolean(this.currentRun && this.currentRun.source === 'friend_challenge');
    if (challengeScore > 0) {
      result.challengeScore = challengeScore;
      result.challengeBeat = result.score > challengeScore;
    }
    if (typeof this.renderer.clearToast === 'function') this.renderer.clearToast();
    this.view.result = result;
    this.view.overlay = 'win';
    const rewards = this.storage.recordResult(result);
    result.streakBonus = rewards && rewards.streakBonus || 0;
    result.winStreak = rewards && rewards.winStreak || 0;
    result.boxCoins = rewards && rewards.boxCoins || 0;
    result.completionCoins = rewards && rewards.completionCoins || 0;
    result.starCoins = rewards && rewards.starCoins || 0;
    result.dailyBonusCoins = rewards && rewards.dailyBonusCoins || 0;
    result.repeatCoins = rewards && rewards.repeatCoins || 0;
    result.truckChest = Boolean(rewards && rewards.truckChest);
    result.truckProgress = rewards && rewards.truckProgress || 0;
    result.firstClear = Boolean(rewards && rewards.firstClear);
    result.earnedCoins = rewards && rewards.earnedCoins || 0;
    result.coins = this.storage.data.coins || 0;
    result.adventurePointsGained = rewards && rewards.adventurePoints || 0;
    result.totalPoints = rewards && rewards.totalPoints || getTotalPoints(this.storage.data);
    result.pointRank = rewards && rewards.rankAfter || getPointRank(result.totalPoints);
    result.rankUp = Boolean(rewards && rewards.rankUp);
    result.rescueTicketBonus = rewards && rewards.rescueTicketBonus || 0;
    result.unlockedTheme = rewards && rewards.unlockedTheme || null;
    result.dailyTaskStamps = rewards && rewards.dailyTaskStamps || 0;
    result.activityReward = Boolean(rewards && rewards.activityReward);
    this.view.decorationChoice = rewards && rewards.decorationUnlocked || 0;
    this.resultRecorded = true;
    this.friendRank.sync(this.storage.data);
    this.audio.play('win');
    this.platform.vibrate(true);
    this.renderer.confetti();
    this.analytics.report('level_complete', {
      level: result.level,
      daily: result.daily,
      stars: result.stars,
      score: result.score,
      moves: result.moves,
      mistakes: result.totalMistakes,
      first_clear: Boolean(result.firstClear),
      earned_coins: result.earnedCoins || 0,
      truck_chest: Boolean(result.truckChest),
      ad_opportunity: Boolean(result.truckChest && this._canOfferReward()),
      challenge_beat: Boolean(result.challengeBeat)
    });

    if (!result.daily && this.ads && typeof this.ads.noteWin === 'function') this.ads.noteWin(result.level);
  }

  _showFail() {
    if (typeof this.renderer.clearToast === 'function') this.renderer.clearToast();
    this.view.result = this.model.getResult();
    this.view.result.coins = this.storage.data.coins || 0;
    this.view.result.totalPoints = getTotalPoints(this.storage.data);
    this.view.result.pointRank = getPointRank(this.view.result.totalPoints);
    this.view.overlay = 'fail';
    this.view.revivePanel = '';
    this.view.reviveExchangeOffer = null;
    this.audio.play('fail');
    this.platform.vibrate(true);
    this.renderer.kickShake(15);
    this._syncFriendRank();
    this.analytics.report('level_fail', {
      level: this.model.level,
      daily: this.model.daily,
      moves: this.model.moves,
      revived: this.model.revived,
      failure_reason: this.view.result.failureReason
    });
  }

  _recordPendingFailure() {
    if (!this.model || this.model.status !== 'failed' || this.resultRecorded) return;
    const result = this.model.getResult();
    this.storage.recordResult(result);
    this.resultRecorded = true;
  }

  _useHint() {
    const apply = (adEnhanced) => {
      const indices = this.model.getHints(adEnhanced ? 3 : 1);
      if (!indices.length) {
        this.renderer.showToast('现在没有可提示的商品');
        return;
      }
      if (typeof this.renderer.showHints === 'function') this.renderer.showHints(indices);
      else this.renderer.showHint(indices[0]);
      this.renderer.showToast(adEnhanced ? '已标出 3 个安全目标' : '金色光圈就是推荐商品');
      this.analytics.report('booster_use', { type: 'hint', level: this.model.level, enhanced: Boolean(adEnhanced) });
    };
    return this._obtainBooster('hint', BOOSTER_COSTS.hint, () => apply(false), () => apply(true));
  }

  _useShuffle() {
    const apply = () => {
      if (!this.model.shuffleVisible()) {
        this.renderer.showToast('可整理的商品还不够');
        return;
      }
      this.renderer.kickShake(5);
      this.renderer.showToast('最上层商品已重新整理');
      this.analytics.report('booster_use', { type: 'shuffle', level: this.model.level });
    };
    return this._obtainBooster('shuffle', BOOSTER_COSTS.shuffle, apply, apply);
  }

  _useAutoPack() {
    const apply = (adEnhanced) => {
      const results = this.model.autoPack(adEnhanced
        ? { maxItems: 12, stopAfterBox: true }
        : { maxItems: 4 });
      if (!results.length) {
        this.renderer.showToast('当前没有能直接装箱的商品');
        return;
      }
      const completed = results.reduce((sum, result) => sum + result.completed.length, 0);
      const packed = results.filter((result) => result.matched).length;
      this.audio.play(completed ? 'pack' : 'combo');
      this.renderer.burst(this.renderer.width / 2, this.renderer.height * 0.54, CONFIG.COLORS.gold, 20);
      this.renderer.floatText(
        adEnhanced && completed ? '自动装满 1 箱 · 连击保留' : `自动装入 ${packed} 件 · 连击保留`,
        this.renderer.width / 2,
        this.renderer.height * 0.48,
        CONFIG.COLORS.goldDark
      );
      this.analytics.report('booster_use', {
        type: 'auto_pack',
        level: this.model.level,
        items: packed,
        enhanced: Boolean(adEnhanced)
      });
      this._handleTerminalState();
    };
    return this._obtainBooster(
      'auto_pack',
      BOOSTER_COSTS.autoPackFallback,
      () => apply(false),
      () => apply(true)
    );
  }

  _useAddTime() {
    const apply = (adEnhanced) => {
      const milliseconds = adEnhanced ? 20000 : 15000;
      if (!this.model.addTime(milliseconds)) return;
      this.audio.play('pack');
      this.renderer.burst(this.renderer.width / 2, this.renderer.safeTop + 90, CONFIG.COLORS.teal, 12);
      this.renderer.showToast(`关卡时间 +${milliseconds / 1000} 秒`);
      this.analytics.report('booster_use', { type: 'add_time', level: this.model.level, enhanced: Boolean(adEnhanced) });
    };
    return this._obtainBooster('add_time', BOOSTER_COSTS.addTime, () => apply(false), () => apply(true));
  }

  _obtainBooster(type, cost, coinApply, adApply) {
    if (!this.model || this.model.status !== 'playing') return false;
    if (this.storage.consumeBoosterVoucher(type)) {
      coinApply();
      return true;
    }
    this.pendingBooster = {
      type,
      cost,
      runId: this.runId,
      coinApply,
      adApply: adApply || coinApply
    };
    this.view.boosterChoice = {
      type,
      cost,
      coins: this.storage.data.coins || 0,
      rewardAvailable: this._canOfferReward()
    };
    return true;
  }

  _confirmBoosterChoice(source) {
    const pending = this.pendingBooster;
    if (!pending || pending.runId !== this.runId || !this.model || this.model.status !== 'playing') return false;
    if (source === 'coins') {
      if (!this.storage.spendCoins(pending.cost)) {
        this.renderer.showToast(`金币不足，需要 ${pending.cost}`);
        return false;
      }
      this.view.boosterChoice = null;
      this.pendingBooster = null;
      this.analytics.report('booster_choice', { type: pending.type, source: 'coins', cost: pending.cost });
      pending.coinApply();
      return true;
    }
    if (source !== 'ad' || !this._canOfferReward()) {
      this.renderer.showToast('视频暂时不可用，可使用金币或取消');
      return false;
    }
    return this._runReward(`booster_${pending.type}`, () => {
      if (pending.runId !== this.runId) return;
      this.view.boosterChoice = null;
      this.pendingBooster = null;
      this.analytics.report('booster_choice', { type: pending.type, source: 'rewarded_video', cost: 0 });
      pending.adApply();
    });
  }

  _openReviveChoice() {
    if (!this.model || this.model.status !== 'failed' || this.model.revived) return false;
    this.view.revivePanel = 'choice';
    this.view.reviveExchangeOffer = null;
    const rescue = this.storage.getRescueStatus(this.model.level);
    this.view.reviveEligibleNewcomer = rescue.newcomer;
    return true;
  }

  _revive(preferredSource) {
    if (!this.model || this.model.status !== 'failed' || this.model.revived) return false;
    const expectedRunId = this.runId;
    const apply = (source) => {
      const failureReason = this.model && this.model.failureReason;
      if (this.runId !== expectedRunId || !this.model || !this.model.revive()) {
        this.renderer.showToast('本局已经无法继续');
        return;
      }
      this.view.overlay = null;
      this.view.result = null;
      this.view.revivePanel = '';
      this.view.reviveExchangeOffer = null;
      this.resultRecorded = false;
      this.lastFrameAt = Date.now();
      this.audio.play('pack');
      const hint = this.model.getSafeHighlightStack();
      if (hint >= 0) this.renderer.showHint(hint);
      this.renderer.showToast(failureReason === 'timeout' ? '补回到 20 秒，安全目标已标出' : '警告已清除，安全目标已标出');
      this.analytics.report('revive_success', { level: this.model.level, source: source || 'unknown' });
    };

    const source = preferredSource || '';
    if ((!source || source === 'ticket') && this.storage.getRescueStatus(this.model.level).total > 0) {
      if (!this.storage.spendRescueTicket(this.model.level)) return false;
      apply('ticket');
      return true;
    }

    if (source === 'ticket') {
      this.renderer.showToast('救援券已经用完');
      return false;
    }

    if ((!source || source === 'ad') && this._canOfferReward()) {
      return this._runReward('revive', () => apply('rewarded_video'));
    }
    if (source === 'ad') {
      this.renderer.showToast('广告功能尚未开通，可选金币或救援券');
      return false;
    }

    if (!source && this.storage.data.coins < BOOSTER_COSTS.reviveFallback) {
      const plan = this.storage.getAutoSellPlan(BOOSTER_COSTS.reviveFallback - this.storage.data.coins);
      if (!plan) return false;
    }

    if (this.storage.data.coins >= BOOSTER_COSTS.reviveFallback) {
      if (!this.storage.spendCoins(BOOSTER_COSTS.reviveFallback)) return false;
      this._syncFriendRank();
      apply('coins');
      return true;
    }

    const shortfall = BOOSTER_COSTS.reviveFallback - (this.storage.data.coins || 0);
    const plan = this.storage.getAutoSellPlan(shortfall);
    if (plan) {
      this.view.reviveExchangeOffer = {
        cost: BOOSTER_COSTS.reviveFallback,
        coinsBefore: this.storage.data.coins || 0,
        shortfall,
        plan
      };
      this.view.revivePanel = 'exchange';
      this.storage.markMechanicSeen('revive_sale');
      return false;
    }

    if (isFeatureUnlocked(this.storage.data, 'store')) {
      this.view.revivePanel = 'guide';
      this.storage.markMechanicSeen('revive_sale');
    } else {
      this.renderer.showToast(`还差 ${shortfall} 金币，可免费重开继续积累`);
    }
    return false;
  }

  _confirmReviveExchange() {
    const offer = this.view.reviveExchangeOffer;
    if (!offer || !offer.plan) return false;
    const sale = this.storage.sellCollectibles(offer.plan.entries);
    if (!sale.sold || !this.storage.spendCoins(offer.cost)) {
      this.view.revivePanel = 'choice';
      this.view.reviveExchangeOffer = null;
      this.renderer.showToast('藏品或金币发生变化，请重新选择');
      return false;
    }
    this.analytics.report('revive_auto_exchange', {
      sold_count: offer.plan.entries.reduce((sum, entry) => sum + entry.count, 0),
      sale_coins: sale.coins,
      revive_cost: offer.cost
    });
    this._syncFriendRank();
    return this._applyReviveAfterPayment('collection_exchange');
  }

  _applyReviveAfterPayment(source) {
    if (!this.model || this.model.status !== 'failed' || this.model.revived) return false;
    const failureReason = this.model.failureReason;
    if (!this.model.revive()) return false;
    this.view.overlay = null;
    this.view.result = null;
    this.view.revivePanel = '';
    this.view.reviveExchangeOffer = null;
    this.resultRecorded = false;
    this.lastFrameAt = Date.now();
    this.audio.play('pack');
    const hint = this.model.getSafeHighlightStack();
    if (hint >= 0) this.renderer.showHint(hint);
    this.renderer.showToast(failureReason === 'timeout' ? '补回到 20 秒，安全目标已标出' : '警告已清除，安全目标已标出');
    this.analytics.report('revive_success', { level: this.model.level, source });
    return true;
  }

  _doubleReward() {
    if (!this.view.result || !this.view.result.truckChest || this.view.result.daily || this.view.doubleClaimed) return false;
    const expectedRunId = this.runId;
    return this._runReward('double_reward', () => {
      if (this.runId !== expectedRunId || !this.view.result || this.view.doubleClaimed) return;
      const extraCoins = this.storage.claimTruckChestUpgrade();
      this.view.result.earnedCoins = (this.view.result.earnedCoins || 0) + extraCoins;
      this.view.result.coins = this.storage.data.coins || 0;
      this.view.result.pointRank = getPointRank(getTotalPoints(this.storage.data));
      this._syncFriendRank();
      this.view.doubleClaimed = true;
      this.audio.play('pack');
      this.renderer.burst(this.renderer.width / 2, this.renderer.height / 2, CONFIG.COLORS.gold, 24);
      this.renderer.showToast(`货车宝箱升级，再得 ${extraCoins} 金币`);
      this.analytics.report('double_reward_claim', {
        level: this.view.result.level,
        coins: extraCoins
      });
    });
  }

  async _runReward(reason, onCompleted) {
    if (this.busy) return false;
    this.busy = true;
    this.view.adPlaying = true;
    const result = await this.ads.showRewarded(reason);
    this.busy = false;
    this.view.adPlaying = false;
    this.lastFrameAt = Date.now();
    if (!result || !result.completed) {
      this.renderer.showToast(result && result.reason === 'closed_early' ? '完整看完视频才能获得奖励' : '视频暂时不可用，请稍后再试');
      return false;
    }
    onCompleted();
    return true;
  }

  _canOfferReward() {
    return Boolean(this.ads.canReward());
  }

  _toggleSound() {
    const enabled = this.storage.data.soundEnabled === false;
    this.storage.setPreference('soundEnabled', enabled);
    this.audio.setSoundEnabled(enabled);
    if (enabled) this.audio.play('tap');
    this.renderer.showToast(enabled ? '音效已开启' : '音效已关闭');
  }

  _toggleMusic() {
    const enabled = this.storage.data.musicEnabled === false;
    this.storage.setPreference('musicEnabled', enabled);
    this.audio.setMusicEnabled(enabled);
    this.renderer.showToast(enabled ? '音乐已开启' : '音乐已关闭');
  }

  _toggleReducedMotion() {
    const enabled = !Boolean(this.storage.data.reducedMotion);
    this.storage.setPreference('reducedMotion', enabled);
    this.renderer.showToast(enabled ? '舒缓动态已开启：速度与幅度降低 30%' : '标准动态已恢复');
  }

  getShareContext() {
    const collection = this.storage.data.rareFruits || {};
    const selectedThemeId = this.view.collectionThemeId || this.storage.data.activeThemeId || 'fruit';
    const selectedTheme = getTheme(selectedThemeId);
    const rarest = getRarestDiscoveredCollectible(collection, selectedThemeId);
    const coins = this.storage.data.coins || 0;
    const totalPoints = getTotalPoints(this.storage.data);
    const rank = getPointRank(totalPoints);
    const common = {
      coins,
      totalPoints,
      pointRankName: rank.name,
      rescueTickets: this.storage.data.rescueTickets || 0,
      themeId: selectedThemeId,
      themeName: selectedTheme.name
    };
    if (this.view.screen === 'friend_rank') {
      return Object.assign({}, common, {
        friendRank: true,
        collectionCount: countDiscoveredCollectibles(collection, selectedThemeId)
      });
    }
    if (this.view.screen === 'fruit_shop') {
      const themeCollectibles = getThemeCollectibles(selectedThemeId);
      return Object.assign({}, common, {
        fruitShop: true,
        collectionShop: true,
        collectionName: selectedTheme.collectionName,
        rareCount: countDiscoveredCollectibles(collection, selectedThemeId),
        rareTotal: themeCollectibles.length,
        rarestFruitName: rarest && rarest.name || '',
        rarestCollectibleName: rarest && rarest.name || '',
        imageUrl: this.view.fruitShopShareImage || CONFIG.SHARE_IMAGE
      });
    }
    if (this.view.overlay === 'rare' && this.view.rareDiscovery && this.model) {
      return Object.assign({}, common, this.model.getResult(), {
        status: this.model.status,
        rareFruitName: this.view.rareDiscovery.collectible.name,
        collectibleName: this.view.rareDiscovery.collectible.name,
        rarityName: this.view.rareDiscovery.collectible.rarityName,
        themeId: this.view.rareDiscovery.collectible.themeId,
        themeName: getTheme(this.view.rareDiscovery.collectible.themeId).name,
        rarePoints: this.view.rareDiscovery.points || 0,
        imageUrl: this.view.fruitShopShareImage || CONFIG.SHARE_IMAGE
      });
    }
    if (this.view.result) return Object.assign({}, common, {
      themeId: this.view.result.themeId,
      themeName: getTheme(this.view.result.themeId).name
    }, this.view.result);
    if (this.model) return Object.assign({}, common, this.model.getResult(), {
      themeId: this.model.themeId,
      themeName: getTheme(this.model.themeId).name,
      status: this.model.status
    });
    const themeId = this.storage.data.activeThemeId || 'fruit';
    const level = this.storage.getThemeLevel(themeId);
    const config = generateLevel(level, {
      themeId,
      collection,
      pity: this.storage.data.themePity[themeId] || 0
    });
    return Object.assign({}, common, {
      challengeLevel: level,
      level,
      themeId,
      themeName: getTheme(themeId).name,
      seed: config.seed,
      score: (this.storage.getThemeBest(themeId, level) || {}).score || 0,
      status: 'home'
    });
  }
}

function boot(options) {
  const app = new GameApp(options);
  app.start();
  if (typeof window !== 'undefined') window.__JUSTFIT_APP__ = app;
  // 仅开发者工具与浏览器预览暴露自动化入口，便于真实微信运行时逐页截图。
  // 正式 iOS / Android 环境的 platform.isDev 为 false，不会挂到全局对象。
  if (app.platform && app.platform.isDev && typeof globalThis !== 'undefined') {
    globalThis.__JUSTFIT_APP__ = app;
  }
  return app;
}

module.exports = {
  BOOSTER_COSTS,
  GameApp,
  boot
};
