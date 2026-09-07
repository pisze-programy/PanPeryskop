# going affiliate links (TradeDoubler, fid 46830)

going posts earn TradeDoubler commission by opening the program's click URL in
the in-app browser (domain already allow-listed) instead of the plain
`goingapp.pl/wydarzenie/<slug>/<rundate-slug>` link.

## Data flow (all on the VPS — TD rejects CF Workers egress)

1. **VPS runner** (`backend/src/seed/executors/vps/runners/going.ts`) downloads the
   gzipped `productsUnlimited` export (fid 46830) once per version:
   - `lastUpdated` endpoint gates the download (cheap, not quota-counted);
   - disk cache `admin/seed/td-going.json` stores `{version, products}` so the
     3-downloads/24h-per-version quota is never burned by repeated kicks;
   - atomic write (`tmp` + rename), 202 → bounded retry, 429/failure → fall back
     to the cached copy, no cache → plain links (the run never fails on TD).
2. **Map** (`backend/src/seed/core/goingTd.ts`, pure + Workers-safe): every
   product's `offers[0].productUrl` is a TD click URL; its `url(...)` param is
   the goingapp landing, reduced to a normalized `(event-slug, rundate-slug)`
   key. Two products for one slug pair ("kopia" rundates) → pair dropped.
3. **Provider** (`backend/src/seed/providers/going.ts`) matches each candidate's
   Algolia `slug`/`rundate_slug` against `env.GOING_TD_MAP`; an exact hit sets
   `candidate.affiliateLink` (the verbatim click URL). `link` stays the plain
   goingapp URL, so intra/cross-provider dedupe is unaffected.
4. **Upload** (`admin/src/seed-ingest.mjs`): `link_url = affiliate_link || link`;
   the plain goingapp URL rides along as `source_url`. `POST /posts` stores both
   (`posts.source_url` = provenance / rebuild after TD token rotation).

## Backfill

Already-live matched posts get their link swapped once by
`POST /admin/seed/affiliate` (external_id-keyed, idempotent via the
`source_url IS NULL` guard), called from seed-ingest for existing entries that
now carry an `affiliate_link`.

## Config

`admin/vps/.env` needs `EBILET_TD_TOKEN` (same value as the Worker secret) —
without it the runner logs a warning and ships plain links. Sync to the VPS
with the existing .env flow.

## Rollback

Stop attaching = clear `GOING_TD_MAP` (remove the token / delete the cache) —
candidates fall back to plain links. `external_id` is untouched, so no
migration or re-seed is needed.

## Verification

- Unit: `backend/test/seed.going.test.ts` — landing extraction, slug
  normalization, ambiguity skip, offers-preference.
- Per-run log: `going affiliate: downloaded v<ver> map=<matched>/<products>
  ambiguous=<n>` and `going affiliate: <matched>/<candidates> candidates matched`.
- Full suite: `npm test` (212 passing), `npx tsc --noEmit`.