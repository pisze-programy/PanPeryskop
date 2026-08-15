// Cloudflare Browser Run helper (browser transport). Uses the native BROWSER
// binding — no API token, no proxy tricks. Reports consumed browser time via
// the X-Browser-Ms-Used response header so the runner can track the 10h/month
// Browser Run budget.

export interface BrowserContentResult {
  html: string;
  browserMs: number;
}

export async function browserContent(env: Env, url: string): Promise<BrowserContentResult> {
  const res = await env.BROWSER.quickAction('content', {
    url,
    gotoOptions: { waitUntil: 'networkidle2' },
  });
  const browserMs = parseInt(res.headers.get('X-Browser-Ms-Used') || '0', 10);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`browser content ${url} -> ${res.status} ${body.slice(0, 200)}`);
  }
  const data = (await res.json()) as { success?: boolean; result?: string; errors?: unknown };
  if (!data.success || typeof data.result !== 'string') {
    throw new Error(`browser content ${url} -> ${JSON.stringify(data.errors || data).slice(0, 200)}`);
  }
  return { html: data.result, browserMs };
}
