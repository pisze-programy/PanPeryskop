# Seed digest — email summary

This document explains how PanPeryskop reports the seed to you by email.
We use cf-snitch (a headless email service on Cloudflare).

The seed runs a **full-window refill every 3 days** (see `seed-digest` → cadence).
This document uses "refill day" for the day the seed runs.

## What you get

On a refill day you receive an email for each provider **only when it had errors**
(status `partial` or `failed`). A clean provider run (`ok`) is silent. A
per-provider email tells you:

- which provider ran,
- its progress (job 1/9, 2/9, ... 9/9),
- how many candidates it found,
- how many events it ingested,
- how many errors it had.

When all providers finish the current far edge, you receive one summary email
(day-done). It shows the result of every provider in one table. It fires only
for the far edge (`today + SEED_DAYS_AHEAD`), not for every window day.

If a provider cannot run, you receive an email with the provider name and the
reason.

If some providers still have not reported by **23:00 Warsaw** of the refill day,
you receive an email that lists the missing providers (day-incomplete).

## The providers

Nine providers are automated:

- kupbilecik, ebilet, eventim (Cloudflare Worker)
- going, helios, multikino, cinemacity, luma, meetup (VPS)

Facebook and MTP are manual. They are not part of the refill jobs.

## How it works

The Cloudflare Worker is the coordinator. It keeps a shared counter in D1.

- The Worker reports its providers when the batch for a window day finishes.
- The VPS reports each provider for every day of the refill horizon after its
  run + upload. It calls `POST /admin/seed/digest` on the Worker.
- The Worker stores each report in the `seed_digest` table.
- The Worker sends the emails to cf-snitch.

Email is fire-and-forget. A failure in cf-snitch never breaks the seed.

## Edge cases

- A retry or a DLQ re-drive does not send a second email when the status did not
  change.
- A provider with status `ok` does not email (per-provider reports use cf-snitch
  `notify: on-error`).
- If a failed provider retries and succeeds, you get the failure email and the
  recovery is shown in the day-done summary.
- The day-done email is sent once per far edge, for both `ok` and `partial` days.
- The day-incomplete email is sent once per day.
- Disabled providers (maratonypolskie, getyourguide) are ignored.

## How to deploy

Set the Worker secrets:

```bash
wrangler secret put SNITCH_URL
wrangler secret put SNITCH_TOKEN
```

- `SNITCH_URL` is the cf-snitch URL (for example `https://cf-snitch.<sub>.workers.dev`).
- `SNITCH_TOKEN` is the cf-snitch report token. Add it to the cf-snitch
  `ACCEPTED_TOKENS` secret (comma-separated list).

Deploy the Worker:

```bash
npx wrangler deploy
```

Rebuild and redeploy the VPS bundle after the VPS digest hook changes:

```bash
node admin/vps/build.mjs
./admin/vps/deploy.sh
```

## Related documents

- `../cf-snitch/docs/integration.md` — cf-snitch report format.
- `getyourguide.md` — parked provider (disabled).