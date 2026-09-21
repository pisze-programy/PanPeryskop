# VPS — residential egress host (PanPeryskop)

Some providers (multikino, cinemacity, luma, meetup, going, helios) answer 403 to a
datacenter IP. They answer 200 to a residential IP. This box is the **execution
host** for the app's **VPS executor**. It gives:

1. **residential egress** — the Webshare rotating proxy (`WEBSHARE_URL`),
2. **a callback** — it posts the fetched data back to the app API.

It knows **nothing about provider logic**. That logic lives in `backend/src/seed`
and is shared with every execution method.

---

## Architecture

Providers are pure logic (`backend/src/seed/providers/*.ts`). WHERE they run is
decided by the **executor** (`backend/src/seed/executors/*`) and the **provider
registry** (`backend/src/seed/providers/registry.ts`).

```
backend/src/seed/
├── providers/         # pure provider logic + registry (enabled, priority, executors)
├── executors/
│   ├── types.ts       # ExecutorId ('worker' | 'vps') + Executor contract
│   ├── worker.ts      # CF Workers executor → the queue pipeline
│   └── vps/           # VPS executor
│       ├── consumer.ts     # long-lived drain of the seed work-list
│       ├── travelCli.ts    # travel fetcher (espn | worldsmarathons | route-days)
│       ├── routeDaysJob.ts # flight-schedule drain (route_days)
│       ├── kupWarmCli.ts   # kupbilecik manifest warm
│       ├── awinWarmCli.ts  # eventim (Awin) feed warm
│       ├── runtime.ts      # shared staging/checkpoint/media/dedupe, resource gate
│       └── runners/        # ONE source per provider (wires provider → scope model)
│           ├── luma.ts · meetup.ts · going.ts
│           ├── multikino.ts · cinemacity.ts · helios.ts
```

A provider is assigned to an executor in the registry. Switching execution is
**config, not code**:

```ts
{ id: GOING, enabled: true, priority: 2,
  executors: { vps: { output: 'events-going.json', checkpoint: 'events-going-checkpoint.json' } } },
{ id: KUPBILECIK, enabled: true, priority: 3, executors: { worker: true } },
```

---

## Daily flow

The seed plan runs on the **Cloudflare Worker** (every 3 days). The Worker writes
the durable work-list `seed_units` (D1) and wakes the queue. The VPS consumer
drains the units that belong to the `vps` executor: claim → fetch → post raw
batches → complete. There is **no cron window, no checkpoint and no orchestrator**
— the unit row in D1 is the state.

The consumer is a long-lived process. The `*/5` cron `consumer-ensure.sh` keeps it
alive and starts it after a reboot.

Separate jobs run on their own cron:

| Job | Cron (Warsaw) | Command | Purpose |
| --- | --- | --- | --- |
| consumer keep-alive | `*/5 * * * *` | `consumer-ensure.sh` | restart the drain if it dies |
| kupbilecik warm | `01:00` | `kup-warm.mjs` | per-day manifest into R2 |
| eventim (Awin) warm | `00:03` | `awin-warm.mjs` | Awin feed into R2 |
| ESPN soccer | `Mon 00:10` | `travel.mjs --provider=espn` | travel events |
| worldsmarathons runs | `Mon 00:25` | `travel.mjs --provider=worldsmarathons` | travel events |
| flight schedule | `11:00` | `route-days.sh` | refresh `route_days` (Webshare) |

**Egress:** the Webshare rotating proxy, set by the launcher scripts. `WEBSHARE_URL`
must be in `.env`. Node reads `NODE_USE_ENV_PROXY` **only at process launch**, so the
launcher sets `HTTPS_PROXY` + `NODE_USE_ENV_PROXY` before `node` starts. A bare
`sudo -n node …` drops the proxy and egresses from the datacenter IP.

**Small footprint (256 MB shared box):** every job is a pre-built bundle run as ONE
`node` process — no tsx/esbuild at runtime. The consumer has a resource gate
(MemAvailable < 80 MB or load1 ≥ 2.0 from `/proc`) that pauses the run.

### Flight schedule drain (`route_days`)

`route_days` stores, per (origin, dest, carrier), the days the route flies inside a
90-day horizon. The day list is a bitmask. The VPS fetches it through Webshare and
posts it to the API. The Worker only reads the table — a user request never calls a
provider for schedule data.

```sh
# full drain (all due routes)
ssh frog '/opt/panperyskop/admin/vps/route-days.sh'

# small controlled batch
ssh frog '/opt/panperyskop/admin/vps/route-days.sh --limit=40 --batches=1'
```

The job logs the exact request count and bytes per carrier at the end. Keep the pace
at concurrency 1 with the 400 ms pause: a faster pace makes Wizzair answer 503.

---

## Environment variables

### On the VPS — `admin/vps/.env` (gitignored, REQUIRED)

