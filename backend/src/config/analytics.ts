// Product analytics. Server-side only: the Worker sends aggregate usage events
// to Google Analytics (Measurement Protocol). No SDK in the app, no account id,
// no device id, no IP — only counts of which feature was used.

export const analytics = {
  // GA4 web stream (Measurement Protocol needs a Web stream: measurement_id +
  // client_id). The api_secret is a secret (wrangler secret put GA4_API_SECRET).
  ga4: {
    measurementId: 'G-JHC9D6QE19',
    // EU collection endpoint, so events land in the EU.
    endpoint: 'https://region1.google-analytics.com/mp/collect',
    timeoutMs: 3_000,
    // We never send user_id or any account/device identifier. Events are
    // anonymous totals; the client id exists only because GA4 requires one.
    sendUserId: false,
  },
} as const;
