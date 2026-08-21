// Normalization of captured Facebook events (GraphQL feed nodes + DOM scrape).
// Pure functions, shared by the background capture, the DOM-scrape fallback and
// the summary page.
(function () {
  'use strict';

  const COUNTRY_RE = /^(poland|polska)$/i;
  const ADDRESS_RE = /\d|^(ul\.?|ulica|al\.?|aleja|pl\.?|plac|os\.?|rondo|skwer|bulwar)\b/i;

  /** Diacritic-fold + lowercase (for city-token matching: "Poznań" == "poznan"). */
  function fold(s) {
    return (s || '').toLowerCase().replace(/ł/g, 'l').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  // Common Polish city names (incl. locative/instrumental forms) -> nominative.
  // Used to fill the city field when FB's place string carries it inside the
  // address ("Zespół … nr 12 w Poznaniu") but the split left city empty.
  const CITY_VARIANTS = {
    poznan: 'Poznań', poznania: 'Poznań', poznaniu: 'Poznań',
    warsaw: 'Warszawa', warszawa: 'Warszawa', warszawy: 'Warszawa', warszawie: 'Warszawa',
    krakow: 'Kraków', krakowa: 'Kraków',
    gdansk: 'Gdańsk', gdanska: 'Gdańsk',
    wroclaw: 'Wrocław', wroclawia: 'Wrocław',
    lodz: 'Łódź', katowice: 'Katowice', szczecin: 'Szczecin', lublin: 'Lublin',
  };

  /** Find a known city token anywhere in the string; empty when none. */
  function cityFromText(raw) {
    const s = fold(raw);
    if (!s) return '';
    for (const [key, city] of Object.entries(CITY_VARIANTS)) {
      if (new RegExp(`\\b${key}\\b`).test(s)) return city;
    }
    return '';
  }

  function isCountry(s) {
    return COUNTRY_RE.test(s);
  }

  function isAddressLike(s) {
    return ADDRESS_RE.test(s);
  }

  /** "00-901 Warsaw" -> "Warsaw" (strip a leading postal code, if any). */
  function cityFrom(segment) {
    const withoutPostal = (segment || '').trim().replace(/^\d{2}-\d{3}\s*/, '').trim();
    return withoutPostal;
  }

  /**
   * Split a Facebook place string ("event_place.contextual_name") into
   * venue / address / city. Heuristics: the first non-address segment is the
   * venue, address-like segments (digits / "ul." prefixes) go to address, the
   * last non-country segment is the city (postal codes stripped). No fallback —
   * city comes only from the GraphQL place string.
   */
  function parsePlace(raw) {
    const parts = (raw || '').split(',').map((s) => s.trim()).filter(Boolean);
    const rest = parts.filter((p) => !isCountry(p));
    const citySegment = rest.length > 1 ? rest[rest.length - 1] : '';
    let city = cityFrom(citySegment);
    // The city may be embedded in the address ("… w Poznaniu") with no comma
    // segment of its own — extract it so the geo guard doesn't refuse geocoding.
    if (!city) city = cityFromText(raw);
    const venue = rest.find((p) => !isAddressLike(p) && p !== citySegment) || '';
    const address = rest.filter(isAddressLike).join(', ');
    return { venue, address, city };
  }

  function parseInterest(text) {
    const m = /([\d.,\s]+?)\s*interested/i.exec(text || '');
    if (!m) return null;
    const n = Number.parseFloat(m[1].replace(/[\s,]/g, ''));
    return Number.isFinite(n) ? Math.round(n) : null;
  }

  // ---------- DOM date parsing ----------

  // English + Polish month names/abbreviations -> month index.
  const MONTHS = {
    jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
    january: 0, february: 1, march: 2, april: 3, june: 5, july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
    sty: 0, lut: 1, kwi: 3, cze: 5, lip: 6, sie: 7, wrz: 8, paz: 9, lis: 10, gru: 11,
    stycznia: 0, lutego: 1, marca: 2, kwietnia: 3, maja: 4, czerwca: 5, lipca: 6, sierpnia: 7, wrzesnia: 8, pazdziernika: 9, listopada: 10, grudnia: 11,
  };
  const MONTH_RE = /(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|sty|lut|kwi|cze|lip|sie|wrz|paz|lis|gru)\b/;

  // English + Polish day names/abbreviations -> JS getDay() index.
  const DAYS = {
    sunday: 0, sun: 0, monday: 1, mon: 1, tuesday: 2, tue: 2, wednesday: 3, wed: 3,
    thursday: 4, thu: 4, friday: 5, fri: 5, saturday: 6, sat: 6,
    niedziela: 0, ndz: 0, poniedzialek: 1, pon: 1, wtorek: 2, wt: 2, sroda: 3, sr: 3,
    czwartek: 4, czw: 4, piatek: 5, pt: 5, sobota: 6, sob: 6,
  };
  const DAY_RE = /(sunday|sun|monday|mon|tuesday|tue|wednesday|wed|thursday|thu|friday|fri|saturday|sat|niedziela|ndz|poniedzialek|pon|wtorek|wt|sroda|sr|czwartek|czw|piatek|pt|sobota|sob)\b/;

  /** Extract "HH:MM" offset from a date string ("4:30 PM", "18:00"). */
  function extractTime(s) {
    const m12 = /(\d{1,2})(?::(\d{2}))?\s*(a\.?m|p\.?m)\b/.exec(s);
    if (m12) {
      let h = parseInt(m12[1], 10) % 12;
      const min = m12[2] ? parseInt(m12[2], 10) : 0;
      if (m12[3][0] === 'p') h += 12;
      return (h * 60 + min) * 60000;
    }
    const m24 = /(\d{1,2}):(\d{2})/.exec(s);
    if (m24) {
      const h = parseInt(m24[1], 10);
      const min = parseInt(m24[2], 10);
      if (h <= 23 && min <= 59) return (h * 60 + min) * 60000;
    }
    return null;
  }

  /** RSVP/button-ish text that must never be picked as a field ("Interested"). */
  const RSVP_RE = /^(interested|going|maybe|declined|share|more|all reactions|see all|invite)\b/i;
  /** Social-context lines ("228 interested · 44 going"). */
  const SOCIAL_RE = /^\d[\d.,\s]*\s*(interested|going|went|joined)/i;

  function isRsvpLine(t) {
    return RSVP_RE.test((t || '').trim());
  }

  function isSocialLine(t) {
    return SOCIAL_RE.test((t || '').trim());
  }

  /** Is this a Facebook date/datetime line ("Today at 4:30 PM", "This Sunday at 12 PM", "Thu, Aug 20")? */
  function looksLikeDate(t) {
    const s = (t || '').toLowerCase();
    if (/happening now|trwa teraz/.test(s)) return true;
    if (/today|tomorrow|dzisiaj|jutro/.test(s)) return true;
    if (/\d{1,2}/.test(s) && MONTH_RE.test(s)) return true; // "Thu, Aug 20", "22 sie"
    // weekday-relative: "This Sunday at 12 PM", "Next Saturday at 9:00 AM", "Friday at 8 PM"
    if (DAY_RE.test(s) && (/\b(this|next|coming)\b/.test(s) || /\bat\b|\d{1,2}[:.]|a\.?m\b|p\.?m\b/.test(s))) return true;
    return false;
  }

  /**
   * Is this an address/place line? Requires an address signature (postal code,
   * street prefix, or a comma-separated place ending in country/city) — a bare
   * "has digits" check is NOT enough (titles like "Foo | 21-23.08.2026" contain
   * digits but are not addresses).
   */
  function looksLikeLocation(t) {
    const s = (t || '').trim();
    if (!s) return false;
    if (looksLikeDate(s) || isSocialLine(s) || isRsvpLine(s)) return false;
    if (/^\d{2}-\d{3}/.test(s)) return true; // postal code
    if (/^(ul\.?|al\.?|pl\.?|os\.?|rondo|aleja|plac|skwer|bulwar)\b/i.test(s)) return true; // street prefix
    if (/,?\s*(poland|polska)$/i.test(s)) return true; // "…, Poland"
    return /\d/.test(s) && /,/.test(s); // "Garbary 64, 61-758 Poznan, Poland"
  }

  /**
   * Strip a host-added trailing date/date-range from a title, e.g.
   * "Foo | 21-23.08.2026" -> "Foo", "Foo 21.08–23.08.2026" -> "Foo",
   * "Foo | 21.08.2026" -> "Foo".
   */
  const DATE_RE = String.raw`\d{1,2}[.\-/]\d{1,2}(?:[.\-/]\d{2,4})?`;
  const TRAILING_DATE_RE = new RegExp(
    `(?:\\s*\\|\\s*)?(?:${DATE_RE}\\s*[-–]\\s*${DATE_RE}|\\d{1,2}\\s*[-–]\\s*${DATE_RE}|${DATE_RE})\\s*$`,
  );

  function stripTrailingDates(title) {
    return (title || '').trim().replace(TRAILING_DATE_RE, '').trim();
  }

  /**
   * Parse a Facebook date/datetime string into epoch ms. Supports:
   *   "Today at 4:30 PM", "Tomorrow at 9:00 AM", "Happening now",
   *   "This Sunday at 12 PM", "Next Saturday at 9:00 AM", "Friday at 8 PM",
   *   "Thu, Aug 20 at 6:00 PM", "Aug 20, 2026 at 6:00 PM",
   *   "Sob., 22 sie, 18:00", "Thu, Aug 20" (no time -> noon).
   * Missing years are inferred (upcoming -> current or next year).
   */
  function parseFbDate(text, nowMs) {
    const now = new Date(nowMs || Date.now());
    const s = String(text || '')
      .toLowerCase()
      .replace(/[.,]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!s) return null;
    if (/happening now|trwa teraz/.test(s)) return now.getTime();

    const tokens = s.split(' ');
    const yearMatch = /(19|20)\d{2}/.exec(s);
    const explicitYear = yearMatch ? parseInt(yearMatch[0], 10) : null;
    const timeMs = extractTime(s);

    let month = -1;
    let day = null;
    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i] in MONTHS) {
        month = MONTHS[tokens[i]];
        const prev = parseInt(tokens[i - 1], 10);
        const next = parseInt(tokens[i + 1], 10);
        if (Number.isFinite(prev) && prev >= 1 && prev <= 31) day = prev;
        else if (Number.isFinite(next) && next >= 1 && next <= 31) day = next;
        break;
      }
    }

    const nowMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    let base;
    if (/today|dzisiaj|dzis\b/.test(s)) {
      base = nowMidnight;
    } else if (/tomorrow|jutro/.test(s)) {
      base = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    } else if (month >= 0 && day) {
      const y = explicitYear ?? now.getFullYear();
      base = new Date(y, month, day);
      if (explicitYear === null && base < nowMidnight) base = new Date(y + 1, month, day);
    } else if (DAY_RE.test(s)) {
      // weekday-relative: "This Sunday at 12 PM", "Next Saturday at 9:00 AM"
      const dow = tokens.find((t) => t in DAYS);
      const dayIndex = DAYS[dow];
      let diff = (dayIndex - now.getDay() + 7) % 7;
      if (/next\b/.test(s) && !/this\b/.test(s)) diff += 7;
      if (diff === 0 && timeMs !== null && nowMidnight.getTime() + timeMs < now.getTime()) diff += 7;
      base = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diff);
    } else {
      return null;
    }

    return base.getTime() + (timeMs ?? 12 * 3600000);
  }

  function normalizeNode(node) {
    const fbId = String((node && node.id) || '').trim();
    if (!fbId) return null;
    const title = stripTrailingDates(String(node.name || '').trim());
    const startSec = Number(node.start_timestamp);
    // Some GraphQL variants expose only event_place.name; contextual_name is the
    // richer place string ("ulica Jana Baptysty Quadro, 61-772 Poznań, Polska").
    const placeRaw = node.event_place && (node.event_place.contextual_name || node.event_place.name);
    const place = parsePlace(placeRaw);
    return {
      fbId,
      title,
      startMs: Number.isFinite(startSec) && startSec > 0 ? startSec * 1000 : null,
      location: (placeRaw || '').trim(),
      venue: place.venue,
      address: place.address,
      city: place.city,
      link: node.eventUrl || `https://www.facebook.com/events/${fbId}/`,
      mediaUrl:
        (node.cover_photo && node.cover_photo.photo && node.cover_photo.photo.image && node.cover_photo.photo.image.uri) ||
        null,
      interested: parseInterest(node.social_context && node.social_context.text),
      source: 'network',
      capturedAt: Date.now(),
      needsReview: !title || !Number.isFinite(startSec) || startSec <= 0,
    };
  }

  /** Depth-first search for any `{ events: { edges: [{ node }] } }` shape. */
  function findEventNodes(root) {
    const out = [];
    (function walk(o) {
      if (!o || typeof o !== 'object') return;
      if (Array.isArray(o)) {
        for (const x of o) walk(x);
        return;
      }
      if (Array.isArray(o.edges)) {
        for (const e of o.edges) {
          const n = e && e.node;
          if (n && typeof n === 'object' && n.id && n.eventUrl) out.push(n);
        }
      }
      for (const k of Object.keys(o)) walk(o[k]);
    })(root);
    return out;
  }

  /**
   * Parse a GraphQL response body into normalized events.
   * Online-only events (no geo venue) are skipped entirely.
   */
  function eventsFromGraphql(text) {
    let root;
    try {
      root = JSON.parse(text);
    } catch {
      return [];
    }
    const seen = new Set();
    const events = [];
    for (const node of findEventNodes(root)) {
      if (node.is_online === true) continue;
      const norm = normalizeNode(node);
      if (!norm || seen.has(norm.fbId)) continue;
      seen.add(norm.fbId);
      events.push(norm);
    }
    return events;
  }

  /** YYYY-MM-DD of an instant in Europe/Warsaw (mirrors backend dates.ts). */
  function warsawDayKey(ms) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Europe/Warsaw', year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(new Date(ms));
    const f = (t) => (parts.find((p) => p.type === t) || {}).value || '';
    return `${f('year')}-${f('month')}-${f('day')}`;
  }

  /**
   * The backend only ingests events whose day is within [now-24h, now+1y] (its
   * created_at = 06:00 Warsaw of the event day) — i.e. today or later. Events
   * from an earlier day are rejected at the endpoint, so the summary unchecks
   * them by default (past -> true).
   */
  function isPastEvent(startMs, nowMs) {
    if (!startMs) return true;
    return warsawDayKey(startMs) < warsawDayKey(nowMs || Date.now());
  }

  globalThis.PP = globalThis.PP || {};
  PP.parser = {
    parsePlace, normalizeNode, eventsFromGraphql, findEventNodes,
    parseFbDate, looksLikeDate, looksLikeLocation,
    isSocialLine, isRsvpLine, stripTrailingDates, isPastEvent,
  };
})();
