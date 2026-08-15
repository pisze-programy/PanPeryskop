// Plain fetch helpers for the 'fetch' transport.

export const UA_HEADERS = {
  'User-Agent': 'Mozilla/5.0',
  'Referer': 'https://goingapp.pl/',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'pl-PL,pl;q=0.9,en;q=0.8',
};

export async function getJson(url: string): Promise<any> {
  const res = await fetch(url, { headers: UA_HEADERS });
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
  return res.json();
}
export async function getText(url: string): Promise<string> {
  const res = await fetch(url, { headers: UA_HEADERS });
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
  return res.text();
}
export async function getBytes(url: string): Promise<Uint8Array> {
  const res = await fetch(url, { headers: UA_HEADERS });
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}
