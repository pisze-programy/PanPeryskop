interface Env {
  DB: D1Database;
  MEDIA: R2Bucket;
  ADMIN_SECRET?: string;
  ENVIRONMENT?: string;
  CORS_ORIGIN?: string;
  MEDIA_R2_DEV?: string;
}
