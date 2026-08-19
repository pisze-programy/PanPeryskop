# PanPeryskop

See what's happening in your city — geo-anchored stories (photo, video) and events
(cinema, concerts, meetups) on an interactive map for the Polish market.

## Stack

- **iOS:** SwiftUI, iOS 18+ (XcodeGen project)
- **Map:** MapLibre Native + OSM
- **Backend:** Cloudflare Workers (Hono) + D1 + R2 + Queues
- **Auth:** Sign in with Apple (real id_token verification), per-device bans
- **Website:** Cloudflare Pages landing + legal docs (`site/`)

## Production endpoints

| Resource | URL |
|---|---|
| API (Cloudflare Worker) | `https://api.panperyskop.app` |
| Website / legal | `https://panperyskop.app` |
| Admin dashboard | `https://api.panperyskop.app/admin` |
| iOS bundle id | `pl.piszeprogramy.panperyskop` |

## Structure

```
ios/       — Xcode project (xcodegen)
backend/   — Cloudflare Worker (TypeScript)
admin/     — Seed / moderation tooling + VPS orchestrator
site/      — Landing page + legal (Cloudflare Pages)
```

## Getting started

```bash
# Backend (local; .dev.vars overrides vars, e.g. ENVIRONMENT=development)
cd backend && npm install && npx wrangler dev

# iOS
xcodegen generate --spec ios/project.yml
open ios/PanPeryskop.xcodeproj

# Deploy backend
cd backend && npx wrangler deploy

# Deploy site
cd site && npx wrangler pages deploy . --project-name panperyskop-site
```

## Event seeding

- **VPS orchestrator** (`admin/vps/`): residential-egress seed of cinema/event
  providers, kicked every 5 min from cron on the VPS (`BASE_URL`, `ADMIN_SECRET` in
  `admin/vps/.env`).
- **Worker crons:** daily window roll (02:00), audit cleanup (04:00), watchdog (hourly).
- Scripts: `admin/src/seed-ingest.mjs` (upload → approved).

## API (Worker) — production

| Endpoint | Description |
|---|---|
| `POST /auth/apple` | Sign in with Apple (real id_token verification; `ENVIRONMENT=production`) |
| `POST /auth/logout` | Invalidate session token server-side |
| `POST /users/me/delete` | Hard-delete account + all data (Apple 5.1.1(v)) |
| `GET /users/me` | Current user (username, avatar_url, role) |
| `PATCH /users/me` | Update display name (`{username}`) |
| `GET /users/me/posts` | All of my posts (all statuses, incl. expired) |
| `POST /users/avatar` | Upload avatar (multipart → R2) |
| `GET /stories?bbox=` | Active stories in region (sorted by popularity) |
| `POST /posts` | Create post (multipart → R2, auto-approved) |
| `POST /actions/:id/like` | Toggle like |
| `POST /actions/:id/dislike` | Toggle dislike |
| `POST /actions/:id/share` | Share |
| `POST /actions/:id/watched` | Mark as watched (hides for user) |
| `POST /reports/posts/:id/report` | Report content (reason; goes to admin queue) |
| `POST /apple/notifications` | Sign in with Apple server-to-server events (JWKS-verified) |
| `POST /admin/ban` | Ban device_id permanently (blocks login + sessions) |
| `POST /admin/unban` | Remove device ban |
| `GET /admin/reports` | Moderation queue (dashboard: `/admin/reports`) |

Posts are visible for 24 hours, then automatically hidden (not deleted).

## Content moderation (UGC)

- Users report content in-app (`···` → **Raportuj**) — reports never auto-block.
- Admins moderate in the dashboard (`/admin/reports`): reject the post and/or ban
  the author's **device** (not the Apple account).
- Banned devices cannot log in (`isBanned` check on every auth + request).

## Apple App Store notes

- **Sign in with Apple** is the only login; the App ID is registered with the
  `com.apple.developer.applesignin` entitlement.
- `POST /apple/notifications` handles `consentRevoked` (session invalidation) and
  `accountDelete` (hard-delete of linked accounts).
- Account deletion is available in-app (Settings → Usuń konto).
