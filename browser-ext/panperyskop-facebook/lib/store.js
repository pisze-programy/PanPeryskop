// Shared persistence for captured events (browser.storage.local, deduped by fbId).
// Loaded by background, content scripts and the summary page — all write to the
// same store, so captures accumulate across tabs until the user clears them.
(function () {
  'use strict';

  const KEY = 'ppCapturedEvents';
  const RAW_KEY = 'ppRawGraphql';
  const LAST_TAB_KEY = 'ppLastFbTab';
  const STATE_KEY = 'ppSubmitState'; // fbId -> { status, attempts, reason, ts }
  // Render guard only — dedupe by fbId keeps this a set of UNIQUE events, so the
  // cap is not a data policy; a single city/day run never approaches it. Raw
  // payloads are NOT capped (see pushRaw): every event must stay verifiable.
  const MAX_EVENTS = 2000;

  globalThis.PP = globalThis.PP || {};

  PP.store = {
    async load() {
      const { [KEY]: events } = await browser.storage.local.get({ [KEY]: [] });
      return Array.isArray(events) ? events : [];
    },
    async getByFbId(fbId) {
      const all = await this.load();
      return all.find((e) => e.fbId === fbId) || null;
    },
    async merge(incoming) {
      if (!incoming || incoming.length === 0) return this.load();
      const existing = await this.load();
      const byId = new Map(existing.map((e) => [e.fbId, e]));
      for (const e of incoming) {
        if (!e || !e.fbId) continue;
        const prev = byId.get(e.fbId);
        // A re-render may expose the card BEFORE its date/image finished loading —
        // never let the partial "no-date" variant overwrite a richer one.
        if (prev && prev.startMs && !e.startMs) continue;
        // The DOM scrape is a low-quality fallback — it must never overwrite a
        // richer network capture of the same event (dates/venues would be lost).
        if (prev && e.source === 'dom' && prev.source !== 'dom') continue;
        byId.set(e.fbId, e);
      }
      const merged = [...byId.values()].slice(0, MAX_EVENTS);
      await browser.storage.local.set({ [KEY]: merged });
      return merged;
    },
    async remove(fbIds) {
      const drop = new Set(fbIds || []);
      const remaining = (await this.load()).filter((e) => !drop.has(e.fbId));
      await browser.storage.local.set({ [KEY]: remaining });
      const states = await this.loadStates();
      for (const id of drop) delete states[id];
      await browser.storage.local.set({ [STATE_KEY]: states });
    },
    async clear() {
      await browser.storage.local.set({ [KEY]: [], [RAW_KEY]: [], [STATE_KEY]: {} });
    },
    // ---------- submission state (separate from captured data) ----------
    async loadStates() {
      const { [STATE_KEY]: states } = await browser.storage.local.get({ [STATE_KEY]: {} });
      return states || {};
    },
    async stateOf(fbId) {
      const states = await this.loadStates();
      return states[fbId] || null;
    },
    async setState(fbId, st) {
      const states = await this.loadStates();
      states[fbId] = st;
      await browser.storage.local.set({ [STATE_KEY]: states });
      browser.runtime.sendMessage({ type: 'pp-state-changed' }).catch(() => {});
    },
    async setLastFbTab(tabId) {
      await browser.storage.local.set({ [LAST_TAB_KEY]: tabId });
    },
    async getLastFbTab() {
      const { [LAST_TAB_KEY]: id } = await browser.storage.local.get({ [LAST_TAB_KEY]: null });
      return id;
    },

    /**
     * Store every raw GraphQL response body — unbounded on purpose: raw payloads
     * are the validation source of truth, so dropping them (e.g. "last 20")
     * would make events unverifiable. Cleared together with the events via
     * store.clear() (the Clear-captures workflow keeps each run bounded).
     */
    async pushRaw(text) {
      if (!text) return;
      const { [RAW_KEY]: raw } = await browser.storage.local.get({ [RAW_KEY]: [] });
      await browser.storage.local.set({ [RAW_KEY]: [...raw, { ts: Date.now(), len: text.length, text }] });
    },
    async raw() {
      const { [RAW_KEY]: raw } = await browser.storage.local.get({ [RAW_KEY]: [] });
      return Array.isArray(raw) ? raw : [];
    },
    async clearRaw() {
      await browser.storage.local.set({ [RAW_KEY]: [] });
    },
  };
})();
