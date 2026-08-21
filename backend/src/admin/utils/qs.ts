// Query-string builders for filter/pager links (state lives in the URL).

// Build a query string from the current params + overrides (null/'' removes).
export function buildQs(params: Record<string, string>, overrides: Record<string, string | null>): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (k !== 'page') qs.set(k, v);
  for (const [k, v] of Object.entries(overrides)) {
    if (v === null || v === '') qs.delete(k);
    else qs.set(k, v);
  }
  return qs.toString();
}

// Pager href builder preserving the current params (minus page).
export function pageHref(base: string, params: Record<string, string>, page: number): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (k !== 'page') qs.set(k, v);
  qs.set('page', String(page));
  return `${base}?${qs}`;
}
