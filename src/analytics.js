'use strict';

class Analytics {
  constructor(platform) {
    this.platform = platform;
  }

  report(name, payload) {
    const data = sanitize(payload || {});
    if (this.platform.isDev) {
      this.platform.log(`[analytics] ${name}`, data);
    }
    if (typeof this.platform.reportEvent === 'function') {
      try {
        this.platform.reportEvent(name, data);
      } catch (error) {
        this.platform.log('[analytics:error]', error && error.message);
      }
    }
  }
}

function sanitize(input) {
  const output = {};
  Object.keys(input).forEach((key) => {
    const value = input[key];
    if (typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean') {
      output[key] = value;
    }
  });
  return output;
}

module.exports = {
  Analytics
};
