# SEED — Agent instructions: adding future events

> Instructions for an LLM agent (e.g. opencode). Read by the agent when the admin asks to add an event (sponsored) to PanPeryskop.
> This repository is **public** — do NOT write secrets, tokens, or passwords here. Media (posters/videos) are **never committed**.

## Goal

Add a future event to the app through a seed so it appears on the map at the chosen day/time and stays visible for **24h** (TTL).

Flow: **admin provides info → agent confirms data → poster goes into the media folder → entry in `events.json` → run `seed-ingest.mjs` → admin approves in the moderation queue**.

## Locations

| What | Path |
|---|---|
| Instructions | `SEED.md` (next to `README.md`) |
| Event manifest | `admin/seed/events.json` |
| Media drop-in folder | `admin/seed/media/` — **gitignored**, do not commit |
| Seed tool | `admin/src/seed-ingest.mjs` |
| Queue / approve | `admin/src/cli.js` |

## Domain rules (do not break)

- Every event is a **photo** or **video** post (media **required**). There are no text-only posts.
- Seed events have `is_sponsored = 1` and an optional `link_url` (http/https).
- **Visibility = TTL window**: a post is public only when `status='approved'` **and** `now − 24h ≤ created_at ≤ now`.
- `created_at` is the **visibility start time** (not the creation time). For a future event set a future instant:
  - **midnight of the event day** (Europe/Warsaw) — visible all day, disappears at the following midnight, or
  - **a few hours before the start** (e.g. start 21:00 → `created_at` 18:00) — visible 3h before.
  - Confirm the choice with the admin.
- Everything goes through the moderation queue (`pending`). **Only the admin approves** (`approve`). The agent NEVER approves on its own.

## Entry schema in `admin/seed/events.json`

```json
{
  "external_id": "kinopalacowe-wielki-marty-2026-08-05",
  "title": "Plenerowe Pałacowe: Wielki Marty",
  "description": "Dziedziniec Zamkowy (wejście od Al. Niepodległości)\nUwaga! ... ",
  "created_at": "2026-08-05T00:00:00+02:00",
  "lat": 52.4094,
  "lng": 16.9179,
  "link": "https://kinopalacowe.pl/filmy/14755-plenerowe-paacowe-wielki-marty/",
  "media": "media/poster.jpg",
  "status": "pending",
  "post_id": null,
  "error": null
}
```

Fields:
- `external_id` — unique slug (name + date), enables idempotency (upsert). E.g. `organizer-event-name-YYYY-MM-DD`.
- `title` — event name (informational).
- `description` — the post body shown in the app (usually title + details/venue/tickets).
- `created_at` — ISO with `+02:00` offset (e.g. `2026-08-05T00:00:00+02:00`) **or** a bare date `2026-08-05` (the tool computes Warsaw midnight). Must not be in the past (older than 24h) nor further than ~366 days ahead.
- `lat`/`lng` — event coordinates (not the city; the pin lands exactly there). Convert an address given by the admin to coordinates.
- `link` — optional, must be http(s).
- `media` — path relative to `admin/seed/`, usually `media/<file>`.
- `status` — `pending` (to process), `done` (processed), `error`. `post_id`/`error` are filled by the tool. **The tool overwrites these fields in the file.**

## Step-by-step procedure

1. **Read this file and `README.md`.** Locate `admin/seed/events.json` and the `admin/seed/media/` folder (create it with `mkdir -p admin/seed/media` if missing).
2. **Collect the data from the admin.** If anything is missing (title, date+time, venue, description, link, poster) — ask, don't guess.
3. **Confirm the data with the admin.** Show: the poster filename + the info extracted from it/name (title, date, description) and ask "is this the one?" — the admin should match it by name/date/description. Do NOT run the seed without confirmation.
4. **Place the poster** in `admin/seed/media/` (local only; **do not commit** — the folder is in `.gitignore`).
5. **Add the entry** to `admin/seed/events.json` with `status: "pending"` (or omit `status`).
6. **Validate before running:** media exists and is jpg/png/heic or mp4/mov; date not in the past; `lat/lng` valid; `external_id` unique; `link` http(s). Fix the entry on any error.
7. **Run the tool**:
   ```bash
   BASE_URL=https://panperyskop-api.dev-4cb.workers.dev node admin/src/seed-ingest.mjs admin/seed/events.json
   ```
   - Locally (wrangler dev): `BASE_URL=http://localhost:8787`
   - `--force` — reprocess entries even with `status: "done"` (upsert by `external_id`).
   - `--approve` — requires `ADMIN_SECRET`; do NOT use by default (the admin approves).
8. **Pass the approve commands to the admin** (the tool prints them):
   ```bash
   BASE_URL=https://panperyskop-api.dev-4cb.workers.dev node admin/src/cli.js approve <post_id>
   ```
9. **Verify:**
   - the post is in `/admin/queue` as `pending`;
   - it does NOT appear in `/stories` before `created_at` (check the event's bbox);
   - media is served (`/media/posts/<id>/thumb.jpg` → 200);
   - after approve + `created_at ≤ now` it appears in `/stories`; after 24h it disappears.

## What NOT to do

- **Do not commit** media (`admin/seed/media/`) or any secrets/tokens/keys.
- **Do not approve posts** (approval is exclusively the admin's decision).
- **Do not set `created_at` in the past** for a new event (it would already be outside the window).
- **Do not skip data confirmation** — always ask the admin for consent before seeding.
- Do not put `ADMIN_SECRET`/token values in prompts or files — reference them via environment variables.
