'use strict';

const CONFIG = require('./config');
const { formatPoints } = require('./progression');
const { normalizeThemeId } = require('./themes');

class ShareManager {
  constructor(platform, analytics) {
    this.platform = platform;
    this.analytics = analytics;
    this.getContext = () => ({});
    this.shareSequence = 0;
    const launchOptions = platform.getLaunchOptions();
    this.challenge = parseChallenge(launchOptions);
    this.fruitShopEntry = parseFruitShopEntry(launchOptions);
    this.fruitShopThemeId = this.fruitShopEntry
      ? normalizeThemeId(launchOptions && launchOptions.query && launchOptions.query.theme || 'fruit')
      : null;
  }

  setup(getContext) {
    this.getContext = typeof getContext === 'function' ? getContext : this.getContext;
    const api = this.platform.api;

    if (typeof api.showShareMenu === 'function') {
      try {
        api.showShareMenu({
          withShareTicket: true,
          menus: ['shareAppMessage', 'shareTimeline']
        });
      } catch (_) {
        try { api.showShareMenu({ withShareTicket: true }); } catch (__) {}
      }
    }

    if (typeof api.onShareAppMessage === 'function') {
      api.onShareAppMessage(() => this.createFriendPayload(this.getContext()));
    }

    if (typeof api.onShareTimeline === 'function') {
      api.onShareTimeline(() => this.createTimelinePayload(this.getContext()));
    }
  }

  createFriendPayload(context) {
    const ctx = context || {};
    const title = createTitle(ctx, 'friend', this.shareSequence++);
    const query = createQuery(ctx);
    return {
      title,
      imageUrl: ctx.imageUrl || CONFIG.SHARE_IMAGE,
      query
    };
  }

  createTimelinePayload(context) {
    const ctx = context || {};
    const payload = {
      title: createTitle(ctx, 'timeline', this.shareSequence++),
      imageUrl: ctx.imageUrl || CONFIG.SHARE_IMAGE,
      query: createQuery(ctx)
    };
    return {
      title: payload.title,
      imageUrl: payload.imageUrl,
      imagePreviewUrl: payload.imageUrl,
      query: payload.query
    };
  }

  shareNow(context) {
    const api = this.platform.api;
    const payload = this.createFriendPayload(context || this.getContext());
    this.analytics.report('share_click', {
      level: Number(context && context.level || 0),
      daily: Boolean(context && context.daily)
    });
    if (typeof api.shareAppMessage === 'function') {
      api.shareAppMessage(payload);
      return true;
    }
    this.platform.showToast('请使用右上角菜单分享');
    return false;
  }

  consumeChallenge() {
    const challenge = this.challenge;
    this.challenge = null;
    return challenge;
  }

  consumeFruitShopEntry() {
    const entry = this.fruitShopEntry;
    this.fruitShopEntry = false;
    return entry;
  }

  consumeFruitShopTheme() {
    const themeId = this.fruitShopThemeId;
    this.fruitShopThemeId = null;
    return themeId;
  }
}

