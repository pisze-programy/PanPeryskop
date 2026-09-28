import { PUBLIC_BASE } from './webpage';

const INDEXNOW_KEY = '9b1ae0e6fedfb23b7c1217f5835ea604';
const INDEXNOW_ENDPOINT = 'https://api.indexnow.org/indexnow';

export async function submitIndexNow(urls: string[]): Promise<number> {
  if (urls.length === 0) return 0;
  try {
    const response = await fetch(INDEXNOW_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      signal: AbortSignal.timeout(10_000),
      body: JSON.stringify({
        host: 'panperyskop.app',
        key: INDEXNOW_KEY,
        keyLocation: `${PUBLIC_BASE}/${INDEXNOW_KEY}.txt`,
        urlList: urls,
      }),
    });
    return response.ok ? urls.length : 0;
  } catch {
    return 0;
  }
}
