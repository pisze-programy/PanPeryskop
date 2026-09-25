-- Banner links are fixed shortlinks, so the app stores one stable URL per
-- partner and the target changes in this table without an app update. The
-- far-future expiry marks a link as permanent.
INSERT OR IGNORE INTO redirect_tokens
  (token, kind, target_url, target_host, created_at, expires_at, active, hits)
VALUES
  ('revolut', 'banner', 'https://revolut.com/referral/?referral-code=krystikgo!SEP2-26-AR&geo-redirect', 'revolut.com', 1790000000000, 4102444800000, 1, 0),
  ('airhelp', 'banner', 'https://airhelp.tpo.mx/XAt50GXJ', 'airhelp.tpo.mx', 1790000000000, 4102444800000, 1, 0),
  ('airalo', 'banner', 'https://airalo.tpo.mx/O378fS2W', 'airalo.tpo.mx', 1790000000000, 4102444800000, 1, 0);
