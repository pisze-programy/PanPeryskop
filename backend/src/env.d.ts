// SeedQueueMessage is defined in src/seed/queue.ts (single source of truth).
type SeedQueueMessage = import('./seed/queue').SeedQueueMessage;

interface Env {
  DB: D1Database;
  MEDIA: R2Bucket;
  BROWSER: BrowserRun;
  SEED_QUEUE: Queue<SeedQueueMessage>;
  SEED_DLQ: Queue<SeedQueueMessage>;
  // Admin (Bearer for CLI/seed + password hash + cookie signing for dashboard).
  ADMIN_SECRET?: string;
  ADMIN_PASSWORD_HASH?: string;   // PBKDF2-SHA256 "salt:iterations:hex"
  ADMIN_COOKIE_SECRET?: string;   // HMAC key for admin session cookies
  // goingapp scraping (no hardcoded keys — see wrangler secrets/vars).
  ALGOLIA_APP_ID?: string;
  ALGOLIA_API_KEY?: string;
  CLOUDINARY_SIG?: string;
  ENVIRONMENT?: string;
  CORS_ORIGIN?: string;
  MEDIA_R2_DEV?: string;
  APPLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_ID?: string;
  // Cron schedule (mirrors wrangler.toml [triggers]) for the dashboard display.
  CRON_SCHEDULE?: string;
}
