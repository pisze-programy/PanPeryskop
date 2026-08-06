# PanPeryskop

See what's happening in your city — geo-anchored stories (photo, video, text) for the Polish market. MVP: Poznań.

## Stack

- **iOS:** SwiftUI, iOS 18+
- **Map:** MapLibre Native + OSM
- **Backend:** Cloudflare Workers (Hono) + D1 + R2
- **Auth:** device_id + Apple/Google OAuth (id_token verification, per-device bans)

## Structure

```
ios/       — Xcode project (xcodegen)
backend/   — Cloudflare Worker (TypeScript)
admin/     — Content moderation CLI
```

## Getting started

```bash
# Backend
cd backend && npm install && npx wrangler dev

# iOS
xcodegen generate --spec ios/project.yml
open ios/PanPeryskop.xcodeproj

# Admin CLI
cd admin && npm install && node src/cli.js queue
```

## Event seeding
- **Automated import (current):** see `admin/seed/SEED-PLAYBOOK.md` (agent
  playbook — local, gitignored). Shortcut: `SEED.md` at repo root.
- Scripts: `admin/src/seed-import.mjs` (fetch → candidates) and
  `admin/src/seed-ingest.mjs` (upload → pending).

## API (Worker)

| Endpoint | Description |
|---|---|
| `POST /auth/device` | Login / register per device_id |
| `POST /auth/apple` | Sign in with Apple (id_token → user; dev-mode simulation) |
| `POST /auth/google` | Sign in with Google (id_token → user; dev-mode simulation) |
| `POST /auth/logout` | Invalidate session token server-side |
| `POST /admin/ban` | Ban device_id permanently (blocks login + active sessions) |
| `POST /admin/unban` | Remove device ban |
| `GET /users/me` | Current user (username, avatar_url, role) |
| `PATCH /users/me` | Update display name (`{username}`) |
| `GET /users/me/posts` | All of my posts (all statuses, incl. expired) |
| `POST /users/avatar` | Upload avatar (multipart → R2) |
| `GET /stories?bbox=` | Active stories in region (sorted by popularity) |
| `GET /stories/heatmap?bbox=` | Congestion heatmap grid |
| `POST /posts` | Create post (multipart → R2, pending status) |
| `POST /actions/:id/like` | Toggle like |
| `POST /actions/:id/share` | Share |
| `POST /actions/:id/watched` | Mark as watched (hides for user) |
| `GET /admin/queue` | Moderation queue |
| `POST /admin/posts/:id/approve` | Approve |
| `POST /admin/posts/:id/reject` | Reject (optional `{reason}`) |

Posts are visible for 24 hours, then automatically hidden (not deleted).
