-- Errors page: the window query sorts + filters on created_at; the DLQ grows.
CREATE INDEX IF NOT EXISTS idx_client_errors_created ON client_errors(created_at);
CREATE INDEX IF NOT EXISTS idx_client_errors_type ON client_errors(error_type, created_at);
