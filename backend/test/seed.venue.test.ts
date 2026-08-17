import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dice, venueSimilarity, matchVenueGeo, VENUE_MATCH_THRESHOLD } from '../src/seed/venues/venueMatch';
import { upsertVenue, resolveVenueGeo, venueKey } from '../src/seed/venues/venueStore';

test('venueMatch: trigram matches Kinoteatr variants, avoids false positives', () => {
  assert.ok(venueSimilarity('Kino Teatr Apollo', 'Kinoteatr Apollo') > 0.8);
  assert.ok(venueSimilarity('Kino Muza w Poznaniu', 'Teatr Muzyczny w Poznaniu') < 0.5);
  assert.ok(venueSimilarity('Sala koncertowa w podziemiach Bazyliki św. Józefa', 'Sala koncertowa w podziemiach Bazyliki św. Józefa') > VENUE_MATCH_THRESHOLD);
  void dice;
});

test('venueMatch: matchVenueGeo returns geo or null', () => {
  const cache = [
    { name: 'Kinoteatr Apollo', geo: { lat: 52.405, lng: 16.927 } },
    { name: 'Ogród Dendrologiczny Uniwersytetu Przyrodniczego', geo: { lat: 52.427, lng: 16.896 } },
  ];
  const g = matchVenueGeo('Kino Teatr Apollo', cache);
  assert.ok(g);
  assert.ok(Math.abs(g.lat - 52.405) < 0.001);
  assert.equal(matchVenueGeo('Nieznane Miejsce', cache), null);
});

test('venueMatch: real-world short-name and abbreviation pairs match', () => {
  // Prefixed venue vs bare name (dzis.app "Klub Tama" vs kupbilecik "Tama").
  assert.ok(venueSimilarity('Klub Tama', 'Tama') >= VENUE_MATCH_THRESHOLD);
  assert.ok(venueSimilarity('Klub 2progi', '2progi') >= VENUE_MATCH_THRESHOLD);
  // Abbreviation vs full name (Aula UAM = Uniwersytet Adama Mickiewicza).
  assert.ok(venueSimilarity('Aula UAM', 'Aula Uniwersytetu Adama Mickiewicza') >= VENUE_MATCH_THRESHOLD);
  // Ordinary substrings must NOT match (guard against "Koncert" in a title).
  assert.ok(venueSimilarity('Sala Koncertowa Fryderyk', 'Koncert') < VENUE_MATCH_THRESHOLD);
  assert.ok(venueSimilarity('Kino Muza', 'Teatr Muzyczny') < VENUE_MATCH_THRESHOLD);
});

test('venueMatch: prefers same-city venue, ignores other city', () => {
  const cache = [
    { name: 'Tama', geo: { lat: 52.2297, lng: 21.0122 }, city: 'warszawa' },
    { name: 'Klub Tama', geo: { lat: 52.4064, lng: 16.9252 }, city: 'poznan' },
  ];
  const wa = matchVenueGeo('Klub Tama', cache, 'warszawa');
  assert.ok(wa);
  assert.ok(Math.abs(wa!.lat - 52.2297) < 0.001, 'should pick Warszawa Tama');
  const poz = matchVenueGeo('Klub Tama', cache, 'poznan');
  assert.ok(poz);
  assert.ok(Math.abs(poz!.lat - 52.4064) < 0.001, 'should pick Poznań Klub Tama');
});

test('venueMatch: live production pairs match to the right city geo', () => {
  // Real dzis.app venue cache (geo verified on 2026-08-16). "I like Chopin" exists
  // in Gdańsk AND Warszawa with different coordinates — city disambiguates.
  const gdansk = [
    { name: 'I like Chopin', geo: { lat: 54.3549, lng: 18.6494 }, city: 'gdansk' },
    { name: 'Kościół św. Katarzyny', geo: { lat: 54.3544, lng: 18.6524 }, city: 'gdansk' },
    { name: 'Sala pod Bazyliką Mariacką', geo: { lat: 54.3499, lng: 18.6531 }, city: 'gdansk' },
  ];
  const warszawa = [{ name: 'I like Chopin', geo: { lat: 52.2297, lng: 21.0122 }, city: 'warszawa' }];
  const krakow = [{ name: 'Royal Chopin Hall', geo: { lat: 50.0532, lng: 19.9379 }, city: 'krakow' }];
  const wroclaw = [
    { name: 'Katedra Marii Magdaleny', geo: { lat: 51.1095, lng: 17.0347 }, city: 'wroclaw' },
    { name: 'Vertigo Jazz Club & Restaurant', geo: { lat: 51.1095, lng: 17.0347 }, city: 'wroclaw' },
  ];

  // Same name, different city → correct geo per city (mixed cache, both cities present).
  const mixed = [...gdansk, ...warszawa];
  const g = matchVenueGeo('I like Chopin', mixed, 'gdansk');
  assert.ok(g && Math.abs(g.lat - 54.3549) < 0.001, 'Gdańsk I like Chopin');
  const w = matchVenueGeo('I like Chopin', mixed, 'warszawa');
  assert.ok(w && Math.abs(w.lat - 52.2297) < 0.001, 'Warszawa I like Chopin');

  // Other real pairs.
  assert.ok(Math.abs(matchVenueGeo('Kościół św. Katarzyny', gdansk, 'gdansk')!.lat - 54.3544) < 0.001);
  assert.ok(Math.abs(matchVenueGeo('Sala pod Bazyliką Mariacką', gdansk, 'gdansk')!.lat - 54.3499) < 0.001);
  assert.ok(Math.abs(matchVenueGeo('Royal Chopin Hall', krakow, 'krakow')!.lat - 50.0532) < 0.001);
  assert.ok(Math.abs(matchVenueGeo('Katedra Marii Magdaleny', wroclaw, 'wroclaw')!.lat - 51.1095) < 0.001);
  assert.ok(Math.abs(matchVenueGeo('Vertigo Jazz Club & Restaurant', wroclaw, 'wroclaw')!.lat - 51.1095) < 0.001);

  // Distinct venue in the same city must NOT cross-match.
  assert.equal(matchVenueGeo('Kościół św. Katarzyny', mixed, 'warszawa'), null);
});

