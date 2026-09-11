type SeedQueueMessage = import('./seed/queue').SeedQueueMessage;

interface Env {
  DB: D1Database;
  MEDIA: R2Bucket;
  BROWSER: BrowserRun;
  SEED_FETCH_QUEUE: Queue<SeedQueueMessage>;
  // Admin (Bearer for CLI/seed + password hash + cookie signing for dashboard).
  ADMIN_SECRET?: string;
  // Scoped Bearer for the VPS seed consumer: ONLY the /seed/units/* endpoints.
  // Rotating it never touches the full admin secret.
  SEED_VPS_TOKEN?: string;
  ADMIN_PASSWORD_HASH?: string;   // PBKDF2-SHA256 "salt:iterations:hex"
  ADMIN_COOKIE_SECRET?: string;   // HMAC key for admin session cookies
  // goingapp scraping (no hardcoded keys — see wrangler secrets/vars).
  ALGOLIA_APP_ID?: string;
  ALGOLIA_API_KEY?: string;
  CLOUDINARY_SIG?: string;
  // VPS-built TradeDoubler slug→click map handed to the going provider at run time.
  GOING_TD_MAP?: Record<string, string>;
  // getyourguide Partner API access token (X-ACCESS-TOKEN header).
  GETYOURGUIDE_TOKEN?: string;
  // ebilet TradeDoubler feed token (productsUnlimited.json?token=...).
  EBILET_TD_TOKEN?: string;
  // kupbilecik official partner API token (api/?token=...).
  KUPBILECIK_API_TOKEN?: string;
  // cf-snitch email service (seed digest) — see docs/seed-digest.md.
  SNITCH_URL?: string;
  SNITCH_TOKEN?: string;
  ENVIRONMENT?: string;
  CORS_ORIGIN?: string;
  MEDIA_R2_DEV?: string;
  APPLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_ID?: string;
  // Cron schedule (mirrors wrangler.toml [triggers]) for the dashboard display.
  CRON_SCHEDULE?: string;
}
