'use strict';

const CONFIG = require('./config');

class AdManager {
  constructor(platform, analytics) {
    this.platform = platform;
    this.analytics = analytics;
    this.rewarded = null;
    this.interstitial = null;
    this.rewardLoaded = false;
    this.pendingReward = null;
    this.lastInterstitialAt = 0;
    this.lastRewardedAt = 0;
    this.winsSinceInterstitial = 0;
    this.interstitialsThisSession = 0;
    this.sessionStartedAt = Date.now();
    this.enabled = Boolean(CONFIG.ADS.enabled);
    this._init();
  }

  _validUnitId(id) {
    return typeof id === 'string' && id.startsWith('adunit-') && id.indexOf('REPLACE_') < 0;
  }

  _init() {
    const api = this.platform.api;
    if (!this.enabled || !api) return;

    if (this._validUnitId(CONFIG.ADS.rewardedUnitId) && typeof api.createRewardedVideoAd === 'function') {
      this.rewarded = api.createRewardedVideoAd({ adUnitId: CONFIG.ADS.rewardedUnitId });
      this.rewarded.onLoad(() => { this.rewardLoaded = true; });
      this.rewarded.onError((error) => {
        this.rewardLoaded = false;
        this.analytics.report('reward_ad_error', { code: error && error.errCode || 0 });
        this._resolveReward(false, 'error');
      });
      this.rewarded.onClose((result) => {
        const completed = result === undefined || Boolean(result && result.isEnded);
        this.analytics.report('reward_ad_close', { completed });
        this._resolveReward(completed, completed ? 'completed' : 'closed_early');
      });
    }

    if (this._validUnitId(CONFIG.ADS.interstitialUnitId) && typeof api.createInterstitialAd === 'function') {
      this.interstitial = api.createInterstitialAd({ adUnitId: CONFIG.ADS.interstitialUnitId });
      this.interstitial.onError((error) => {
        this.analytics.report('interstitial_error', { code: error && error.errCode || 0 });
      });
    }
  }

  canReward() {
    return Boolean(this.rewarded && (this.rewardLoaded || typeof this.rewarded.load === 'function'));
  }

  showRewarded(reason) {
    this.analytics.report('reward_ad_offer', { reason: String(reason || 'unknown') });

    if (!this.rewarded) {
      if (this.platform.isDev) {
        this.platform.showToast('开发模式：已模拟完整观看');
        this.lastRewardedAt = Date.now();
        return Promise.resolve({ completed: true, simulated: true });
      }
      return Promise.resolve({ completed: false, reason: 'not_configured' });
    }

    if (this.pendingReward) return this.pendingReward.promise;

    let resolver = null;
    const promise = new Promise((resolve) => { resolver = resolve; });
    this.pendingReward = { promise, resolve: resolver };
    this.analytics.report('reward_ad_show', { reason: String(reason || 'unknown') });

    const show = () => this.rewarded.show();
    Promise.resolve(show()).catch(() => {
      if (typeof this.rewarded.load !== 'function') throw new Error('load_unavailable');
      return this.rewarded.load().then(show);
    }).catch(() => {
      this._resolveReward(false, 'load_failed');
    });

    return promise;
  }

  _resolveReward(completed, reason) {
    if (!this.pendingReward) return;
    const pending = this.pendingReward;
    this.pendingReward = null;
    if (completed) this.lastRewardedAt = Date.now();
    pending.resolve({ completed, reason });
  }

  noteWin(level) {
    this.winsSinceInterstitial += 1;
    return this.canShowInterstitial(level);
  }

  canShowInterstitial(level, options) {
    const opts = options || {};
    if (opts.suppress) return false;
    if (level < CONFIG.FIRST_INTERSTITIAL_LEVEL) return false;
    if (this.winsSinceInterstitial < CONFIG.INTERSTITIAL_LEVEL_INTERVAL) return false;
    if (this.interstitialsThisSession >= CONFIG.MAX_INTERSTITIALS_PER_SESSION) return false;
    const now = Date.now();
    if (now - this.sessionStartedAt < CONFIG.FIRST_INTERSTITIAL_SESSION_MS) return false;
    if (this.lastInterstitialAt && now - this.lastInterstitialAt < CONFIG.INTERSTITIAL_TIME_INTERVAL_MS) return false;
    if (this.lastRewardedAt && now - this.lastRewardedAt < CONFIG.REWARDED_INTERSTITIAL_COOLDOWN_MS) return false;
    return true;
  }

  showInterstitial(level, options) {
    if (!this.canShowInterstitial(level, options)) return Promise.resolve(false);
    if (!this.interstitial) return Promise.resolve(false);
    this.analytics.report('interstitial_show', { level });
    return this.interstitial.show()
      .then(() => {
        this.winsSinceInterstitial = 0;
        this.lastInterstitialAt = Date.now();
        this.interstitialsThisSession += 1;
        return true;
      })
      .catch(() => false);
  }
}

module.exports = {
  AdManager
};
