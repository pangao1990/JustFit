'use strict';

module.exports = Object.freeze({
  VERSION: '1.1.0',
  DESIGN_WIDTH: 750,
  STORAGE_KEY: 'fill_the_box_progress_v1',
  TUTORIAL_VERSION: 7,
  SHOP_NODE_STARS: 12,
  MAX_BUFFER_SLOTS: 7,
  BUFFER_SLOT_COSTS: Object.freeze([0, 180, 420, 850, 1500, 2400, 3600]),
  RARE_VISIBLE_MS: 6000,
  FIRST_INTERSTITIAL_LEVEL: 11,
  INTERSTITIAL_LEVEL_INTERVAL: 4,
  INTERSTITIAL_TIME_INTERVAL_MS: 240000,
  FIRST_INTERSTITIAL_SESSION_MS: 600000,
  REWARDED_INTERSTITIAL_COOLDOWN_MS: 120000,
  MAX_INTERSTITIALS_PER_SESSION: 2,
  SHARE_IMAGE: 'assets/share-card.png',
  ADS: {
    enabled: false,
    rewardedUnitId: 'adunit-REPLACE_WITH_REWARDED_ID',
    interstitialUnitId: 'adunit-REPLACE_WITH_INTERSTITIAL_ID'
  },
  COLORS: {
    ink: '#3D3152',
    mutedInk: '#756A84',
    cream: '#FFF8E8',
    paper: '#FFFFFF',
    coral: '#FF786B',
    coralDark: '#E95B53',
    teal: '#46C7B7',
    tealDark: '#27A796',
    gold: '#F8C75C',
    goldDark: '#DB9D2D',
    sky: '#DDF6F3',
    shelf: '#A76949',
    shelfDark: '#70422F',
    danger: '#E94B5F',
    success: '#45B979'
  }
});
