'use strict';

function createPlatform() {
  const api = typeof wx !== 'undefined' ? wx : createEmergencyBrowserShim();
  const isWeChat = typeof wx !== 'undefined' && typeof wx.createCanvas === 'function';
  const system = getWindowInfo(api);

  return {
    api,
    isWeChat,
    isDev: !isWeChat || system.platform === 'devtools',
    system,
    createCanvas: () => api.createCanvas(),
    createImage: (canvas) => {
      if (canvas && typeof canvas.createImage === 'function') return canvas.createImage();
      if (typeof api.createImage === 'function') return api.createImage();
      return typeof Image !== 'undefined' ? new Image() : null;
    },
    createOffscreenCanvas: (width, height) => {
      let canvas = null;
      if (typeof api.createOffscreenCanvas === 'function') {
        try { canvas = api.createOffscreenCanvas({ type: '2d', width, height }); } catch (_) { canvas = null; }
      }
      if (!canvas && isWeChat && typeof api.createCanvas === 'function') canvas = api.createCanvas();
      if (!canvas && typeof document !== 'undefined') canvas = document.createElement('canvas');
      if (canvas) {
        canvas.width = width;
        canvas.height = height;
      }
      return canvas;
    },
    exportCanvas: (canvas, options) => exportCanvas(api, canvas, options),
    getOpenDataContext: () => (
      typeof api.getOpenDataContext === 'function' ? api.getOpenDataContext() : null
    ),
    setUserCloudStorage: (kvDataList) => new Promise((resolve) => {
      if (typeof api.setUserCloudStorage !== 'function') {
        resolve(false);
        return;
      }
      try {
        api.setUserCloudStorage({
          KVDataList: kvDataList,
          success: () => resolve(true),
          fail: () => resolve(false)
        });
      } catch (_) {
        resolve(false);
      }
    }),
    createInnerAudioContext: () => (
      typeof api.createInnerAudioContext === 'function' ? api.createInnerAudioContext() : null
    ),
    getStorageSync: (key) => (
      typeof api.getStorageSync === 'function' ? api.getStorageSync(key) : null
    ),
    setStorageSync: (key, value) => {
      if (typeof api.setStorageSync === 'function') api.setStorageSync(key, value);
    },
    onTouchStart: (listener) => {
      if (typeof api.onTouchStart === 'function') api.onTouchStart(listener);
    },
    onTouchMove: (listener) => {
      if (typeof api.onTouchMove === 'function') api.onTouchMove(listener);
    },
    onTouchEnd: (listener) => {
      if (typeof api.onTouchEnd === 'function') api.onTouchEnd(listener);
    },
    onShow: (listener) => {
      if (typeof api.onShow === 'function') api.onShow(listener);
    },
    onHide: (listener) => {
      if (typeof api.onHide === 'function') api.onHide(listener);
    },
    onResize: (listener) => {
      const wrapped = () => {
        Object.assign(system, getWindowInfo(api));
        listener(system);
      };
      if (typeof api.onWindowResize === 'function') api.onWindowResize(wrapped);
      else if (typeof window !== 'undefined') window.addEventListener('resize', wrapped);
    },
    requestAnimationFrame: (listener) => {
      if (typeof api.requestAnimationFrame === 'function') return api.requestAnimationFrame(listener);
      return requestAnimationFrame(listener);
    },
    cancelAnimationFrame: (id) => {
      if (typeof api.cancelAnimationFrame === 'function') api.cancelAnimationFrame(id);
      else cancelAnimationFrame(id);
    },
    vibrate: (heavy) => {
      if (typeof api.vibrateShort === 'function') {
        try {
          api.vibrateShort({ type: heavy ? 'heavy' : 'light' });
        } catch (error) {
          // Low-version clients may not accept a type argument.
          try { api.vibrateShort(); } catch (_) {}
        }
      }
    },
    showToast: (title) => {
      if (typeof api.showToast === 'function') {
        api.showToast({ title, icon: 'none', duration: 1400 });
      }
    },
    reportEvent: typeof api.reportEvent === 'function'
      ? (name, data) => api.reportEvent(name, data)
      : null,
    getLaunchOptions: () => (
      typeof api.getLaunchOptionsSync === 'function' ? api.getLaunchOptionsSync() : { query: {} }
    ),
    log: (...args) => {
      if (typeof console !== 'undefined' && console.log) console.log(...args);
    }
  };
}

function exportCanvas(api, canvas, options) {
  const opts = options || {};
  return new Promise((resolve, reject) => {
    if (!canvas) {
      reject(new Error('canvas_unavailable'));
      return;
    }
    if (typeof canvas.toTempFilePath === 'function') {
      canvas.toTempFilePath(Object.assign({}, opts, { success: (result) => resolve(result.tempFilePath), fail: reject }));
      return;
    }
    if (typeof api.canvasToTempFilePath === 'function') {
      api.canvasToTempFilePath(Object.assign({ canvas }, opts, { success: (result) => resolve(result.tempFilePath), fail: reject }));
      return;
    }
    if (typeof canvas.toDataURL === 'function') {
      try { resolve(canvas.toDataURL('image/png')); } catch (error) { reject(error); }
      return;
    }
    reject(new Error('canvas_export_unavailable'));
  });
}

