import type { MiddlewareHandler } from 'hono';
import { classifyRequest } from './classify';
import { anonymousClientId, sendGa4Events } from './ga4';

// Records a usage event as a side effect of the natural product requests. The
// app never calls an analytics endpoint; this observer only sees the requests
// it already makes. No identifiers: the payload carries an event name and
// coarse dimensions (city, day, provider, kind), never a user or device id.
//
// Nothing named /analytics exists: App Review sees only ordinary product
// traffic, and the app is unaware this runs.

export function usageObserver(): MiddlewareHandler<{ Bindings: Env }> {
  return async (c, next) => {
    const path = c.req.path;
    const query = c.req.query();
    await next();
    if (!shouldRecord(c.res.status, path)) return;
    const event = classifyRequest(c.req.method, path, query);
    if (!event) return;
    const clientId = await anonymousClientId(c.env);
    c.executionCtx.waitUntil(sendGa4Events(c.env, [event], clientId));
  };
}

function shouldRecord(status: number, path: string): boolean {
  if (status >= 400 || status === 304) return false;
  if (path.startsWith('/admin') || path.startsWith('/media')) return false;
  if (path === '/health' || path.startsWith('/client')) return false;
  if (path.startsWith('/r/')) return false;
  return true;
}
