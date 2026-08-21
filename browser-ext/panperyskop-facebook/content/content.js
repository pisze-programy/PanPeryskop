// Content script (runs on facebook.com). Three jobs:
//   1. Relay capture summaries from the background (webRequest) to this page's
//      console so captures are visible while working.
//   2. DOM-scrape fallback for the current page (when no GraphQL captures exist).
//   3. Submitting events: fetch each cover in the logged-in page context,
//      downscale, and POST multipart to the PanPeryskop ingest endpoint.
'use strict';

if (!globalThis.__ppContentLoaded) {
  globalThis.__ppContentLoaded = true;

  const LOG = '[panperyskop]';

  browser.runtime.onMessage.addListener(async (msg) => {
    switch (msg && msg.type) {
      case 'pp-scrape-dom':
        return scrapeDom();
      case 'pp-submit-events': {
        const s = msg.settings || (await PP.settings.get());
        return submitEvents(s, msg.events);
      }
      case 'pp-captured':
        logCapture(msg.events || []);
        return undefined;
      case 'pp-capture-debug':
        console.warn(`${LOG} ${msg.line}`);
        return undefined;
      default:
        return undefined;
    }
  });

  // Capture summaries relayed from the background (webRequest capture) — visible
  // in THIS page's console.
  function logCapture(events) {
    console.group(`${LOG} captured ${events.length} facebook event(s)`);
    for (const e of events) {
      const when = e.startMs ? new Date(e.startMs).toLocaleString() : 'unknown time';
      console.log(`${e.title} | ${when} | ${e.location || e.link}`);
    }
    console.groupEnd();
  }

  console.log(`${LOG} content script ready`);

  // ---------- submit ----------
  async function submitEvents(settings, events) {
    console.log(`${LOG} submitting ${events.length} event(s)`);
    const results = [];
    for (const ev of events) {
      const externalId = `facebook-${ev.fbId}`;
      try {
        const media = await PP.image.prepare(ev.mediaUrl);
        const data = await PP.api.upload(settings, ev, media);
        results.push({ externalId, ok: true, data });
        console.log(`${LOG} ✓ ${ev.title} -> ${data.status}`, data);
      } catch (e) {
        results.push({ externalId, ok: false, error: String((e && e.message) || e) });
        console.warn(`${LOG} ✗ ${ev.title}: ${(e && e.message) || e}`);
      }
    }
    return results;
  }

  // ---------- DOM fallback (best-effort) ----------
  function scrapeDom() {
    const anchors = Array.from(document.querySelectorAll('a[href*="/events/"]'));
    const seen = new Set();
    const events = [];
    for (const a of anchors) {
      const m = /\/events\/(\d+)/.exec(a.href || '');
      if (!m) continue;
      const fbId = m[1];
      if (seen.has(fbId)) continue;
      seen.add(fbId);
      const card = closestCard(a);
      const root = card || a.parentElement;

      const title = pickTitle(a);
      const lines = cardTextLines(root);
      const dateText = lines.find((l) => PP.parser.looksLikeDate(l));
      const locText = locationLine(lines, title);
      const place = PP.parser.parsePlace(locText);
      const startMs = PP.parser.parseFbDate(dateText);
      const img = largestImg(root);

      events.push({
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
      });
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
    const imgs = Array.from(root.querySelectorAll('img'));
    imgs.sort((x, y) => (y.naturalWidth || 0) - (x.naturalWidth || 0));
    return imgs[0] ? imgs[0].src : null;
  }

  function absUrl(u) {
    try {
      return new URL(u, location.href).href;
    } catch {
      return u;
    }
  }
}