// In-memory D1 mock with a `venues` table (minimal, only what venueStore needs).
function mockDb() {
  const db = {
    _venues: [] as { id: string; name: string; aliases: string; lat: number; lng: number; city: string | null; sources: string; hit_count: number; first_seen: number; last_seen: number; created_at: number }[],
    prepare: (sql: string) => {
      const norm = (v: unknown) => (v === undefined ? null : v);
      return {
        bind: (...p: unknown[]) => {
          const params = p.map(norm);
          return {
            run: async () => {
              if (sql.startsWith('INSERT INTO venues')) {
                // SQL: (id, name, '[]' literal, lat, lng, city, sources, 1, first_seen, last_seen, created_at)
                db._venues.push({
                  id: params[0] as string, name: params[1] as string, aliases: '[]',
                  lat: params[2] as number, lng: params[3] as number, city: params[4] as string | null,
                  sources: params[5] as string, hit_count: 1, first_seen: params[6] as number,
                  last_seen: params[7] as number, created_at: params[8] as number,
                });
              } else if (sql.startsWith('UPDATE venues')) {
                // bind: (lat, lng, aliases, sources, city, last_seen, id)
                const id = params[6];
                const v = db._venues.find((r) => r.id === id);
                if (v) { v.lat = params[0] as number; v.lng = params[1] as number; v.aliases = params[2] as string; v.sources = params[3] as string; v.city = params[4] as string | null; v.hit_count += 1; v.last_seen = params[5] as number; }
              } else if (sql.includes('hit_count=hit_count+1')) {
                const id = params[1];
                const v = db._venues.find((r) => r.id === id);
                if (v) { v.hit_count += 1; v.last_seen = params[0] as number; }
              }
              return {};
            },
            first: async () => null,
            all: async () => ({
              results: sql.includes('WHERE city = ?')
                ? db._venues.filter((r) => (r.city || '').toLowerCase() === String(params[0] ?? '').toLowerCase() || !r.city)
                : [...db._venues],
            }),
          };
        },
        all: async () => {
          const all = [...db._venues];
          return { results: all };
        },
      };
    },
  } as unknown as D1Database & { _venues: typeof db._venues };
  return db;
}

test('venueStore: upsert creates, fuzzy-matches alias, resolves', async () => {
  const db = mockDb();
  await upsertVenue(db, { name: 'Sala Koncertowa Fryderyk', lat: 52.25, lng: 21.01, city: 'warszawa', provider: 'dzisapp' });
  // Same venue with a slightly different spelling → fuzzy match (alias), not a new row.
  const id2 = await upsertVenue(db, { name: 'Sala koncertowa Fryderyk', lat: 52.25, lng: 21.01, provider: 'kupbilecik', ref: '3326' });
  assert.equal(id2, venueKey('Sala Koncertowa Fryderyk'));
  // resolve by the alias spelling works.
  const geo = await resolveVenueGeo(db, 'Sala koncertowa Fryderyk');
  assert.ok(geo);
  assert.ok(Math.abs(geo!.lat - 52.25) < 0.001);
  // unrelated venue → null.
  assert.equal(await resolveVenueGeo(db, 'Teatr Wielki w Poznaniu'), null);
});

test('venueStore: same venue name in different cities resolves to the right geo', async () => {
  const db = mockDb();
  // Two distinct venues that look alike — Warszawa "Tama" vs Poznań "Klub Tama".
  await upsertVenue(db, { name: 'Tama', lat: 52.2297, lng: 21.0122, city: 'warszawa', provider: 'dzisapp' });
  await upsertVenue(db, { name: 'Klub Tama', lat: 52.4064, lng: 16.9252, city: 'poznan', provider: 'dzisapp' });
  // Same name+city → warszawa.
  const wa = await resolveVenueGeo(db, 'Tama', 'warszawa');
  assert.ok(wa);
  assert.ok(Math.abs(wa!.lat - 52.2297) < 0.001, `warszawa lat=${wa?.lat}`);
  // Different name but same semantic + city → poznan.
  const poz = await resolveVenueGeo(db, 'Tama', 'poznan');
  assert.ok(poz);
  assert.ok(Math.abs(poz!.lat - 52.4064) < 0.001, `poznan lat=${poz?.lat}`);
  // Unknown city falls back to the full pool (mock order → warszawa first).
  const noCity = await resolveVenueGeo(db, 'Tama', 'nieznane');
  assert.ok(noCity);
});

test('venueStore: venueKey normalizes diacritics and spaces', () => {
  assert.equal(venueKey('Sala Koncertowa Fryderyk'), 'salakoncertowafryderyk');
  assert.equal(venueKey('Łódź Klub HAH'), 'lodzklubhah');
});
