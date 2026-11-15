import { CONFIG } from '../config/index';

const VALID_TEAM_ID = /^[a-zA-Z0-9_-]+$/;

export interface CrestUploadItem {
  id: string;
  dataBase64: string;
  contentType: string;
}

export function validTeamId(raw: string | undefined): string | null {
  if (!raw || !VALID_TEAM_ID.test(raw)) return null;
  return raw;
}

export function crestKeyForTeamId(teamId: string | undefined): string | null {
  const valid = validTeamId(teamId);
  return valid ? `${CONFIG.travel.espn.crests.prefix}${valid}.png` : null;
}

export function crestThumbnailUrl(logoUrl: string): string {
  try {
    const parsed = new URL(logoUrl);
    if (parsed.hostname !== CONFIG.travel.espn.cdnHost || !parsed.pathname.startsWith('/i/')) return logoUrl;
    const size = CONFIG.travel.espn.crests.pixelSize;
    return `https://${CONFIG.travel.espn.cdnHost}/combiner/i?img=${encodeURIComponent(parsed.pathname)}&w=${size}&h=${size}`;
  } catch {
    return logoUrl;
  }
}

async function fetchImageBytes(url: string): Promise<{ bytes: Uint8Array; contentType: string } | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(CONFIG.travel.espn.crests.timeoutMs),
    });
    if (!res.ok) return null;
    const contentType = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
    if (!contentType.startsWith('image/')) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.length === 0 || bytes.length > CONFIG.travel.espn.crests.maxBytes) return null;
    return { bytes, contentType };
  } catch {
    return null;
  }
}

async function downloadCrest(id: string, logoUrl: string): Promise<CrestUploadItem | null> {
  const thumbUrl = crestThumbnailUrl(logoUrl);
  const primary = await fetchImageBytes(thumbUrl);
  const fetched = primary ?? (thumbUrl !== logoUrl ? await fetchImageBytes(logoUrl) : null);
  if (!fetched) return null;
  return {
    id,
    dataBase64: Buffer.from(fetched.bytes).toString('base64'),
    contentType: fetched.contentType,
  };
}

async function fetchMissingIds(baseUrl: string, adminSecret: string, ids: string[]): Promise<string[]> {
  const res = await fetch(`${baseUrl}/admin/travel/crests/missing`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminSecret}` },
    body: JSON.stringify({ ids }),
    signal: AbortSignal.timeout(CONFIG.travel.espn.crests.timeoutMs),
  });
  if (!res.ok) throw new Error(`crests/missing ${res.status}`);
  const body = (await res.json()) as { missing?: unknown };
  return Array.isArray(body.missing) ? body.missing.filter((id): id is string => typeof id === 'string') : [];
}

async function uploadCrestBatch(baseUrl: string, adminSecret: string, items: CrestUploadItem[]): Promise<number> {
  const res = await fetch(`${baseUrl}/admin/travel/crests`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminSecret}` },
    body: JSON.stringify({ items }),
    signal: AbortSignal.timeout(CONFIG.travel.espn.timeoutMs),
  });
  if (!res.ok) throw new Error(`crests upload ${res.status}`);
  const body = (await res.json()) as { saved?: number };
  return typeof body.saved === 'number' ? body.saved : items.length;
}

async function downloadSingleMissing(
  id: string,
  logoById: Map<string, string>,
  items: CrestUploadItem[],
): Promise<boolean> {
  const logoUrl = logoById.get(id);
  if (!logoUrl) return true;
  const item = await downloadCrest(id, logoUrl);
  if (!item) return false;
  items.push(item);
  return true;
}

async function downloadMissingCrests(
  missing: string[],
  logoById: Map<string, string>,
): Promise<{ items: CrestUploadItem[]; failed: number }> {
  const items: CrestUploadItem[] = [];
  let failed = 0;
  let cursor = 0;

  async function runWorker(): Promise<void> {
    while (cursor < missing.length) {
      const ok = await downloadSingleMissing(missing[cursor++], logoById, items);
      failed += ok ? 0 : 1;
    }
  }

  const count = Math.min(CONFIG.travel.espn.crests.downloadConcurrency, missing.length);
  await Promise.all(Array.from({ length: count }, () => runWorker()));
  return { items, failed };
}

async function uploadAllBatches(baseUrl: string, adminSecret: string, items: CrestUploadItem[]): Promise<number> {
  const batchSize = CONFIG.travel.espn.crests.uploadBatchSize;
  let uploaded = 0;
  for (let i = 0; i < items.length; i += batchSize) {
    uploaded += await uploadCrestBatch(baseUrl, adminSecret, items.slice(i, i + batchSize));
  }
  return uploaded;
}

export async function syncEspnCrests(
  baseUrl: string,
  adminSecret: string,
  logoById: Map<string, string>,
): Promise<{ missing: number; uploaded: number; failed: number }> {
  const ids = [...logoById.keys()];
  if (ids.length === 0) return { missing: 0, uploaded: 0, failed: 0 };

  const missing = await fetchMissingIds(baseUrl, adminSecret, ids);
  if (missing.length === 0) return { missing: 0, uploaded: 0, failed: 0 };

  const { items, failed } = await downloadMissingCrests(missing, logoById);
  const uploaded = await uploadAllBatches(baseUrl, adminSecret, items);
  return { missing: missing.length, uploaded, failed };
}
