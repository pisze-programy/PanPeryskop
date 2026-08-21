// Live posts query builders + status aggregates (category='live').
export interface PostsFilter {
  status?: string | null;
  type?: string | null;
  q?: string | null;
  reported?: boolean;
  limit: number;
  offset?: number;
}

function postsWhere(f: PostsFilter): { where: string; binds: unknown[] } {
  let where = `p.category='live'`;
  const binds: unknown[] = [];
  if (f.status) { where += ' AND p.status=?'; binds.push(f.status); }
  if (f.type) { where += ' AND p.type=?'; binds.push(f.type); }
  if (f.q) {
    where += ' AND (p.description LIKE ? OR u.username LIKE ? OR u.device_id LIKE ? OR p.id LIKE ?)';
    binds.push(`%${f.q}%`, `%${f.q}%`, `%${f.q}%`, `%${f.q}%`);
  }
  if (f.reported) {
    where += " AND EXISTS (SELECT 1 FROM reports rp WHERE rp.post_id=p.id AND rp.status='open')";
  }
  return { where, binds };
}

export function postsSql(f: PostsFilter): { sql: string; binds: unknown[] } {
  const { where, binds } = postsWhere(f);
  const offset = f.offset ?? 0;
  return {
    sql: `SELECT p.id, p.type, p.description, p.status, p.created_at, p.rejection_reason,
          p.likes_count, p.views_count, p.shares_count, p.dislikes_count, p.media_key, p.thumb_key,
          u.id AS user_id, COALESCE(NULLIF(u.username,''), u.device_id) AS author,
          u.device_id, u.avatar_key,
          EXISTS(SELECT 1 FROM banned_devices b WHERE b.device_id=u.device_id) AS banned,
          (SELECT COUNT(*) FROM reports rp WHERE rp.post_id=p.id AND rp.status='open') AS open_reports
          FROM posts p JOIN users u ON u.id=p.user_id WHERE ${where}
          ORDER BY p.created_at DESC LIMIT ? OFFSET ?`,
    binds: [...binds, f.limit, offset],
  };
}

export function postsCountSql(f: PostsFilter): { sql: string; binds: unknown[] } {
  const { where, binds } = postsWhere(f);
  return { sql: `SELECT COUNT(*) n FROM posts p JOIN users u ON u.id=p.user_id WHERE ${where}`, binds };
}

export interface PostStatusCounts {
  total: number;
  active24h: number;
  approved: number;
  pending: number;
  rejected: number;
}

export async function postStatusCounts(db: D1Database): Promise<PostStatusCounts> {
  const [total, active24h, byStatus] = await Promise.all([
    db.prepare("SELECT COUNT(*) n FROM posts WHERE category='live'").first<{ n: number }>(),
    db.prepare("SELECT COUNT(*) n FROM posts WHERE category='live' AND created_at>=?").bind(Date.now() - 86_400_000).first<{ n: number }>(),
    db.prepare("SELECT status, COUNT(*) n FROM posts WHERE category='live' GROUP BY status").all<{ status: string; n: number }>(),
  ]);
  const r: Record<string, number> = { total: total?.n ?? 0, active24h: active24h?.n ?? 0, approved: 0, pending: 0, rejected: 0 };
  for (const x of byStatus.results ?? []) if (x.status in r) r[x.status] = x.n;
  return r as unknown as PostStatusCounts;
}
