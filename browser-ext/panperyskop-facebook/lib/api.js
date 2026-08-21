// PanPeryskop API client (admin-secret endpoints). Loaded by content scripts
// (upload happens in the authenticated FB page context) and by the summary page
// (duplicate pre-check). Every call logs to the console.
(function () {
  'use strict';

  globalThis.PP = globalThis.PP || {};

  PP.api = {
    baseUrl(s) {
      return (s.baseUrl || 'https://api.panperyskop.app').replace(/\/+$/, '');
    },
    headers(s, extra) {
      return { Authorization: `Bearer ${s.adminSecret}`, ...(extra || {}) };
    },

    /**
     * Duplicate pre-check for the summary badges.
     * events: [{ externalId, title, startMs, venue }]
     */
    async preview(settings, events) {
      const url = `${this.baseUrl(settings)}/admin/seed/facebook/preview`;
      console.log(`[panperyskop] POST ${url} (${events.length} events)`);
      const res = await fetch(url, {
        method: 'POST',
        headers: this.headers(settings, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({ events }),
      });
      const data = await res.json().catch(() => ({}));
      console.log(`[panperyskop] response ${res.status}`, data);
      if (!res.ok) throw new Error(`preview ${res.status}: ${JSON.stringify(data)}`);
      return Array.isArray(data.results) ? data.results : [];
    },

    /**
     * Geo preview for the summary: resolve each location server-side (Nominatim,
     * paced 1 req/s + venue cache). Client timeout scales with the batch so a
     * blocked/ratelimited response fails fast instead of hanging.
     * events: [{ externalId, venue, address, city }]
     */
    async geoPreview(settings, events) {
      const url = `${this.baseUrl(settings)}/admin/seed/facebook/geopreview`;
      const timeout = Math.max(20_000, events.length * 1500);
      console.log(`[panperyskop] POST ${url} (${events.length} locations, timeout ${timeout}ms)`);
      const res = await fetch(url, {
        method: 'POST',
        headers: this.headers(settings, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({ events }),
        signal: AbortSignal.timeout(timeout),
      });
      const data = await res.json().catch(() => ({}));
      console.log(`[panperyskop] response ${res.status}`, data);
      if (!res.ok) throw new Error(`geopreview ${res.status}: ${JSON.stringify(data)}`);
      return Array.isArray(data.results) ? data.results : [];
    },

    /**
     * Authoritative single-event ingest (multipart). Runs from a content script
     * so the fbcdn cover fetch stays in the logged-in page context.
     */
    async upload(settings, ev, media) {
      const url = `${this.baseUrl(settings)}/admin/seed/facebook`;
      const form = new FormData();
      form.append('title', ev.title);
      form.append('startMs', String(ev.startMs));
      form.append('venue', ev.venue || '');
      form.append('address', ev.address || '');
      form.append('city', ev.city || '');
      form.append('link', ev.link);
      form.append('external_id', `facebook-${ev.fbId}`);
      if (Array.isArray(ev.tags) && ev.tags.length) form.append('tags', JSON.stringify(ev.tags));
      form.append('file', media.media, 'media.jpg');
      if (media.thumb) form.append('thumb', media.thumb, 'thumb.jpg');

      console.log(`[panperyskop] POST ${url}`, { external_id: `facebook-${ev.fbId}`, title: ev.title });
      const res = await fetch(url, {
        method: 'POST',
        headers: this.headers(settings),
        body: form,
      });
      const data = await res.json().catch(() => ({}));
      console.log(`[panperyskop] response ${res.status}`, data);
      if (!res.ok) throw new Error(`upload ${res.status}: ${JSON.stringify(data)}`);
      return data;
    },
  };
})();
