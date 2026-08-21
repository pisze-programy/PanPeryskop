// Addon settings: API endpoint + credentials + ingest defaults.
// Stored in browser.storage.local. Each context that needs settings loads this
// file first and reads via PP.settings.get().
//
// graphqlCapture (default OFF): page-world interceptor (fetch/XHR patch +
// postMessage) is the higher-quality capture path but the LARGEST detection
// surface — Facebook's page JS can see it. Default capture is the DOM
// MutationObserver in the isolated world (invisible to FB). Turn graphqlCapture
// on only when DOM extraction quality is not enough.
(function () {
  'use strict';

  const DEFAULTS = {
    baseUrl: 'https://api.panperyskop.app',
    adminSecret: '',
    graphqlCapture: false,
    submitGapMs: 2000,
    maxAttempts: 3,
  };

  globalThis.PP = globalThis.PP || {};

  PP.settings = {
    DEFAULTS,
    async get() {
      const stored = await browser.storage.local.get(DEFAULTS);
      return { ...DEFAULTS, ...stored };
    },
    async set(partial) {
      await browser.storage.local.set(partial);
    },
  };

  // Unified log tag — every line starts with [ppfb] so it is trivially filterable
  // in the browser console. Levels: info (captured/submit ok), warn (skipped/
  // failed/duplicate), error.
  PP.log = {
    info: (...args) => console.info('[ppfb]', ...args),
    warn: (...args) => console.warn('[ppfb]', ...args),
    error: (...args) => console.error('[ppfb]', ...args),
  };
})();
