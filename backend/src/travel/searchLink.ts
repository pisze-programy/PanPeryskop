/** Google AI Mode (`udm=50`) search URL — the ticket fallback when a provider
 *  ships no link of its own. */
export function googleAiSearchUrl(query: string): string {
  return `https://www.google.com/search?${new URLSearchParams({ udm: '50', q: query })}`;
}

/** The Polish purchase query for a race entry. */
export function raceSearchQuery(title: string, city: string, year: string): string {
  return `${title} ${city} ${year} gdzie zapisać się na bieg`;
}

/** The Polish purchase query for a match ticket. */
export function matchSearchQuery(title: string, city: string, year: string): string {
  return `${title} ${city} ${year} gdzie zakupić bilety na mecz`;
}
