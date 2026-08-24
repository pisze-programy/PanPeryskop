# VPS — residential egress seed host (PanPeryskop)

Multikino/CinemaCity/Luma/Meetup/Going/Helios (anything Cloudflare-challenged) 403s from **any datacenter
egress** (Workers, VPS) but passes from a clean residential/cellular IP. This box is the
**execution host** for the app's **VPS executor** — it only provides:

1. **residential egress** — iPhone (primary) or Mac (fallback) as a Tailscale exit node + an
   IPv4-forcing proxy,
2. **a callback** — uploads the fetched events back to the app API via `seed-ingest`.

It knows **nothing about provider logic** — that all lives in `backend/src/seed` and is shared
with every execution method.

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
│       ├── runtime.ts # shared staging/checkpoint/media/dedupe, resource gate
│       └── runners/   # ONE source per provider (wires provider → scope model)
│           ├── luma.ts · meetup.ts          (scopes = 21 cities)
│           ├── multikino.ts                 (scopes = 18 cinemas, 1 req each = whole programme)
│           └── cinemacity.ts                (scopes = 36 cinemas, per-day API → loop window days)
```

A provider is assigned to an executor in the registry — switching execution is **config, not code**:

```ts
{ id: GOING, enabled: true, priority: 2,
  executors: { vps: { output: 'events-going.json', checkpoint: 'events-going-checkpoint.json' } } },
{ id: HELIOS, enabled: true, priority: 0,
  executors: { vps: { output: 'helios.json', checkpoint: 'helios-checkpoint.json' } } },
{ id: KUPBILECIK, enabled: true, priority: 3, executors: { worker: true } },
```

Moving a provider between executors (even though Cloudflare blocks the Worker egress) = a registry
change. Adding a new executor (e.g. `lambda`) = a new `executors/<name>/` + a key in `executors` —
providers never change.

---

## Daily flow (cron every 5 min, window 05–22 PL)

The cron fires `orchestrator.sh` → the VPS executor (the pre-built bundle). It mirrors the
**Worker cron**: daily each provider fetches ONLY the new **far edge (today+3)** — the browse
window [today, today+3] is covered by rolling. `--full` backfills the whole window once.

| Provider | Scopes | HTTP per day (far edge) | Output |
|---|---|---|---|
| going | 1 (all cities) | 1 (single Algolia query) | `admin/seed/events-going.json` |
| luma | 21 cities | 1/city | `admin/seed/events-luma.json` |
| meetup | 21 cities | 1/city | `admin/seed/events-meetup.json` |
| helios | 45 cinemas | 1/cinema (repertoire covers the whole window) | `admin/seed/helios.json` |
| multikino | 18 cinemas | 1/cinema (whole programme in one call) | `admin/seed/multikino.json` |
| cinemacity | 36 cinemas | 1/cinema (quickbook is per-day, no bulk) | `admin/seed/cinemacity.json` |

Egress logic: **Webshare residential proxy** (rotate) when `WEBSHARE_URL` is set in `.env`
(preferred — no phone/Mac needed; `VPS_NO_EXIT_NODE=1` skips tailscale exit-node selection).
Fallback when `WEBSHARE_URL` is absent: **iPhone → Mac** tailscale exit node. Per provider:
compute the far edge → skip if the checkpoint already has `{target, completed}` → egress →
run in-process → verify completion → upload via `seed-ingest --approve`.

All checkpoints share one contract: `{ target: "<far-edge day>", completed, completedAt, scopes }`.

**Small footprint / good citizenship (256 MB shared VPS):** the seed is a single pre-built
bundle (`backend/dist/vps-seed.mjs`) run as ONE `node` process — no tsx/esbuild at runtime.
A **single-instance lock** stops a new 5-min kick from overlapping a running pass, and a
**resource gate** (MemAvailable < 80 MB or load1 ≥ 2.0 from `/proc`) pauses the run (checkpoint
saved) when the box is busy — the next kick resumes.

---

## Environment variables

### On the VPS — `admin/vps/.env` (gitignored, REQUIRED)

| Var | Required | Purpose |
|---|---|---|
| `BASE_URL` | ✅ | PanPeryskop API URL (default `https://api.panperyskop.app`) |
| `ADMIN_SECRET` | ✅ | Bearer token for `seed-ingest --approve` and `POST /admin/seed` |