| Var | Required | Purpose |
| --- | --- | --- |
| `BASE_URL` | yes | PanPeryskop API URL (default `https://api.panperyskop.app`) |
| `ADMIN_SECRET` | yes | Bearer token for the admin endpoints |
| `SEED_VPS_TOKEN` | yes | scoped Bearer for `/seed/units/*` |
| `WEBSHARE_URL` | yes | rotating residential proxy |
| `SNITCH_URL`, `SNITCH_TOKEN` | yes | failure email (cf-snitch) |

Location: `/opt/panperyskop/admin/vps/.env` (one `KEY=VALUE` per line). Copy it to a
fresh box after a wipe — this is the only manual step in the rebuild.

### On the Mac — deploy.sh / setup-vps.sh

| Var | Default | Purpose |
| --- | --- | --- |
| `HOST` | `frog` | SSH alias to the VPS (deploy.sh) |

---

## Rebuild after a VPS wipe — ONE command

From the Mac (repo root):

```sh
sh admin/vps/deploy.sh
```

`deploy.sh` (Mac):

1. builds the bundles (`node admin/vps/build.mjs`) into `backend/dist/`:
   `seed-consumer.mjs`, `kup-warm.mjs`, `awin-warm.mjs`, `travel.mjs`,
2. scp's them with `consumer.sh`, `consumer-ensure.sh`, `route-days.sh`,
   `setup-vps.sh` and `ipv4-proxy.mjs` to the VPS (ssh alias `HOST`),
3. runs the bootstrap there as root (`sudo -n`).

`setup-vps.sh` (VPS, idempotent) then:

1. installs node/npm/imagemagick/ffmpeg,
2. enables `NOPASSWD` sudo for the deploy user,
3. installs the bundles + scripts into `/opt/panperyskop`, removes legacy files,
4. installs the root crontab (see Daily flow),
5. runs a self-test of the consumer scripts.

Requirements on a fresh box: the `HOST` SSH alias + key (see SSH notes), the `.env`
(see Environment variables), and an initial root login for the first `sudo`.

**The bundles are not committed** (`backend/dist/` is gitignored). `deploy.sh`
rebuilds them from the current source, so a fresh deploy carries the latest fixes.

---

## Verification / ops

```sh
# logs
tail -f /opt/panperyskop/admin/vps/logs/consumer.log
tail -f /opt/panperyskop/admin/vps/logs/travel-route-days.log

# flight schedule: one small batch
ssh frog '/opt/panperyskop/admin/vps/route-days.sh --limit=3 --batches=1'

# egress check
ssh frog 'sh /opt/panperyskop/admin/vps/check-exit.sh'
```

DB checks:

```sh
# posts per source + status
npx wrangler d1 execute panperyskop-db --remote \
  --command="SELECT substr(external_id,1,instr(external_id,'-')-1) src, status, COUNT(*) n FROM posts WHERE external_id IS NOT NULL GROUP BY src, status ORDER BY src"

# flight schedule coverage
npx wrangler d1 execute panperyskop-db --remote \
  --command="SELECT origin, COUNT(*) total, SUM(CASE WHEN fetched_at=0 THEN 1 ELSE 0 END) due FROM route_days GROUP BY origin ORDER BY origin"
```

---

## SSH / setup notes

- Mac `~/.ssh/config`:
  ```
  Host frog
    HostName frog01.mikr.us
    User frog
    IdentityFile ~/.ssh/<key>
    IdentitiesOnly yes
  ```
- The VPS is Alpine (apk) / busybox. **Node 24** — `Intl.DateTimeFormat('en-CA')` does
  NOT render ISO dates there, so the Warsaw-date helpers use `formatToParts`.
- Image processing is cross-platform: macOS `sips`, Linux `convert` (imagemagick).
- **Proxy env must be set at process launch.** `NODE_USE_ENV_PROXY` is parsed by Node
  at startup. `consumer.sh` and `route-days.sh` set `HTTPS_PROXY` +
  `NODE_USE_ENV_PROXY` before `node` starts.

---

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| `403` from a provider | the fetch egressed from the datacenter IP | start the job through its launcher (`consumer.sh` / `route-days.sh`), not bare `node` |
| `503` from Wizzair | the pace was too fast | keep concurrency 1 and the 400 ms pause |
| job stops early, rows still `due` | the `due` read hit a D1 replica | the endpoint uses `withSession('first-primary')`; check it is deployed |
| seed pauses with `resources tight` | resource gate (MemAvailable/load) | expected; the next kick resumes |
| consumer not running | process died | `*/5` `consumer-ensure.sh` restarts it; check `consumer.log` |
| stale lock | a killed process left a pidfile | the next kick detects the dead pid and takes over |

## Webshare usage policy

Two Webshare accounts are kept separate so test and analysis traffic never eats the
production budget:

- **Production (VPS)**: the rotate account (rotating residential) via `WEBSHARE_URL`
  in `.env`. Measured at ~0.5–1 MB/day for the far-edge seed, ~4 MB for a full 7-day
  backfill, and ~1–2 MB for a full `route_days` refresh (fetch only; media downloads
  go direct).
- **Local tests/analysis (Mac)**: the static account. Never point a test tool at the
  production rotate account — a single kupbilecik listing pass is ~28 MB through the
  proxy.
