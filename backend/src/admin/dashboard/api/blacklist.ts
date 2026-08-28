// JSON API: event blacklist (cookie-auth dashboard). CRUD + match-count preview.
// The match count runs the same matcher as seed ingest (seed/core/blacklist)
// against the CURRENT event posts, so the admin sees exactly what a rule blocks.

import { Hono } from 'hono';
import { nanoid } from 'nanoid';
import { api } from '../common';
import {
  blacklistMatch, ruleFromRow, type BlacklistRule,
} from '../../../seed/core/blacklist';

const apiRoutes = new Hono<{ Bindings: Env }>();

interface PostCand {
  id: string;
  title: string;
  venue: string;
  partnerId: string | null;
}

// "Tytuł: HH:MM, Lokalizacja" → { title, venue } — the seed description format.
function candFromPost(r: { description: string | null; partner_id?: string | null }): PostCand {
  const desc = r.description || '';
  const m = /^(.+?):\s*\d{2}:\d{2},\s*(.*)$/.exec(desc);
  return {
    id: '',
    title: m ? m[1].trim() : desc.trim(),
    venue: m ? (m[2].split(',')[0] || '').trim() : '',
    partnerId: r.partner_id || null,
  };
}

// Match one rule against every current event post (approved + pending — what the
// app/admin actually sees) and count the hits.
async function countMatches(db: D1Database, rule: { pattern: string; venue: string; partnerId: string }): Promise<number> {
  const { results } = await db.prepare(
    "SELECT description, partner_id FROM posts WHERE category='events' AND status IN ('approved','pending')"
  ).all<{ description: string | null; partner_id: string | null }>();
  let n = 0;
  for (const r of results ?? []) {
    const c = candFromPost(r);
    if (blacklistMatch(rule, c)) n++;
  }
  return n;
}

async function loadRules(db: D1Database): Promise<BlacklistRule[]> {
  const { results } = await db
    .prepare('SELECT id, pattern, venue, partner_id, partner_name, active FROM event_blacklist')
    .all<{ id: string; pattern: string | null; venue: string | null; partner_id: string | null; partner_name: string | null; active: number | null }>();
  return (results ?? []).map((r) => ({ id: r.id, active: r.active !== 0, ...ruleFromRow(r) }));
}

function parseBody(body: { pattern?: unknown; venue?: unknown; partner_id?: unknown; partner_name?: unknown; note?: unknown }) {
  const pattern = typeof body.pattern === 'string' ? body.pattern.trim() : '';
  const venue = typeof body.venue === 'string' ? body.venue.trim() : '';
  const partnerId = typeof body.partner_id === 'string' ? body.partner_id.trim() : '';
  const partnerName = typeof body.partner_name === 'string' ? body.partner_name.trim() : '';
  const note = typeof body.note === 'string' ? body.note.trim() : '';
  if (!pattern && !partnerId) throw new Error('Wymagany wzorzec tytułu lub organizator');
  if (pattern.length > 200 || partnerId.length > 50 || partnerName.length > 200) throw new Error('Za długi wzorzec');
  return { pattern, venue, partnerId, partnerName, note };
}

apiRoutes.get('/blacklist', (c) => api(c, async (env) => {
  const rules = await loadRules(env.DB);
  const withCounts = await Promise.all(rules.map(async (r) => ({
    ...r,
    matches: await countMatches(env.DB, { pattern: r.pattern, venue: r.venue, partnerId: r.partnerId }),
  })));
  return { rules: withCounts };
}));

apiRoutes.post('/blacklist/preview', (c) => api(c, async (env) => {
  const body = await c.req.json<Record<string, unknown>>().catch(() => ({}));
  const rule = parseBody(body);
  return { matchCount: await countMatches(env.DB, { pattern: rule.pattern, venue: rule.venue, partnerId: rule.partnerId }) };
}));

apiRoutes.post('/blacklist', (c) => api(c, async (env) => {
  const body = await c.req.json<Record<string, unknown>>().catch(() => ({}));
  const rule = parseBody(body);
  const id = nanoid(16);
  await env.DB.prepare(
    'INSERT INTO event_blacklist (id, pattern, venue, partner_id, partner_name, note, active, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)'
  ).bind(id, rule.pattern, rule.venue || null, rule.partnerId || null, rule.partnerName || null, rule.note || null, Date.now(), 'admin').run();
  return { ok: true, id, matchCount: await countMatches(env.DB, { pattern: rule.pattern, venue: rule.venue, partnerId: rule.partnerId }) };
}));

apiRoutes.delete('/blacklist/:id', (c) => api(c, async (env) => {
  const id = c.req.param('id');
  await env.DB.prepare('DELETE FROM event_blacklist WHERE id = ?').bind(id).run();
  return { ok: true, id };
}));

apiRoutes.post('/blacklist/:id/toggle', (c) => api(c, async (env) => {
  const id = c.req.param('id');
  const body = await c.req.json<{ active?: unknown }>().catch(() => ({})) as { active?: unknown };
  const active = body.active === true ? 1 : 0;
  await env.DB.prepare('UPDATE event_blacklist SET active = ? WHERE id = ?').bind(active, id).run();
  return { ok: true, id, active: body.active === true };
}));

export function registerApiBlacklist(parent: Hono<{ Bindings: Env }>): void {
  parent.route('/', apiRoutes);
}
