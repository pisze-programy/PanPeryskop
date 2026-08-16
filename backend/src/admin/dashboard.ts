import {Hono} from 'hono';
import {bars, cards, empty, esc, fmtDate, fmtDur, fmtPct, page, pill} from './ui';
import {adminLogin, COOKIE_NAME, getClientIp, readSession} from './auth';
import {CITIES} from './cities';
import {browserBudget, cronInfo, daySeries, eventsSql, nearestCity} from './queries';
import {runSeed, seedTomorrow} from '../seed';

export const dashboardRoutes = new Hono<{ Bindings: Env }>();


function setSessionCookie(res: Response, value: string, maxAgeSec: number): Response {
  const headers = new Headers(res.headers);
  headers.set('Set-Cookie', `${COOKIE_NAME}=${value}; Path=/admin; HttpOnly; SameSite=Strict; Secure; Max-Age=${maxAgeSec}`);
  return new Response(res.body, { status: res.status, headers });
}
function clearCookie(): string {
  return `${COOKIE_NAME}=; Path=/admin; HttpOnly; SameSite=Strict; Secure; Max-Age=0`;
}
async function requireSession(c: { env: Env; req: { header: (n: string) => string | undefined } }) {
  const cookie = c.req.header('Cookie');
  const m = cookie?.match(new RegExp(`(?:^|; )${COOKIE_NAME}=([^;]+)`));
  return readSession(c.env, m?.[1]);
}

dashboardRoutes.get('/login', async (c) => {
  const session = await requireSession(c);
  if (session) return c.redirect('/admin');
  const body = `<div style="max-width:380px;margin:10vh auto">
    <div class="card card-lg"><div class="card-body p-4">
      <h2 class="card-title mb-1">PanPeryskop · Admin</h2>
      <p class="text-secondary mb-3">Zaloguj się (sesja 4h)</p>
      <form method="post" action="/admin/login">
        <div class="mb-3"><input type="password" name="password" class="form-control" placeholder="Hasło" required autofocus /></div>
        <button class="btn btn-primary w-100" type="submit">Zaloguj</button>
      </form>
    </div></div></div>`;
  return page('Logowanie', '', body);
});

dashboardRoutes.post('/login', async (c) => {
  const parsed = (await c.req.parseBody<Record<string, string>>().catch(() => ({}))) as Record<string, string>;
  const password = String(parsed.password || '');
  const ip = getClientIp(c);
  const { cookie, reason } = await adminLogin(c.env, password, ip);
  if (cookie) return setSessionCookie(c.redirect('/admin'), cookie, 4 * 3600);
  const msg =
    reason === 'rate' ? 'Za dużo prób. Spróbuj za 15 min.' :
    reason === 'unconfigured' ? 'Hasło admina nie jest skonfigurowane (ADMIN_PASSWORD_HASH).' :
    'Nieprawidłowe hasło.';
  const body = `<div style="max-width:380px;margin:10vh auto"><div class="card"><div class="card-body p-4">
    <div class="alert alert-danger">${esc(msg)}</div>
    <a class="btn btn-outline-secondary" href="/admin/login">Wróć</a></div></div></div>`;
  return page('Logowanie', '', body);
});

dashboardRoutes.get('/logout', async (c) => {
  const res = c.redirect('/admin/login');
  const headers = new Headers(res.headers);
  headers.set('Set-Cookie', clearCookie());
  return new Response(res.body, { status: res.status, headers });
});

// ---------- JSON API (cookie-auth) ----------
async function api(c: any, handler: (env: Env) => Promise<unknown>) {
  const session = await requireSession(c);
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  try {
    return c.json(await handler(c.env));
  } catch (e) {
    return c.json({ error: (e as Error).message }, 500);
  }
}

