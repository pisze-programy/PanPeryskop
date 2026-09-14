import { CONFIG } from '../../../config/index';
// D1 persistence helpers for the seed pipeline: the shared seed user + a clock.
import { nanoid } from 'nanoid';

export function now(): number { return Date.now(); }

export async function getOrCreateSeedUser(db: D1Database): Promise<{ id: string }> {
  const existing = await db.prepare('SELECT id FROM users WHERE device_id = ?').bind(CONFIG.seed.deviceId).first<{ id: string }>();
  if (existing) return existing;
  const id = nanoid(16);
  await db.prepare('INSERT INTO users (id, device_id, session_token, role, username, auth_provider, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(id, CONFIG.seed.deviceId, nanoid(48), 'user', 'PanPeryskop Seed', 'device', now()).run();
  return { id };
}
