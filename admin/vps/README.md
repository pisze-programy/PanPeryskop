# VPS — residential egress seed host (PanPeryskop)

Multikino/CinemaCity/Luma/Meetup (anything Cloudflare-challenged) 403s from **any datacenter
egress** (Workers, VPS) but passes from a clean residential/cellular IP. This box is the
**execution host** for the app's **VPS executor** — it only provides:

1. **residential egress** — iPhone (primary) or Mac (fallback) as a Tailscale exit node + an
   IPv4-forcing proxy,
2. **a callback** — uploads the fetched events back to the app API via `seed-ingest`.

It knows **nothing about provider logic** — that all lives in `backend/src/seed` and is shared
with every execution method.

---

## Rebuild after a VPS wipe — ONE command

From the Mac (repo root), the whole box is recreated idempotently — no git, no manual steps:

```sh
sh admin/vps/deploy.sh
```

`deploy.sh` (Mac): builds the app payload tarball (`backend/src/seed` + `backend/src/admin/cities.ts`
+ `admin/vps` + `admin/src/seed-ingest.mjs` — NO git), scp's it with `setup-vps.sh` to the VPS
(ssh alias `frog`), and runs the bootstrap there as root (`sudo -n`). `setup-vps.sh` (VPS) then:

1. installs node/npm/tailscale/imagemagick/ffmpeg + global `tsx`,
2. enables `NOPASSWD` sudo for the deploy user — key-only SSH works without prompts,
3. joins the tailnet with the iPhone as exit node,
4. extracts the payload into `/opt/panperyskop` and removes legacy files,
5. installs the root crontab — seed kick **every 5 min all day** (05–22 PL window is enforced
   in the orchestrator; off-window kicks are no-ops),
6. runs a self-test (`orchestrator --dry`).

Requirements on a fresh box: the `frog` SSH alias + key in `~/.ssh/config` (see below) and an
initial root/console login to run the first `sudo -n` — after that everything is key-only.

After `deploy.sh`, **first seed** (whole window, one-time):
```sh
ssh frog 'sudo -n node /opt/panperyskop/backend/dist/vps-seed.mjs --full'
```
(`--full` backfills [today, today+3]; the daily cron afterwards only fetches the new far edge.)

---

## Architecture — execution methods ("sposoby wykonywania")

Providers are **pure logic** (`backend/src/seed/providers/*.ts`). WHERE they run is decided by the
**executor** (`backend/src/seed/executors/*`) + the **provider registry**
(`backend/src/seed/providers/registry.ts`):

```
backend/src/seed/
├── providers/         # pure provider logic + registry (enabled, priority, executors)
├── executors/
│   ├── types.ts       # ExecutorId ('worker' | 'vps') + Executor contract
│   ├── worker.ts      # CF Workers executor → the queue pipeline
│   └── vps/           # VPS executor
│       ├── index.ts   # orchestrator: egress, plan, run, verify, upload
│       ├── runtime.ts # shared staging/checkpoint/media/dedupe (no provider logic)
│       └── runners/   # ONE dedicated runner file per provider (wires provider → model)
│           ├── luma.ts · meetup.ts          (scopes = 21 cities)
│           ├── multikino.ts                 (scopes = 18 cinemas, 1 req each = whole programme)
│           └── cinemacity.ts                (scopes = 36 cinemas, per-day API → loop window days)
```

A provider is assigned to an executor in the registry — switching execution is **config, not code**:

```ts
{ id: LUMA, enabled: true, priority: 1,
  executors: { vps: { output: 'events-luma.json', checkpoint: 'events-luma-checkpoint.json' } } },
{ id: GOING, enabled: true, priority: 2, executors: { worker: true } },
```

Moving Luma to CF (even though Cloudflare blocks the Worker egress) = `executors: { worker: true }`.
Adding a new executor (e.g. `lambda`) = a new `executors/<name>/` + a key in `executors` — providers
never change.

---

## Daily flow (cron every 5 min, window 05–22 PL, single-instance lock + resource gate)

The cron fires `orchestrator.sh` → the VPS executor. It mirrors the **Worker cron**: daily each
provider fetches ONLY the new **far edge (today+3)** — the browse window [today, today+3] is
covered by rolling. `--full` backfills the whole window once.

| Provider | Scopes | HTTP per day (far edge) | Output |
|---|---|---|---|
| multikino | 18 cinemas | 1/cinema (whole programme in one call) | `admin/seed/multikino.json` |
| cinemacity | 36 cinemas | 1/cinema (quickbook is per-day, no bulk) | `admin/seed/cinemacity.json` |
| luma | 21 cities | 1/city | `admin/seed/events-luma.json` |
| meetup | 21 cities | 1/city | `admin/seed/events-meetup.json` |

Exit-node logic (ONE rule): **iPhone → unavailable → Mac → unavailable → retry at the next 5-min kick**
(all day within the window). Per provider: compute the far edge → skip if the checkpoint already
has `{target, completed}` → select+validate exit node (probed through the IPv4 proxy) → spawn the
runner → verify completion → upload via `seed-ingest --approve`.

All checkpoints share one contract: `{ target: "<far-edge day>", completed, completedAt, scopes }`.

**Small footprint / good citizenship (256 MB shared VPS):** the seed is a single pre-built
bundle (`backend/dist/vps-seed.mjs`) run as ONE `node` process — no tsx/esbuild at runtime.
A **single-instance lock** stops a new 5-min kick from overlapping a running pass, and a
**resource gate** (MemAvailable / load from /proc) pauses the run (checkpoint saved) when the
box is busy with other processes — the next kick resumes. Build locally: `node admin/vps/build.mjs`.

---

## Verification / ops

```sh
# plan (no side effects)
ssh frog 'sudo -n node /opt/panperyskop/backend/dist/vps-seed.mjs --dry'

# status + logs
cat /opt/panperyskop/admin/vps/logs/status.json
tail -f /opt/panperyskop/admin/vps/logs/orchestrator.log

# egress check (multikino auth through the exit node)
ssh frog 'sh /opt/panperyskop/admin/vps/check-exit.sh'
```

DB check after a seed:
```sh
npx wrangler d1 execute panperyskop-db --remote \
  --command="SELECT substr(external_id,1,instr(external_id,'-')-1) src, status, COUNT(*) n FROM posts WHERE external_id IS NOT NULL GROUP BY src, status ORDER BY src"
```

---

## SSH / setup notes

- Mac `~/.ssh/config`: `Host <vps>` → `HostName <vps-host>`, `Port 11322`, `User frog`,
  `IdentityFile ~/.ssh/<vps-key>`, `IdentitiesOnly yes`.
- The VPS is Alpine (apk) / busybox. Node 24 — `Intl.DateTimeFormat('en-CA')` does NOT render
  ISO dates there (returns `08/18/2026`), so all Warsaw-date helpers use `formatToParts`.
- Image processing is cross-platform: macOS `sips`, Linux `convert` (imagemagick).
- If the phone and Mac are both offline, the orchestrator logs `exit-none` and the next 30-min
  kick retries — no manual intervention.