dashboardRoutes.get('/api/overview', (c) => api(c, async (env) => {
  const db = env.DB;
  const now = Date.now();
  const dayStart = now - 24 * 3600 * 1000;
  const [users, posts, evToday, viewsToday, likes, shares, mediaReq, errs, banned, lastSeed, cron, budget] = await Promise.all([
    db.prepare('SELECT COUNT(*) n FROM users').first<{ n: number }>(),
    db.prepare('SELECT COUNT(*) n FROM posts').first<{ n: number }>(),
    db.prepare('SELECT COUNT(*) n FROM posts WHERE category=? AND created_at>=? AND created_at<=?').bind('events', dayStart, now).first<{ n: number }>(),
    db.prepare('SELECT COUNT(*) n FROM views WHERE created_at>=?').bind(dayStart).first<{ n: number }>(),
    db.prepare('SELECT COUNT(*) n FROM likes').first<{ n: number }>(),
    db.prepare('SELECT COUNT(*) n FROM shares').first<{ n: number }>(),
    db.prepare('SELECT COUNT(*) n FROM media_requests').first<{ n: number }>(),
    db.prepare('SELECT COUNT(*) n FROM client_errors WHERE created_at>=?').bind(dayStart).first<{ n: number }>(),
    db.prepare('SELECT COUNT(*) n FROM banned_devices').first<{ n: number }>(),
    db.prepare('SELECT * FROM seed_runs WHERE provider=? ORDER BY created_at DESC LIMIT 1').bind('total').first(),
    cronInfo(env, db),
    env.BROWSER ? browserBudget(env) : null,
  ]);
  return {
    users: users?.n ?? 0, posts: posts?.n ?? 0, eventsToday: evToday?.n ?? 0,
    viewsToday: viewsToday?.n ?? 0, likes: likes?.n ?? 0, shares: shares?.n ?? 0,
    mediaRequests: mediaReq?.n ?? 0, errorsToday: errs?.n ?? 0, banned: banned?.n ?? 0,
    lastSeed, cron, budget,
  };
}));

dashboardRoutes.get('/api/events', (c) => api(c, async (env) => {
  const q = c.req.query();
  const { sql, binds } = eventsSql({
    cityId: q.city ? String(q.city) : null,
    source: q.source ? String(q.source) : null,
    status: q.status ? String(q.status) : null,
    day: q.day ? String(q.day) : null,
    fromMs: null, toMs: null, limit: 300,
  });
  const { results } = await env.DB.prepare(sql).bind(...binds).all();
  const out = (results as any[]).map((r) => ({
    ...r, city: nearestCity(r.lat, r.lng), thumb_url: r.thumb_key ? `/media/${r.thumb_key}` : null,
  }));
  return { events: out, cities: CITIES };
}));

dashboardRoutes.get('/api/users', (c) => api(c, async (env) => {
  const { results } = await env.DB
    .prepare(`SELECT u.id, u.device_id, u.username, u.auth_provider, u.created_at,
              (SELECT COUNT(*) FROM posts p WHERE p.user_id=u.id) AS post_count,
              (SELECT COUNT(*) FROM views v WHERE v.user_id=u.id) AS view_count,
              EXISTS(SELECT 1 FROM banned_devices b WHERE b.device_id=u.device_id) AS banned
              FROM users u ORDER BY u.created_at DESC LIMIT 200`).all();
  return { users: results };
}));

dashboardRoutes.get('/api/posts', (c) => api(c, async (env) => {
  const q = c.req.query();
  const status = q.status ? String(q.status) : null;
  let sql = `SELECT p.id, p.description, p.created_at, p.status, p.type, p.thumb_key, p.likes_count, p.views_count,
             COALESCE(NULLIF(u.username,''), u.device_id) AS author
             FROM posts p JOIN users u ON p.user_id=u.id WHERE p.category='live'`;
  const binds: unknown[] = [];
  if (status) { sql += ' AND p.status=?'; binds.push(status); }
  sql += ' ORDER BY p.created_at DESC LIMIT 200';
  const { results } = await env.DB.prepare(sql).bind(...binds).all();
  return { posts: results };
}));