Location: `/opt/panperyskop/admin/vps/.env` (one `KEY=VALUE` per line). Copy it to a fresh box
after a wipe — this is the only manual step in the rebuild.

### On the Mac — deploy.sh / setup-vps.sh

| Var | Default | Purpose |
|---|---|---|
| `HOST` | `frog` | SSH alias to the VPS (deploy.sh) |

### Orchestrator (runtime)

| Var | Purpose |
|---|---|
| `FORCE=1` | Bypass the 05–22 PL window guard (manual runs) |

### Not env (code constants)

| Constant | File | Value |
|---|---|---|
| `SEED_DAYS_AHEAD` | `backend/src/seed/core/constants.ts` | `3` (window size / far edge) |
| `VPS_MIN_MEMAVAILABLE_MB`, `VPS_MAX_LOAD1` | `backend/src/seed/core/constants.ts` | `80`, `2.0` (resource gate) |
| `VPS_WINDOW_START_HOUR`, `VPS_WINDOW_END_HOUR` | `backend/src/seed/core/constants.ts` | `5`, `22` (PL) |

---

## Rebuild after a VPS wipe — ONE command

From the Mac (repo root):

```sh
sh admin/vps/deploy.sh
```

`deploy.sh` (Mac): builds the bundle (`node admin/vps/build.mjs` → `backend/dist/vps-seed.mjs`),
scp's it with `orchestrator.sh`, `setup-vps.sh`, `ipv4-proxy.mjs` and `seed-ingest.mjs` to the VPS
(ssh alias `HOST`, default `frog`), and runs the bootstrap there as root (`sudo -n`). No git on
the box, no TS at runtime.

`setup-vps.sh` (VPS, idempotent) then:

1. installs node/npm/tailscale/imagemagick/ffmpeg + global `tsx`,
2. enables `NOPASSWD` sudo for the deploy user — key-only SSH works without prompts,
3. joins the tailnet with the iPhone as exit node,
4. installs the bundle + scripts into `/opt/panperyskop`, removes legacy files,
5. installs the IPv4 proxy as an **openrc service** (auto-start + restart on crash),
6. installs the root crontab — `*/5 * * * * /opt/panperyskop/admin/vps/orchestrator.sh`,
7. runs a self-test (`--dry`).

Requirements on a fresh box: the `HOST` SSH alias + key (see SSH notes below), the `.env`
(see Environment variables), and an initial root/console login for the first `sudo`.

After `deploy.sh`, **first seed** (whole window, one-time). ALWAYS run it via the
**orchestrator** (`orchestrator.sh`), never `node …/vps-seed.mjs` directly — the
orchestrator exports `HTTPS_PROXY` + `NODE_USE_ENV_PROXY` BEFORE node starts, and
Node reads `NODE_USE_ENV_PROXY` **only at process launch** (a runtime assignment is
a no-op). Running the bundle via bare `sudo -n node` egresses from the VPS's
datacenter IP → every Cloudflare-fronted provider (multikino) returns 403.

```sh
ssh frog 'sudo -n sh /opt/panperyskop/admin/vps/orchestrator.sh --full'
```

(`--full` backfills [today, today+3]; the daily cron afterwards only fetches the new far edge.)

**The bundle is not committed** (`backend/dist/` is gitignored) — `deploy.sh` rebuilds it from the
current source, so a fresh deploy always carries the latest fixes.

---

## Verification / ops

