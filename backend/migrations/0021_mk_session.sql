-- Shared multikino session token (D1-backed cache). The /auth/token endpoint is
-- rate-limited per egress IP — the seed pipeline runs many scopes across queue
-- invocations, and without a shared cache a burst of auth calls triggers 403.
-- One token per ~12h (JWT exp), shared across all consumer invocations.
CREATE TABLE IF NOT EXISTS mk_session (
  id    INTEGER PRIMARY KEY CHECK (id = 1),
  token TEXT,
  exp   INTEGER
);
