// Seed ingest API client — all HTTP calls, taking baseUrl/adminSecret/deviceId
// explicitly (no module-level env reads) so they can be driven in tests.
export function createApi({ baseUrl, adminSecret, deviceId }) {
  async function login() {
    const res = await fetch(`${baseUrl}/auth/device`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ device_id: deviceId }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`auth/device -> ${res.status}`);
    return (await res.json()).session_token;
  }

  async function fetchSeedIds(path) {
    if (!adminSecret) return new Set();
    try {
      const res = await fetch(`${baseUrl}${path}`, {
        headers: { Authorization: `Bearer ${adminSecret}` },
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) return new Set();
      const data = await res.json();
      return new Set(Array.isArray(data.ids) ? data.ids : []);
    } catch {
      return new Set(); // fail-open
    }
  }

  async function fetchBlacklist() {
    if (!adminSecret) return [];
    try {
      const res = await fetch(`${baseUrl}/admin/seed/blacklist`, {
        headers: { Authorization: `Bearer ${adminSecret}` },
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data.rules) ? data.rules : [];
    } catch {
      return []; // fail-open: a blacklist outage never blocks the seed
    }
  }

  async function patchAffiliate(entry) {
    const res = await fetch(`${baseUrl}/admin/seed/affiliate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminSecret}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ external_id: entry.external_id, link_url: entry.affiliate_link, source_url: entry.link }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`affiliate update -> ${res.status}`);
  }

  // POST /posts with the media form. auth/device keeps a SINGLE session per
  // device — a concurrent seed run (e.g. the 5-min cron) re-logins and
  // invalidates our token mid-upload. On 401, re-login once and retry.
  async function upload(session, entry, media, createdAt) {
    const form = new FormData();
    form.append('type', media.type);
    form.append('lat', String(entry.lat));
    form.append('lng', String(entry.lng));
    form.append('description', entry.description || entry.title || '');
    form.append('created_at', String(createdAt));
    form.append('is_sponsored', '1');
    // Affiliate swap (going): the app opens the TD click URL (commission earned);
    // the plain goingapp URL rides along as source_url for provenance/rebuilds.
    const linkUrl = entry.affiliate_link || entry.link;
    if (linkUrl) form.append('link_url', linkUrl);
    if (entry.affiliate_link && entry.link) form.append('source_url', entry.link);
    form.append('external_id', entry.external_id);
    if (entry.showtimes) form.append('showtimes', JSON.stringify(entry.showtimes));
    if (entry.showtime_booking) form.append('showtime_booking', JSON.stringify(entry.showtime_booking));
    if (entry.tags && entry.tags.length) form.append('tags', JSON.stringify(entry.tags));
    if (entry.partner_id) form.append('partner_id', String(entry.partner_id));
    if (entry.partner_name) form.append('partner_name', String(entry.partner_name));
    // Fallback-geo events (no_geo) stay PENDING — never shown until the admin fixes
    // geo / approves. Normal events are created approved (no status field).
    if (entry.no_geo) form.append('status', 'pending');
    form.append('file', new Blob([media.file], { type: media.mime }), media.fileName);
    form.append('thumb', new Blob([media.thumb], { type: 'image/jpeg' }), 'thumb.jpg');

    const doPost = (tok) => fetch(`${baseUrl}/posts`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tok}` },
      body: form,
      signal: AbortSignal.timeout(90_000),
    });
    let res = await doPost(session.token);
    if (res.status === 401) {
      session.token = await login();
      res = await doPost(session.token);
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`POST /posts -> ${res.status}: ${JSON.stringify(data)}`);
    return data;
  }

  return { login, fetchSeedIds, fetchBlacklist, patchAffiliate, upload };
}