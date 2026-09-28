CREATE TABLE IF NOT EXISTS content_docs (
  slug       TEXT PRIMARY KEY,
  origin_id  TEXT NOT NULL,
  kind       TEXT NOT NULL,
  bytes      INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_content_docs_origin ON content_docs(origin_id);
CREATE INDEX IF NOT EXISTS idx_content_docs_kind ON content_docs(kind);
