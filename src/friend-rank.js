'use strict';

const { countAllDiscoveredCollectibles } = require('./theme-collectibles');
const { getTotalPoints } = require('./progression');

class FriendRankManager {
  constructor(platform) {
    this.platform = platform;
    this.context = null;
    this.sharedCanvas = null;
    this.metric = 'total_points';
    this.available = false;
    try {
      this.context = platform.getOpenDataContext && platform.getOpenDataContext();
      this.sharedCanvas = this.context && this.context.canvas || null;
      this.available = Boolean(this.context && this.sharedCanvas);
    } catch (_) {
      this.context = null;
      this.sharedCanvas = null;
      this.available = false;
    }
  }

  sync(saveData) {
    if (!this.platform.setUserCloudStorage) return Promise.resolve(false);
    const collectionCount = countAllDiscoveredCollectibles(saveData && saveData.rareFruits);
    return this.platform.setUserCloudStorage([
      { key: 'total_points', value: String(getTotalPoints(saveData)) },
      { key: 'collection_count', value: String(collectionCount) }
    ]);
  }

  show(metric, width, height) {
    this.metric = metric === 'collection_count' ? 'collection_count' : 'total_points';
    if (!this.available) return null;
    const targetWidth = Math.max(320, Math.floor(Number(width) || 654));
    const targetHeight = Math.max(400, Math.floor(Number(height) || 820));
    try {
      if (this.sharedCanvas.width !== targetWidth) this.sharedCanvas.width = targetWidth;
      if (this.sharedCanvas.height !== targetHeight) this.sharedCanvas.height = targetHeight;
    } catch (_) {
      // 个别基础库会把开放数据画布尺寸暴露为只读；继续发送消息，
      // 主域仍可把现有画布按目标区域缩放绘制，不能让排行榜入口崩溃。
    }
    try {
      this.context.postMessage({
        type: 'show_rank',
        metric: this.metric,
        width: targetWidth,
        height: targetHeight
      });
    } catch (_) {}
    return this.sharedCanvas;
  }

  scroll(delta) {
    if (!this.available) return false;
    const distance = Number(delta) || 0;
    if (Math.abs(distance) < 1) return false;
    try {
      this.context.postMessage({ type: 'rank_scroll', delta: distance });
      return true;
    } catch (_) {
      return false;
    }
  }

  hide() {
    if (!this.available) return;
    try { this.context.postMessage({ type: 'hide_rank' }); } catch (_) {}
  }
}

module.exports = {
  FriendRankManager
};
