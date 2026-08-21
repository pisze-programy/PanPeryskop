// Content script (runs on facebook.com, document_start). Jobs:
//   1. PASSIVE DOM capture (default, invisible): a MutationObserver in the
//      isolated world watches for event cards (`a[href*="/events/"]`) as the
//      user scrolls. Facebook's page JS runs in a separate world and cannot see
//      the observer — no fetch/XHR patching, no postMessage.
//   2. AUTO-SUBMIT (opt-in by default ON for DOM capture): a paced one-at-a-time
//      queue uploads each captured event (cover fetched in the logged-in context,
//      then POST multipart to the PanPeryskop ingest endpoint). Results logged as
//      `[ppfb] INGEST …` so the user sees live which events went in and why.
//   3. OPTIONAL GraphQL capture (settings.graphqlCapture, default OFF): a
//      page-world interceptor reads raw GraphQL responses via clone() (never
//      delays/aborts the stream). Higher data quality, but a larger detection
//      surface — Facebook's page JS can observe the fetch/XHR patch.
'use strict';

if (!globalThis.__ppContentLoaded) {
  globalThis.__ppContentLoaded = true;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  browser.runtime.onMessage.addListener(async (msg) => {
    switch (msg && msg.type) {
      case 'pp-scrape-dom':
        return scrapeDom();
      case 'pp-submit-events': {
        const s = msg.settings || (await PP.settings.get());
        return submitEvents(s, msg.events);
      }
      default:
        return undefined;
    }
  });

  // ---------- OPTIONAL GraphQL capture (opt-in) ----------
  PP.settings.get().then((s) => {
    if (!s.graphqlCapture) return;
    browser.runtime.sendMessage({ type: 'pp-inject' }).catch(() => {});
    window.addEventListener('message', (e) => {
      if (e.source !== window || !e.data) return;
      if (e.data.type === 'pp-interceptor-active') {
        PP.log.info('graphql interceptor active');
        return;
      }
      if (e.data.type === 'pp-graphql') handleGraphql(e.data.text);
    });
  });

  function handleGraphql(text) {
    try {
      const events = PP.parser.eventsFromGraphql(text);
      PP.store.pushRaw(text);
      if (!events.length) return;
      PP.store.merge(events).then(() => {
        for (const e of events) {
          PP.log.info('CAPTURED (graphql) |', e.title, '|', e.startMs ? new Date(e.startMs).toLocaleString() : 'no-date', '|', e.city || e.venue || 'no-city', '|', e.link);
          enqueue(e.fbId);
        }
      });
    } catch (err) {
      PP.log.warn('graphql parse failed', err);
    }
  }

  // ---------- PASSIVE DOM capture (default) ----------
  startDomObserver();

  function startDomObserver() {
    const seedSeen = new Set();
    const obs = new MutationObserver((muts) => {
      for (const m of muts) {
        for (const n of m.addedNodes) {
          if (n.nodeType !== 1) continue;
          if (n.matches && n.matches('a[href*="/events/"]')) captureAnchor(n);
          else if (n.querySelectorAll) {
            for (const a of n.querySelectorAll('a[href*="/events/"]')) captureAnchor(a);
          }
        }
      }
    });
    obs.observe(document.documentElement, { childList: true, subtree: true });
    // Seed scan of the current DOM (existing cards when the tab loads).
    for (const a of document.querySelectorAll('a[href*="/events/"]')) {
      const ev = extractOne(a);
      if (ev && !seedSeen.has(ev.fbId)) {
        seedSeen.add(ev.fbId);
        capture(ev);
      }
    }
  }

  // Session-scoped: log CAPTURED only on first sighting or when the data improved
  // (gained a date / title changed) — FB re-renders cards constantly and the
  // observer must not flood the console for the same event.
  const logged = new Map();
  function shouldLogCapture(ev) {
    const prev = logged.get(ev.fbId);
    const first = !prev;
    const improved = !!prev && !prev.startMs && !!ev.startMs;
    const changed = !!prev && prev.title !== ev.title;
    if (first || improved || changed) {
      logged.set(ev.fbId, { title: ev.title, startMs: ev.startMs });
      return true;
    }
    return false;
  }

  async function captureAnchor(a) {
    const ev = extractOne(a);
    if (ev) await capture(ev);
  }

  async function capture(ev) {
    await PP.store.merge([ev]);
    if (shouldLogCapture(ev)) {
      PP.log.info('CAPTURED |', ev.title || 'no-title', '|', ev.startMs ? new Date(ev.startMs).toLocaleString() : 'no-date', '|', ev.city || ev.venue || 'no-city', '|', ev.link);
    }
    enqueue(ev.fbId);
  }

  // ---------- AUTO-SUBMIT queue (one at a time, paced) ----------
  const queue = [];
  let processing = false;

  async function enqueue(fbId) {
    if (queue.includes(fbId)) return;
    const st = await PP.store.stateOf(fbId);
    if (st && (st.status === 'pending' || st.status === 'duplicate')) return; // terminal
    queue.push(fbId);
    if (!processing) processQueue();
  }

  async function processQueue() {
    processing = true;
    try {
      while (queue.length) {
        const fbId = queue.shift();
        await processOne(fbId);
        const s = await PP.settings.get();
        await sleep(s.submitGapMs || 2000);
      }
    } finally {
      processing = false;
    }
  }

  async function processOne(fbId) {
    const s = await PP.settings.get();
    const st = await PP.store.stateOf(fbId);
    if (st && (st.status === 'pending' || st.status === 'duplicate')) return; // done
    if (st && (st.attempts || 0) >= (s.maxAttempts || 3)) return; // exhausted

    // Enrich from the live DOM — the card may still be rendering (title/date/img).
    let ev = await PP.store.getByFbId(fbId);
    if (!ev) return;
    ev = enrich(fbId, ev);
    for (let i = 0; i < 6; i++) {
      if (ev.startMs && ev.mediaUrl) break;
      await sleep(1000);
      ev = enrich(fbId, ev);
    }

    const attempts = (st?.attempts || 0) + 1;
    if (!ev.startMs) {
      await PP.store.setState(fbId, { status: 'error', attempts, reason: 'no-date', ts: Date.now() });
      PP.log.warn('SKIP no-date |', ev.title || fbId, '|', fbId);
      return;
    }
    if (!ev.mediaUrl) {
      await PP.store.setState(fbId, { status: 'error', attempts, reason: 'no-image', ts: Date.now() });
      PP.log.warn('SKIP no-image |', ev.title || fbId, '|', fbId);
      return;
    }

    PP.log.info('SUBMIT start |', ev.title, '|', fbId);
    // Cover first — a NetworkError here is almost always CORS on the cover host
    // (e.g. lookaside.fbsbx.com), not the ingest API. Log the host so it is
    // obvious which request failed.
    let media;
    try {
      media = await PP.image.prepare(ev.mediaUrl);
    } catch (e) {
      let host = 'unknown';
      try { host = new URL(ev.mediaUrl).host; } catch { /* ignore */ }
      const reason = `cover-fetch(${host}): ${(e && e.message) || e}`;
      await PP.store.setState(fbId, { status: 'error', attempts, reason: reason.slice(0, 200), ts: Date.now() });
      PP.log.warn('SKIP cover-fetch |', ev.title, '|', fbId, '|', reason);
      return;
    }
    let result;
    try {
      result = await PP.api.upload(s, ev, media);
    } catch (e) {
      result = { error: String((e && e.message) || e) };
    }

    if (result.error) {
      await PP.store.setState(fbId, { status: 'error', attempts, reason: result.error.slice(0, 200), ts: Date.now() });
      PP.log.warn('INGEST error |', ev.title, '|', fbId, '|', result.error);
      return;
    }
    const d = result;
    if (d.status === 'pending' || d.status === 'ingested' || d.status === 'duplicate') {
      await PP.store.setState(fbId, { status: d.status, attempts, reason: d.status === 'duplicate' ? (d.winner?.provider || 'duplicate') : (d.geo || 'geo'), ts: Date.now() });
      PP.log.info(
        'INGEST', d.status, '|', ev.title, '|', fbId,
        d.status === 'duplicate' ? `winner=${d.winner?.provider}` : `geo=${d.geo || '?'}`,
      );
    } else {
      await PP.store.setState(fbId, { status: 'error', attempts, reason: `status:${d.status}`, ts: Date.now() });
      PP.log.warn('INGEST error |', ev.title, '|', fbId, '|', 'status:', d.status);
    }
  }

  // Resume the queue on load for events captured in earlier sessions.
  (async () => {
    const s = await PP.settings.get();
    const states = await PP.store.loadStates();
    for (const [fbId, st] of Object.entries(states)) {
      if (st.status === 'captured' || (st.status === 'error' && (st.attempts || 0) < (s.maxAttempts || 3))) {
        enqueue(fbId);
      }
    }
  })();

  /** Re-extract the live card and keep any freshly-filled fields (image/date). */
  function enrich(fbId, ev) {
    const a = document.querySelector(`a[href*="/events/${fbId}"]`);
    if (!a) return ev;
    const fresh = extractOne(a);
    if (!fresh) return ev;
    const out = { ...ev };
    for (const k of ['title', 'startMs', 'venue', 'address', 'city', 'location', 'mediaUrl']) {
      if (fresh[k]) out[k] = fresh[k];
    }
    return out;
  }

  // ---------- manual submit (summary fallback) ----------
  async function submitEvents(settings, events) {
    PP.log.info('SUBMIT manual', events.length, 'event(s)');
    const results = [];
    for (const ev of events) {
      const externalId = `facebook-${ev.fbId}`;
      try {
        const media = await PP.image.prepare(ev.mediaUrl);
        const data = await PP.api.upload(settings, ev, media);
        results.push({ externalId, ok: true, data });
      } catch (e) {
        results.push({ externalId, ok: false, error: String((e && e.message) || e) });
      }
    }
    return results;
  }

  // ---------- DOM extraction ----------
  /** Extract ONE event from a single `/events/<id>` anchor. */
  function extractOne(a) {
    const m = /\/events\/(\d+)/.exec(a.href || '');
    if (!m) return null;
    const fbId = m[1];
    const card = closestCard(a);
    const root = card || a.parentElement;

    const title = pickTitle(a);
    const lines = cardTextLines(root);
    const dateText = lines.find((l) => PP.parser.looksLikeDate(l));
    const locText = locationLine(lines, title);
    const place = PP.parser.parsePlace(locText);
    const startMs = PP.parser.parseFbDate(dateText);
    const img = largestImg(root);

    return {
      fbId,
      title,
      startMs,
      location: (locText || '').trim(),
      venue: place.venue,
      address: place.address,
      city: place.city,
      link: `https://www.facebook.com/events/${fbId}/`,
      mediaUrl: img ? absUrl(img) : null,
      source: 'dom',
      capturedAt: Date.now(),
      needsReview: !title || !startMs,
    };
  }

  /** Bulk DOM scrape (summary "refresh" + old flow). */
  function scrapeDom() {
    const seen = new Set();
    const events = [];
    for (const a of document.querySelectorAll('a[href*="/events/"]')) {
      const ev = extractOne(a);
      if (ev && !seen.has(ev.fbId)) {
        seen.add(ev.fbId);
        events.push(ev);
      }
    }
    return events;
  }

  /** The title = the anchor's own text line, minus date/social/RSVP, minus trailing dates. */
  function pickTitle(a) {
    const anchorLines = textLines(a);
    const line =
      anchorLines.find(
        (l) =>
          l.length > 1 &&
          !PP.parser.looksLikeDate(l) &&
          !PP.parser.isSocialLine(l) &&
          !PP.parser.isRsvpLine(l),
      ) || '';
    return PP.parser.stripTrailingDates(line || (a.getAttribute('aria-label') || '').trim());
  }

  /** Distinct text lines inside an element (the card or the anchor). */
  function textLines(root) {
    const lines = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const t = walker.currentNode.textContent.trim();
      if (t) lines.push(t);
    }
    return [...new Set(lines)];
  }

  const cardTextLines = textLines;

  /**
   * Location line: prefer the address-like line; never the title, date, social
   * or RSVP text. Fallback = the first clean line after the title (venue name),
   * then any clean line.
   */
  function locationLine(lines, title) {
    const clean = lines.filter(
      (l) =>
        l !== title &&
        !PP.parser.looksLikeDate(l) &&
        !PP.parser.isSocialLine(l) &&
        !PP.parser.isRsvpLine(l),
    );
    const addr = clean.find((l) => PP.parser.looksLikeLocation(l));
    if (addr) return addr;
    const idx = lines.indexOf(title);
    const after = idx >= 0 ? lines.slice(idx + 1) : lines;
    return after.find((l) => clean.includes(l)) || clean[0] || '';
  }

  function closestCard(el) {
    let node = el;
    for (let i = 0; i < 5 && node; i++) {
      node = node.parentElement;
      if (node && node.querySelectorAll('img').length >= 1 && (node.textContent || '').length > 40) return node;
    }
    return el.parentElement;
  }

  function largestImg(root) {
    const imgs = Array.from(root.querySelectorAll('img'))
      .filter((img) => /^https?:\/\//.test(img.currentSrc || img.src || ''))
      .sort((x, y) => (y.naturalWidth || 0) - (x.naturalWidth || 0));
    const img = imgs[0];
    return img ? (img.currentSrc || img.src) : null;
  }

  function absUrl(u) {
    try {
      return new URL(u, location.href).href;
    } catch {
      return u;
    }
  }
}
