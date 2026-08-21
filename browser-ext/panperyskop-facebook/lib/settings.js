// Addon settings: API endpoint + credentials + ingest defaults.
// Stored in browser.storage.local. Each context that needs settings loads this
// file first and reads via PP.settings.get().
(function () {
  'use strict';

  const DEFAULTS = {
    baseUrl: 'https://api.panperyskop.app',
    adminSecret: '',
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
})();
