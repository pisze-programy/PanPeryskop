import type { CloudflareOptions } from '@sentry/cloudflare';

// Sentry options for the Worker. Errors only: no user, no device, no IP, no
// bots. A 500 on an action is visible; who ran it is not.

export function sentryOptions(env: Env): CloudflareOptions | undefined {
  if (!env.SENTRY_DSN) return undefined;
  return {
    dsn: env.SENTRY_DSN,
    // Errors only — no performance traces, no user sessions.
    tracesSampleRate: 0,
    sendDefaultPii: false,
    dataCollection: { userInfo: false, httpBodies: [] },
    beforeSend(event) {
      // Strip anything that could identify a person, even accidentally.
      delete event.user;
      if (event.request) {
        delete event.request.headers;
        delete event.request.cookies;
        delete event.request.query_string;
        delete event.request.data;
        delete event.request.url;
      }
      if (event.breadcrumbs) {
        for (const crumb of event.breadcrumbs) {
          if (crumb.data) {
            delete crumb.data.url;
            delete crumb.data.headers;
          }
        }
      }
      return event;
    },
  };
}
