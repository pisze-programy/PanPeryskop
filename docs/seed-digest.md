# Seed digest — daily email summary

This document explains how PanPeryskop reports its daily seed to you by email.
We use cf-snitch (a headless email service on Cloudflare).

## What you get

Every day you receive an email for each seed provider. The email tells you:

- which provider ran,
- its progress today (job 1/7, 2/7, ... 7/7),
- how many candidates it found,
- how many events it ingested,
- how many errors it had.

When all providers finish, you receive one summary email (day-done).
It shows the result of every provider in one table.

If a provider cannot run, you receive an email with the provider name and the reason.

If some providers still have not reported by 14:00 Warsaw, you receive an email
that lists the missing providers (day-incomplete).

## The providers

Seven providers are automated:

- kupbilecik (Cloudflare Worker)
- going, helios, multikino, cinemacity, luma, meetup (VPS)

Facebook is manual. It is not part of the daily jobs.

## How it works

The Cloudflare Worker is the coordinator. It keeps a shared counter in D1.

- The Worker reports kupbilecik when its daily batch finishes.
- The VPS reports each provider after its run + upload.
  It calls `POST /admin/seed/digest` on the Worker.
- The Worker stores each report in the `seed_digest` table.
- The Worker sends the emails to cf-snitch.

Email is fire-and-forget. A failure in cf-snitch never breaks the seed.

## Edge cases

- A retry or a DLQ re-drive does not send a second email
  when the status did not change.
- If a failed provider retries and succeeds, you get a second email (failed, then ok).
- The day-done email is sent once per day.
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
