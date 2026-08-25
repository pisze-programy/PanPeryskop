<p align="center">
  <img src="ios/PanPeryskop/Assets.xcassets/AppIcon.appiconset/icon_120.png" width="120" alt="logo">
</p>

<h1 align="center">Pan Peryskop</h1>

<p align="center">
  <strong>Mobile APP · Events · LIVE</strong><br>
  See what's happening in your city<br>
  geo-anchored stories (photo, video) and events
</p>

---

<video src="demo.mp4" width="600" controls></video>


## Stack

- **iOS:** SwiftUI, iOS 18+ (XcodeGen project)
- **Map:** MapLibre Native + OSM
- **Backend:** Cloudflare Workers (Hono) + D1 + R2 + Queues
- **Auth:** Sign in with Apple (real id_token verification), per-device bans
- **Website:** Cloudflare Pages landing + legal docs (`site/`)


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