```sh
# plan (no side effects) — via the orchestrator so the bundle inherits proxy env
ssh frog 'sudo -n sh /opt/panperyskop/admin/vps/orchestrator.sh --dry'

# single provider (whole window: add --full)
ssh frog 'sudo -n sh /opt/panperyskop/admin/vps/orchestrator.sh --provider multikino --full'

# status + logs
cat /opt/panperyskop/admin/vps/logs/status.json
tail -f /opt/panperyskop/admin/vps/logs/orchestrator.log

# egress check (multikino auth through the exit node)
ssh frog 'sh /opt/panperyskop/admin/vps/check-exit.sh'
```

> **Gotcha (post-mortem 2026-08-20):** running `sudo -n node …/vps-seed.mjs …` directly
> drops the proxy env (`sudo` strips it, and `NODE_USE_ENV_PROXY` is parsed at launch),
> so every fetch egresses from the datacenter IP → multikino `auth -> 403`. Always go
> through `orchestrator.sh` (`sudo -n sh /opt/panperyskop/admin/vps/orchestrator.sh …`),
> which exports the proxy vars before `node` starts.

DB check after a seed:

```sh
npx wrangler d1 execute panperyskop-db --remote \
  --command="SELECT substr(external_id,1,instr(external_id,'-')-1) src, status, COUNT(*) n FROM posts WHERE external_id IS NOT NULL GROUP BY src, status ORDER BY src"
```

---

## SSH / setup notes

- Mac `~/.ssh/config`:
  ```
  Host <vps>
    HostName <vps-host>
    Port 11322
    User frog
    IdentityFile ~/.ssh/<vps-key>
    IdentitiesOnly yes
  ```
- The VPS is Alpine (apk) / busybox. **Node 24** — `Intl.DateTimeFormat('en-CA')` does NOT render
  ISO dates there (returns `08/18/2026`), so all Warsaw-date helpers use `formatToParts`.
- Image processing is cross-platform: macOS `sips`, Linux `convert` (imagemagick).
- **Proxy env must be set at process launch**, not at runtime — `NODE_USE_ENV_PROXY` is parsed by
  Node at startup. It lives in `orchestrator.sh` (`HTTPS_PROXY` + `NODE_USE_ENV_PROXY`).

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `multikino auth -> 403` | fetch egressing from the VPS datacenter IP (proxy env missing / exit node down) | ensure `orchestrator.sh` has `HTTPS_PROXY`+`NODE_USE_ENV_PROXY`; check exit node (`tailscale status`, `check-exit.sh`) |
| `no usable exit node for <provider>` | phone + Mac both offline | cron retries every 5 min; enable Mac "Use as Exit Node" / phone exit node |
| pass `done in 0s`, nothing staged | exit-node probe failed fast | see above |
| OOM kills / SSH hanging | concurrent orchestrators on the 256 MB box | single-instance lock already prevents it; check `orchestrator.lock` for a stale pid (clears at next kick) |
| seed pauses with `resources tight` | resource gate (MemAvailable/load) | expected; next 5-min kick resumes |
| `multikino auth -> 403` after a long run | multikino rate-limits bursts per IP | transient; next kick retries; resetting the phone IP helps |
| stale `orchestrator.lock` | a killed process left the pidfile | next kick detects the dead pid and takes over; or `sudo rm -f .../orchestrator.lock` |
| proxy down | service crashed | `sudo rc-service panperyskop-proxy restart` |

## Webshare usage policy

Two Webshare accounts are kept separate so test/analysis traffic never eats the
production budget:

- **Production (VPS)**: `ROTATE_ACCOUNT` (rotating residential) via
  `WEBSHARE_URL` in `.env`. Measured at ~0.5–1 MB/day for the far-edge seed and
  ~4 MB for a full 7-day backfill (fetch only; media downloads go direct).
- **Local tests/analysis (Mac)**: the STATIC account `STATIC_ACCOUNT`
  (`https://ipv4.webshare.io` confirms the fixed IP). Never point a test tool
  at the production rotate account — a single kupbilecik listing pass is ~28 MB
  through the proxy.