function createTitle(context, channel, variantIndex) {
  const ctx = context || {};
  const theme = ctx.themeName || '奇幻果园';
  const coins = formatPoints(ctx.coins);
  const index = Math.max(0, Math.floor(Number(variantIndex) || 0)) + (channel === 'timeline' ? 1 : 0);

  if (ctx.friendRank) {
    return pickTitle([
      `货架灯亮了：我现在有 ${coins} 金币。来好友榜看看我们隔着几名？`,
      `有人在悄悄装满下一箱——我的金币是 ${coins}，等你来追。`,
      `藏馆有光，好友有名次。我的 ${coins} 金币已经上榜，你呢？`
    ], index);
  }

  if (ctx.fruitShop) {
    const collectionName = ctx.collectionName || '奇趣藏馆';
    const bestName = ctx.rarestCollectibleName || ctx.rarestFruitName || '';
    const progress = `${ctx.rareCount || 0}/${ctx.rareTotal || 56}`;
    return pickTitle(bestName ? [
      `${theme}点亮 ${progress}，镇馆藏品「${bestName}」今晚正发着光。来看看你的会是哪一件？`,
      `我把「${bestName}」留在${collectionName}最亮的位置，${theme}还有多少秘密没被发现？`,
      `${theme}的风吹过展柜，${progress} 件藏品已经亮起。最舍不得卖的是「${bestName}」。`
    ] : [
      `我的${collectionName}还空着，第一束光会落在哪件藏品上？`,
      `${theme}的展柜刚打开，等一件只停留 6 秒的闪耀藏品。`,
      `空展柜也有期待：下一关，也许就会遇见第一件镇馆之宝。`
    ], index);
  }

  if (ctx.collectibleName || ctx.rareFruitName) {
    const name = ctx.collectibleName || ctx.rareFruitName;
    return pickTitle([
      `${theme}里，「${name}」只闪了 6 秒，我刚好接住。你的货架今晚会出现什么？`,
      `彩虹光圈散去前，我在第${ctx.level || 1}关遇见了${ctx.rarityName || '稀有'}「${name}」。`,
      `这一箱装进的不只是水果，还有一束叫「${name}」的光。来试试你的手速。`
    ], index);
  }

  if (ctx.daily) {
    return pickTitle([
      `今日同一题，我装满了 ${ctx.boxesCompleted || 0}箱。首胜还有 25 金币，等你来交卷。`,
      `今天的货架已经洗牌，每个人面对同一局。我的成绩在这里，你会怎么点？`,
      `一天只亮一次的挑战入口：同题、限时、首胜 25 金币。来看看谁更稳。`
    ], index);
  }

  if (ctx.status === 'failed') {
    const remaining = Math.max(1, Number(ctx.boxTotal || 0) - Number(ctx.boxesCompleted || 0));
    return pickTitle([
      `第${ctx.level || 1}关只差${remaining}箱，最后一次点击却让货架安静了。你能替我装满吗？`,
      `箱盖已经抬起，只差${remaining}箱就能合上。来接走这局未完的挑战。`,
      `时间停在最后${remaining}箱之前。换你来点，也许结局会不一样。`
    ], index);
  }

  if (ctx.status === 'won') {
    if (ctx.challengeScore) {
      return pickTitle(ctx.challengeBeat ? [
        `我刚超过好友成绩 ${ctx.challengeScore}，下一箱轮到你。`,
        `同一排货架，我先翻过了 ${ctx.challengeScore}。来把纪录拿回去。`,
        `好友的纪录已经被我装进箱里，你还要让它留在这里吗？`
      ] : [
        `这局差一点超过好友成绩 ${ctx.challengeScore}，你能替我完成最后一程吗？`,
        `纪录就在箱盖上方，只差一点。来试试同一局货架。`,
        `我没能翻过这条好友纪录，也许你的下一次点击可以。`
      ], index);
    }
    return pickTitle([
      `第${ctx.level || 1}关装满了，本关收下 ${ctx.earnedCoins || 0} 金币。下一箱会藏着什么？`,
      `${theme}的第${ctx.level || 1}盏灯亮起，我现在有 ${coins} 金币。`,
      `箱盖合上的声音太解压了——第${ctx.level || 1}关完成，等你来听下一声。`
    ], index);
  }

  if (ctx.challengeLevel) {
    return pickTitle([
      `我在${theme}走到第${ctx.challengeLevel}关，现在有 ${coins} 金币。来接同一排货架。`,
      `${theme}第${ctx.challengeLevel}关的箱盖还开着，里面也许藏着只停 6 秒的光。`,
      `越往后，货架越会骗人。我的下一关已经摆好，你从第几次点击开始上瘾？`
    ], index);
  }
  return pickTitle([
    '这堆货看着简单，装到第三箱就停不下来了。',
    '听见箱盖合上的那一声了吗？下一箱正在等你。',
    '只点顶层、装满目标——规则三秒看懂，手却很难停下。'
  ], index);
}

function pickTitle(titles, index) {
  const list = Array.isArray(titles) && titles.length ? titles : ['装满这一箱'];
  return list[index % list.length];
}

function createQuery(context) {
  const params = [context.fruitShop ? 'from=fruit_shop' : 'from=share'];
  if (context.fruitShop) params.push('shop=1');
  if (context.level) params.push(`level=${encodeURIComponent(context.level)}`);
  if (context.themeId) params.push(`theme=${encodeURIComponent(context.themeId)}`);
  if (context.seed != null) params.push(`seed=${encodeURIComponent(context.seed)}`);
  if (context.score != null) params.push(`score=${encodeURIComponent(context.score)}`);
  if (context.daily) params.push('daily=1');
  return params.join('&');
}

function parseChallenge(options) {
  const query = options && options.query || {};
  if (query.from !== 'share') return null;
  const level = Math.max(1, Number(query.level) || 1);
  return {
    level,
    themeId: normalizeThemeId(query.theme || 'fruit'),
    seed: query.seed == null ? null : Number(query.seed) >>> 0,
    score: Math.max(0, Number(query.score) || 0),
    daily: query.daily === '1' || query.daily === 1
  };
}

function parseFruitShopEntry(options) {
  const query = options && options.query || {};
  return query.from === 'fruit_shop' || query.shop === '1' || query.shop === 1;
}

module.exports = {
  ShareManager,
  createQuery,
  createTitle,
  parseChallenge,
  parseFruitShopEntry
};