function getWindowInfo(api) {
  let info = null;
  if (typeof api.getWindowInfo === 'function') {
    try { info = api.getWindowInfo(); } catch (_) { info = null; }
  }
  if (!info && typeof api.getSystemInfoSync === 'function') {
    try { info = api.getSystemInfoSync(); } catch (_) { info = null; }
  }
  info = info || {};
  return {
    windowWidth: info.windowWidth || 375,
    windowHeight: info.windowHeight || 812,
    pixelRatio: Math.min(3, info.pixelRatio || 2),
    safeArea: info.safeArea || {
      left: 0,
      top: 0,
      right: info.windowWidth || 375,
      bottom: info.windowHeight || 812,
      width: info.windowWidth || 375,
      height: info.windowHeight || 812
    },
    platform: info.platform || 'web',
    model: info.model || 'browser'
  };
}

function createEmergencyBrowserShim() {
  const memory = {};
  const shareListeners = { friend: null, timeline: null };
  return {
    createCanvas() {
      const canvas = document.querySelector('canvas') || document.createElement('canvas');
      if (!canvas.parentNode) document.body.appendChild(canvas);
      return canvas;
    },
    createOffscreenCanvas(options) {
      const canvas = document.createElement('canvas');
      canvas.width = options && options.width || 1000;
      canvas.height = options && options.height || 800;
      return canvas;
    },
    getWindowInfo() {
      const canvas = document.querySelector('canvas');
      const rect = canvas && canvas.getBoundingClientRect();
      const width = rect && rect.width > 0 ? rect.width : window.innerWidth;
      const height = rect && rect.height > 0 ? rect.height : window.innerHeight;
      return {
        windowWidth: width,
        windowHeight: height,
        pixelRatio: window.devicePixelRatio || 1,
        platform: 'web'
      };
    },
    getStorageSync(key) {
      if (memory[key]) return memory[key];
      try { return JSON.parse(localStorage.getItem(key)); } catch (_) { return null; }
    },
    setStorageSync(key, value) {
      memory[key] = value;
      try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) {}
    },
    createInnerAudioContext() {
      if (typeof Audio === 'undefined') return null;
      const audio = new Audio();
      return {
        get src() { return audio.src; },
        set src(value) { audio.src = value; },
        get volume() { return audio.volume; },
        set volume(value) { audio.volume = value; },
        get loop() { return audio.loop; },
        set loop(value) { audio.loop = value; },
        obeyMuteSwitch: false,
        play() {
          const promise = audio.play();
          if (promise && typeof promise.catch === 'function') promise.catch(() => {});
          return promise;
        },
        pause() { audio.pause(); },
        stop() {
          audio.pause();
          try { audio.currentTime = 0; } catch (_) {}
        },
        seek(seconds) {
          try { audio.currentTime = seconds || 0; } catch (_) {}
        },
        destroy() {
          audio.pause();
          audio.removeAttribute('src');
        }
      };
    },
    onTouchStart(listener) {
      window.addEventListener('pointerdown', (event) => {
        const point = toCanvasPoint(event);
        listener({ touches: [point] });
      });
    },
    onTouchMove(listener) {
      window.addEventListener('pointermove', (event) => {
        const point = toCanvasPoint(event);
        listener({ touches: [point] });
      });
    },
    onTouchEnd(listener) {
      window.addEventListener('pointerup', (event) => {
        const point = toCanvasPoint(event);
        listener({ changedTouches: [point] });
      });
    },
    onShow() {},
    onHide() {},
    onWindowResize(listener) { window.addEventListener('resize', listener); },
    requestAnimationFrame: (listener) => window.requestAnimationFrame(listener),
    cancelAnimationFrame: (id) => window.cancelAnimationFrame(id),
    getLaunchOptionsSync() {
      const query = {};
      try {
        const params = new URLSearchParams(window.location.search);
        params.forEach((value, key) => { query[key] = value; });
      } catch (_) {}
      return { query };
    },
    showShareMenu() {},
    onShareAppMessage(listener) { shareListeners.friend = listener; },
    onShareTimeline(listener) { shareListeners.timeline = listener; },
    shareAppMessage(payload) {
      const data = payload || (shareListeners.friend && shareListeners.friend()) || {};
      if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
        navigator.share({ title: data.title, text: data.title }).catch(() => {});
      } else if (typeof console !== 'undefined') {
        console.log('[share]', data);
      }
    },
    showToast({ title }) { console.log('[toast]', title); }
  };
}

function toCanvasPoint(event) {
  const canvas = document.querySelector('canvas');
  const rect = canvas && canvas.getBoundingClientRect();
  return {
    clientX: event.clientX - (rect ? rect.left : 0),
    clientY: event.clientY - (rect ? rect.top : 0)
  };
}

module.exports = {
  createPlatform
};