dashboardRoutes.get('/api/seed', (c) => api(c, async (env) => {
  const q = c.req.query();
  const days = parseInt(String(q.days || '30'), 10) || 30;
  const since = Date.now() - days * 86400000;
  const { results } = await env.DB.prepare('SELECT * FROM seed_runs WHERE created_at>=? ORDER BY created_at DESC LIMIT 500').bind(since).all();
  const budget = env.BROWSER ? await browserBudget(env) : null;
  const cron = await cronInfo(env, env.DB);
  return { runs: results, budget, cron };
}));

dashboardRoutes.post('/api/seed/run', (c) => api(c, async (env) => {
  const body = (await c.req.json<{ day?: string }>().catch(() => ({}))) as { day?: string };
  const day = body?.day;
  if (day !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error('Invalid day');
  return day ? runSeed(env, day, 'manual') : seedTomorrow(env);
}));

dashboardRoutes.get('/api/stats', (c) => api(c, async (env) => {
  const q = c.req.query();
  const days = parseInt(String(q.days || '14'), 10) || 14;
  const since = Date.now() - days * 86400000;
  const metric = String(q.metric || 'views');
  const map: Record<string, [string, string, string?]> = {
    views: ['views', 'created_at'], media: ['posts', 'created_at'], likes: ['likes', 'created_at'],
    shares: ['shares', 'created_at'], logins: ['auth_events', 'created_at', " AND event='login'"],
    signups: ['auth_events', 'created_at', " AND event='register'"],
  };
  const [table, col, extra] = map[metric] || map.views;
  return { series: await daySeries(env.DB, table, col, since, extra) };
}));

dashboardRoutes.get('/api/errors', (c) => api(c, async (env) => {
  const q = c.req.query();
  const days = parseInt(String(q.days || '7'), 10) || 7;
  const since = Date.now() - days * 86400000;
  const { results } = await env.DB.prepare('SELECT * FROM client_errors WHERE created_at>=? ORDER BY created_at DESC LIMIT 200').bind(since).all();
  return { errors: results };
}));

dashboardRoutes.get('/api/media-requests', (c) => api(c, async (env) => {
  const q = c.req.query();
  const days = parseInt(String(q.days || '14'), 10) || 14;
  const since = Date.now() - days * 86400000;
  const { results } = await env.DB
    .prepare(`SELECT r.id, r.lat, r.lng, r.created_at, COALESCE(NULLIF(u.username,''), u.device_id) AS user
              FROM media_requests r JOIN users u ON r.user_id=u.id WHERE r.created_at>=? ORDER BY r.created_at DESC LIMIT 200`)
    .bind(since).all();
  return { requests: results };
}));

// ---------- SSR pages ----------
async function renderPage(c: any, title: string, active: string, html: string) {
  const session = await requireSession(c);
  if (!session) return c.redirect('/admin/login');
  return page(title, active, html);
}

// Overview
dashboardRoutes.get('/', async (c) => {
  const db = c.env.DB;
  const now = Date.now();
  const dayStart = now - 86400000;
  const [users, posts, evToday, viewsToday, likes, shares, errs, mediaReq, lastSeed, cron, budget] = await Promise.all([
    db.prepare('SELECT COUNT(*) n FROM users').first<{ n: number }>(),
    db.prepare('SELECT COUNT(*) n FROM posts').first<{ n: number }>(),
    db.prepare('SELECT COUNT(*) n FROM posts WHERE category=? AND created_at>=?').bind('events', dayStart).first<{ n: number }>(),
    db.prepare('SELECT COUNT(*) n FROM views WHERE created_at>=?').bind(dayStart).first<{ n: number }>(),
    db.prepare('SELECT COUNT(*) n FROM likes').first<{ n: number }>(),
    db.prepare('SELECT COUNT(*) n FROM shares').first<{ n: number }>(),
    db.prepare('SELECT COUNT(*) n FROM client_errors WHERE created_at>=?').bind(dayStart).first<{ n: number }>(),
    db.prepare('SELECT COUNT(*) n FROM media_requests').first<{ n: number }>(),
    db.prepare('SELECT * FROM seed_runs WHERE provider=? ORDER BY created_at DESC LIMIT 1').bind('total').first<Record<string, unknown>>(),
    cronInfo(c.env, db),
    c.env.BROWSER ? await browserBudget(c.env) : null,
  ]);
  const ccards = cards([
    { label: 'Użytkownicy', value: users?.n ?? 0 },
    { label: 'Posty', value: posts?.n ?? 0 },
    { label: 'Eventy dziś', value: evToday?.n ?? 0, color: 'success' },
    { label: 'Views dziś', value: viewsToday?.n ?? 0 },
    { label: 'Like', value: likes?.n ?? 0 },
    { label: 'Share', value: shares?.n ?? 0, color: 'primary' },
    { label: 'Błędy dziś', value: errs?.n ?? 0, color: (errs?.n ?? 0) > 0 ? 'danger' : '' },
    { label: 'Media Requests', value: mediaReq?.n ?? 0 },
  ]);

  // Cron card
  let cronHtml = `<div class="card mb-3"><div class="card-header"><h3 class="card-title">Cron (planowanie)</h3></div><div class="card-body">`;
  cronHtml += `<p class="mb-1"><strong>Harmonogram:</strong> ${esc(cron.schedules.join(', '))}</p>
    <p class="mb-1 text-secondary">${esc(cron.summary)}</p>`;
  cronHtml += cron.nextRunMs
    ? `<p class="mb-1"><strong>Następny run:</strong> ${fmtDate(cron.nextRunMs)}</p>`
    : `<p class="mb-1 text-warning">Brak zaplanowanego crona.</p>`;
  cronHtml += cron.lastCronRunMs
    ? `<p class="mb-0"><strong>Ostatni cron:</strong> ${fmtDate(cron.lastCronRunMs)} ${pill('OK', 'ok')}</p>`
    : `<p class="mb-0"><strong>Ostatni cron:</strong> <span class="text-warning">jeszcze nie wystartował</span></p>`;
  cronHtml += `</div></div>`;

  // Last seed card
  let seedHtml = `<div class="card mb-3"><div class="card-header"><h3 class="card-title">Ostatni seed</h3></div><div class="card-body">`;
  if (lastSeed) {
    const s = lastSeed as any;
    seedHtml += `<div class="row g-3">
      <div class="col-6 col-md-3"><div class="text-secondary" style="font-size:11px">Dzień</div><div class="fw-bold">${esc(s.day)}</div></div>
      <div class="col-6 col-md-3"><div class="text-secondary" style="font-size:11px">Typ</div><div>${esc(s.run_type)}</div></div>
      <div class="col-6 col-md-3"><div class="text-secondary" style="font-size:11px">Ingest</div><div class="fw-bold">${s.ingested}/${s.candidates}</div></div>
      <div class="col-6 col-md-3"><div class="text-secondary" style="font-size:11px">Błędy</div><div class="${s.errors ? 'text-danger' : 'text-success'}">${s.errors}</div></div>
      <div class="col-6 col-md-3"><div class="text-secondary" style="font-size:11px">Czas</div><div>${fmtDur(s.duration_ms)}</div></div>
      <div class="col-6 col-md-3"><div class="text-secondary" style="font-size:11px">Browser</div><div>${fmtDur(s.browser_ms)}</div></div>
      <div class="col-6 col-md-3"><div class="text-secondary" style="font-size:11px">Wykonany</div><div>${fmtDate(s.created_at)}</div></div>
    </div>`;
  } else seedHtml += '<p class="text-secondary mb-0">Brak uruchomień seeda.</p>';
  if (budget) {
    seedHtml += `<div class="mt-3 d-flex align-items-center" style="gap:10px">
      <span class="text-secondary">Budget Browser Run</span>
      <div class="progress flex-grow-1" style="height:8px"><div class="progress-bar ${budget.exceeded ? 'bg-danger' : 'bg-primary'}" style="width:${Math.min(100, fmtPctNum(budget.monthMs, budget.limitMs))}%"></div></div>
      <span class="${budget.exceeded ? 'text-danger fw-bold' : ''}">${fmtPct(budget.monthMs, budget.limitMs)} (${fmtDur(budget.monthMs)} / ${fmtDur(budget.limitMs)})</span>
    </div>`;
  }
  seedHtml += `</div></div>`;

  const body = `<h2 class="mb-3">Overview</h2>${ccards}${cronHtml}${seedHtml}
  <div class="d-flex gap-2"><a class="btn btn-outline-secondary" href="/admin/stats">Statystyki</a><a class="btn btn-outline-secondary" href="/admin/seed">Logi seed</a></div>`;
  return renderPage(c, 'Overview', '/admin', body);
});

function fmtPctNum(usedMs: number, limitMs: number): number {
  return limitMs > 0 ? Math.round((usedMs / limitMs) * 100) : 0;
}

// Events (city + day + source filters)
dashboardRoutes.get('/events', async (c) => {
  const db = c.env.DB;
  const q = c.req.query();
  const cityId = q.city ? String(q.city) : null;
  const source = q.source ? String(q.source) : null;
  const day = q.day ? String(q.day) : null;
  const { sql, binds } = eventsSql({ cityId, source, status: null, day, fromMs: null, toMs: null, limit: 300 });
  const { results } = await db.prepare(sql).bind(...binds).all();

  const cityOpts = `<option value="">Wszystkie miasta</option>` + CITIES.map((ct) =>
    `<option value="${ct.id}" ${cityId === ct.id ? 'selected' : ''}>${esc(ct.name)}</option>`).join('');
  const srcOpts = `<option value="">Wszystkie źródła</option>
    <option value="going" ${source === 'going' ? 'selected' : ''}>going</option>
    <option value="kupbilecik" ${source === 'kupbilecik' ? 'selected' : ''}>kupbilecik</option>`;

  const rows = (results as any[]).map((e) => `<tr>
    <td>${pill(esc(e.source), e.source === 'going' ? 'ok' : 'muted')}</td>
    <td>${esc((e.description || e.external_id || '').slice(0, 60))}</td>
    <td>${esc(nearestCity(e.lat, e.lng))}</td>
    <td>${fmtDate(e.created_at)}</td>
    <td>${e.status === 'approved' ? pill('approved', 'ok') : pill(esc(e.status), 'err')}</td>
    <td>${e.link_url ? `<a href="${esc(e.link_url)}" target="_blank" rel="noopener">link</a>` : '—'}</td>
    ${e.thumb_key ? `<td><img src="/media/${esc(e.thumb_key)}" style="width:44px;height:44px;object-fit:cover;border-radius:6px" loading="lazy" /></td>` : '<td>—</td>'}</tr>`).join('');

  const body = `<h2 class="mb-3">Eventy</h2>
  <form method="get" action="/admin/events" class="row g-2 mb-3">
    <div class="col-6 col-md-3"><label class="form-label">Miasto</label><select name="city" class="form-select">${cityOpts}</select></div>
    <div class="col-6 col-md-3"><label class="form-label">Źródło</label><select name="source" class="form-select">${srcOpts}</select></div>
    <div class="col-6 col-md-3"><label class="form-label">Dzień (YYYY-MM-DD)</label><input name="day" type="date" class="form-control" value="${esc(day || '')}" /></div>
    <div class="col-6 col-md-3 d-flex align-items-end"><button class="btn btn-primary">Filtruj</button>
      <a class="btn btn-link text-decoration-none" href="/admin/events">Wyczyść</a></div>
  </form>
  <div class="card"><div class="table-responsive"><table class="table table-vcenter card-table">
    <thead><tr><th>Źródło</th><th>Opis</th><th>Miasto</th><th>Czas</th><th>Status</th><th>Link</th><th>Media</th></tr></thead>
    <tbody>${rows || `<tr><td colspan="7">${empty()}</td></tr>`}</tbody></table></div></div>`;
  return renderPage(c, 'Eventy', '/admin/events', body);
});

// Users
dashboardRoutes.get('/users', async (c) => {
  const db = c.env.DB;
  const { results } = await db.prepare(`SELECT u.id, u.device_id, u.username, u.auth_provider, u.created_at,
      (SELECT COUNT(*) FROM posts p WHERE p.user_id=u.id) AS post_count,
      (SELECT COUNT(*) FROM views v WHERE v.user_id=u.id) AS view_count,
      EXISTS(SELECT 1 FROM banned_devices b WHERE b.device_id=u.device_id) AS banned
      FROM users u ORDER BY u.created_at DESC LIMIT 200`).all();
  const rows = (results as any[]).map((u) => `<tr>
    <td class="font-monospace">${esc(u.device_id)}</td><td>${esc(u.username || '—')}</td>
    <td>${esc(u.auth_provider)}</td><td>${fmtDate(u.created_at)}</td>
    <td>${u.post_count}</td><td>${u.view_count}</td>
    <td>${u.banned ? pill('BAN', 'err') : pill('ok', 'ok')}</td></tr>`).join('');
  const body = `<h2 class="mb-3">Użytkownicy</h2>
  <div class="card"><div class="table-responsive"><table class="table table-vcenter card-table">
    <thead><tr><th>Device</th><th>Username</th><th>Provider</th><th>Utworzony</th><th>Posty</th><th>Views</th><th>Status</th></tr></thead>
    <tbody>${rows || `<tr><td colspan="7">${empty()}</td></tr>`}</tbody></table></div></div>`;
  return renderPage(c, 'Użytkownicy', '/admin/users', body);
});

// Posts (live)
dashboardRoutes.get('/posts', async (c) => {
  const db = c.env.DB;
  const { results } = await db.prepare(`SELECT p.id, p.description, p.created_at, p.status, p.type, p.thumb_key, p.likes_count, p.views_count,
    COALESCE(NULLIF(u.username,''), u.device_id) AS author FROM posts p JOIN users u ON p.user_id=u.id
    WHERE p.category='live' ORDER BY p.created_at DESC LIMIT 200`).all();
  const rows = (results as any[]).map((p) => `<tr>
    <td>${esc(p.author)}</td><td>${esc((p.description || '').slice(0, 50))}</td>
    <td>${fmtDate(p.created_at)}</td><td>${p.likes_count}</td><td>${p.views_count}</td>
    <td>${p.status === 'approved' ? pill('approved', 'ok') : pill(esc(p.status), 'err')}</td>
    ${p.thumb_key ? `<td><img src="/media/${esc(p.thumb_key)}" style="width:44px;height:44px;object-fit:cover;border-radius:6px" loading="lazy" /></td>` : '<td>—</td>'}</tr>`).join('');
  const body = `<h2 class="mb-3">Posty (live)</h2>
  <div class="card"><div class="table-responsive"><table class="table table-vcenter card-table">
    <thead><tr><th>Autor</th><th>Opis</th><th>Czas</th><th>Like</th><th>Views</th><th>Status</th><th>Media</th></tr></thead>
    <tbody>${rows || `<tr><td colspan="7">${empty()}</td></tr>`}</tbody></table></div></div>`;
  return renderPage(c, 'Posty', '/admin/posts', body);
});

// Seed
dashboardRoutes.get('/seed', async (c) => {
  const db = c.env.DB;
  const since = Date.now() - 30 * 86400000;
  const { results } = await db.prepare('SELECT * FROM seed_runs WHERE created_at>=? ORDER BY created_at DESC LIMIT 500').bind(since).all();
  const budget = c.env.BROWSER ? await browserBudget(c.env) : null;
  const cron = await cronInfo(c.env, db);
  const rows = (results as any[]).map((r) => `<tr>
    <td>${fmtDate(r.created_at)}</td><td>${esc(r.day)}</td>
    <td>${r.run_type === 'cron' ? pill('cron', 'ok') : pill('manual', 'muted')}</td>
    <td>${esc(r.provider)}</td><td>${esc(r.transport)}</td>
    <td>${r.candidates}</td><td>${r.ingested}</td><td>${r.skipped}</td>
    <td class="${r.errors ? 'text-danger fw-bold' : 'text-success'}">${r.errors}</td>
    <td>${fmtDur(r.duration_ms)}</td><td>${fmtDur(r.browser_ms)}</td>
    ${r.error_detail ? `<td class="font-monospace text-danger" title="${esc(r.error_detail)}">${esc(r.error_detail.slice(0, 30))}</td>` : '<td>—</td>'}</tr>`).join('');

  let budgetHtml = '';
  if (budget) {
    budgetHtml = `<div class="alert ${budget.exceeded ? 'alert-danger' : 'alert-success'} d-flex align-items-center" style="gap:12px">
      <span>Budget Browser Run (miesiąc): <strong>${fmtPct(budget.monthMs, budget.limitMs)}</strong> (${fmtDur(budget.monthMs)} / ${fmtDur(budget.limitMs)})</span>
      ${budget.exceeded ? '<strong>PRZEKROCZONY</strong>' : ''}</div>`;
  }
  const cronHtml = `<div class="alert alert-light d-flex align-items-center" style="gap:12px;flex-wrap:wrap">
    <span><strong>Cron:</strong> ${esc(cron.schedules.join(', '))} — ${esc(cron.summary)}</span>
    ${cron.nextRunMs ? `<span class="text-secondary">Następny: <strong>${fmtDate(cron.nextRunMs)}</strong></span>` : ''}
    ${cron.lastCronRunMs ? `<span class="text-secondary">Ostatni: ${fmtDate(cron.lastCronRunMs)}</span>` : '<span class="text-warning">Cron nie wystartował</span>'}</div>`;

  const body = `<h2 class="mb-3">Seed</h2>${cronHtml}${budgetHtml}
  <form method="post" action="/admin/seed/run" class="mb-3"><button class="btn btn-primary">▶ Seed jutro (ręcznie)</button></form>
  <div class="card"><div class="table-responsive"><table class="table table-vcenter card-table">
    <thead><tr><th>Czas</th><th>Dzień</th><th>Typ</th><th>Provider</th><th>Transport</th><th>Cand</th><th>Ingest</th><th>Skip</th><th>Err</th><th>Czas</th><th>Browser</th><th>Błąd</th></tr></thead>
    <tbody>${rows || `<tr><td colspan="12">${empty()}</td></tr>`}</tbody></table></div></div>`;
  return renderPage(c, 'Seed', '/admin/seed', body);
});

dashboardRoutes.post('/seed/run', async (c) => {
  const session = await requireSession(c);
  if (!session) return c.redirect('/admin/login');
  // Fire-and-forget: return immediately; seed runs in the background (up to the
  // 15 min cron wall time). The seed page polls/refreshes to show the new run.
  const ctx = c.executionCtx;
  ctx.waitUntil(
    seedTomorrow(c.env)
      .then((r) => console.log(`admin seed run: day=${r.day} ingested=${r.total.ingested} errors=${r.total.errors} browserMs=${r.total.browserMs}`))
      .catch((e) => console.error(`admin seed run failed: ${(e as Error).message}`))
  );
  return c.redirect('/admin/seed');
});

// Stats
dashboardRoutes.get('/stats', async (c) => {
  const db = c.env.DB;
  const days = 14;
  const since = Date.now() - days * 86400000;
  const views = await daySeries(db, 'views', 'created_at', since);
  const media = await daySeries(db, 'posts', 'created_at', since);
  const logins = await daySeries(db, 'auth_events', 'created_at', since, " AND event='login'");
  const signups = await daySeries(db, 'auth_events', 'created_at', since, " AND event='register'");
  const likes = await daySeries(db, 'likes', 'created_at', since);
  const shares = await daySeries(db, 'shares', 'created_at', since);
  const toBars = (s: { d: string; n: number }[]) => bars(s.map((x) => ({ label: x.d.slice(5), value: x.n })));
  const block = (t: string, s: { d: string; n: number }[]) =>
    `<div class="card mb-3"><div class="card-header"><h3 class="card-title">${t}</h3></div><div class="card-body">${s.length ? toBars(s) : empty()}</div></div>`;
  const body = `<h2 class="mb-3">Statystyki · ${days} dni</h2>${block('Views', views)}${block('Media dodane', media)}${block('Logowania', logins)}${block('Rejestracje', signups)}${block('Like', likes)}${block('Share', shares)}`;
  return renderPage(c, 'Statystyki', '/admin/stats', body);
});

// Errors
dashboardRoutes.get('/errors', async (c) => {
  const db = c.env.DB;
  const since = Date.now() - 7 * 86400000;
  const { results } = await db.prepare('SELECT * FROM client_errors WHERE created_at>=? ORDER BY created_at DESC LIMIT 200').bind(since).all();
  const rows = (results as any[]).map((e) => `<tr>
    <td>${fmtDate(e.created_at)}</td><td class="font-monospace">${esc(e.device_id || '—')}</td>
    <td>${pill(esc(e.error_type), 'err')}</td><td>${esc((e.message || '').slice(0, 80))}</td>
    ${e.meta ? `<td class="font-monospace" style="max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(e.meta)}">${esc(e.meta.slice(0, 50))}</td>` : '<td>—</td>'}</tr>`).join('');
  const body = `<h2 class="mb-3">Błędy klienta</h2>
  <div class="card"><div class="table-responsive"><table class="table table-vcenter card-table">
    <thead><tr><th>Czas</th><th>Device</th><th>Typ</th><th>Message</th><th>Meta</th></tr></thead>
    <tbody>${rows || `<tr><td colspan="5">${empty()}</td></tr>`}</tbody></table></div></div>`;
  return renderPage(c, 'Błędy', '/admin/errors', body);
});

// Media requests
dashboardRoutes.get('/media-requests', async (c) => {
  const db = c.env.DB;
  const since = Date.now() - 14 * 86400000;
  const { results } = await db.prepare(`SELECT r.id, r.lat, r.lng, r.created_at, COALESCE(NULLIF(u.username,''), u.device_id) AS user
    FROM media_requests r JOIN users u ON r.user_id=u.id WHERE r.created_at>=? ORDER BY r.created_at DESC LIMIT 200`).bind(since).all();
  const rows = (results as any[]).map((r) => `<tr>
    <td>${fmtDate(r.created_at)}</td><td>${esc(r.user)}</td>
    <td class="font-monospace">${Number(r.lat).toFixed(4)}, ${Number(r.lng).toFixed(4)}</td>
    <td>${esc(nearestCity(r.lat, r.lng))}</td></tr>`).join('');
  const body = `<h2 class="mb-3">Media Requests</h2>
  <div class="card"><div class="table-responsive"><table class="table table-vcenter card-table">
    <thead><tr><th>Czas</th><th>Użytkownik</th><th>Pozycja</th><th>Miasto</th></tr></thead>
    <tbody>${rows || `<tr><td colspan="4">${empty()}</td></tr>`}</tbody></table></div></div>`;
  return renderPage(c, 'Media Requests', '/admin/media-requests', body);
});
