// Background (MV3 event page — Firefox loads background.js as a classic page,
// NOT a service worker, so no importScripts; the shared libs are listed in the
// manifest's background.scripts). Jobs:
//   1. Passive GraphQL capture via webRequest.filterResponseData — reads every
//      POST https://*.facebook.com/api/graphql/* response body, parses
//      events.edges[].node, stores raw + events, and relays a summary to the FB
//      page console.
//   2. Context menu: PanPeryskop -> Facebook / Clear captures.
//   3. Routing between the summary page and the active FB tab's content script.
'use strict';

const MENU_ROOT = 'pp-menu';
const MENU_FB = 'pp-menu-facebook';
const MENU_CLEAR = 'pp-menu-clear';

function log(...args) {
  console.log('[panperyskop]', ...args);
}

function createMenus() {
  try {
    browser.contextMenus.removeAll();
    browser.contextMenus.create({ id: MENU_ROOT, title: 'PanPeryskop', contexts: ['page'] });
    browser.contextMenus.create({ id: MENU_FB, parentId: MENU_ROOT, title: 'Facebook', contexts: ['page'] });
    browser.contextMenus.create({ id: MENU_CLEAR, parentId: MENU_ROOT, title: 'Clear captures', contexts: ['page'] });
  } catch (e) {
    log('menu create failed', e);
  }
}

browser.runtime.onInstalled.addListener(createMenus);
browser.runtime.onStartup.addListener(createMenus);

// Keep the MV3 event page warm so webRequest.filterResponseData listeners are
// always live (a suspended event page silently misses requests).
browser.alarms.create('pp-keepalive', { periodInMinutes: 0.25 });
browser.alarms.onAlarm.addListener(() => {
  // no-op wake — the listeners are re-registered on wake and stay warm
});

// ---------- passive GraphQL capture (response-body stream) ----------
async function notifyContentScripts(msg) {
  const tabs = await browser.tabs.query({ url: ['*://*.facebook.com/*'] });
  for (const t of tabs) {
    try {
      await browser.tabs.sendMessage(t.id, msg);
    } catch {
      // content script not present on this tab — store still has the data
    }
  }
}

async function relayDebug(line) {
  await notifyContentScripts({ type: 'pp-capture-debug', line });
}

async function handleGraphqlBody(url, text) {
  try {
    await PP.store.pushRaw(text); // keep every raw payload for validation
    const events = PP.parser.eventsFromGraphql(text);
    if (!events.length) {
      const line = `graphql ${url}: ${text.length} bytes, 0 events parsed`;
      log(line);
      await relayDebug(line);
      return;
    }
    const merged = await PP.store.merge(events);
    const line = `captured ${events.length} facebook events (${text.length} bytes) -> ${merged.length} total`;
    log(line);
    await notifyContentScripts({
      type: 'pp-captured',
      events: events.map((e) => ({ fbId: e.fbId, title: e.title, startMs: e.startMs, location: e.location, link: e.link })),
    });
  } catch (e) {
    log('capture failed', e);
    await relayDebug(`capture failed: ${String((e && e.message) || e)}`);
  }
}

browser.webRequest.onBeforeRequest.addListener(
  (details) => {
    log(`graphql request: ${details.url}`);
    let filter;
    try {
      filter = browser.webRequest.filterResponseData(details.requestId);
    } catch (e) {
      const line = `filterResponseData unavailable: ${String((e && e.message) || e)}`;
      log(line);
      relayDebug(line);
      return;
    }
    const decoder = new TextDecoder('utf-8');
    let text = '';

    filter.ondata = (event) => {
      text += decoder.decode(event.data, { stream: true });
      filter.write(event.data);
    };
    filter.onstop = () => {
      filter.close();
      handleGraphqlBody(details.url, text + decoder.decode());
    };
    filter.onerror = () => {
      const line = `filter error on ${details.url}: ${String(filter.error || 'unknown')}`;
      log(line);
      relayDebug(line);
      try {
        filter.disconnect();
      } catch (e) {
        // already closed
      }
    };
  },
  { urls: ['https://*.facebook.com/api/graphql/*'], types: ['xmlhttprequest', 'other'] },
  ['blocking'],
);

// ---------- tab helpers ----------
async function findFbTab() {
  const stored = await PP.store.getLastFbTab();
  if (stored) {
    try {
      const tab = await browser.tabs.get(stored);
      if (tab && tab.url && /facebook\.com/.test(tab.url)) return tab;
    } catch {
      // stale id — fall through to a live query
    }
  }
  const tabs = await browser.tabs.query({ url: ['*://*.facebook.com/*'] });
  return tabs.find((t) => t.active) || tabs[0] || null;
}

const CONTENT_FILES = [
  'lib/settings.js',
  'lib/store.js',
  'lib/events-parser.js',
  'lib/api.js',
  'lib/image.js',
  'content/content.js',
];

async function ensureContentScripts(tabId) {
  try {
    await browser.scripting.executeScript({ target: { tabId }, files: CONTENT_FILES });
  } catch (e) {
    log('content script injection failed', e);
    throw e;
  }
}

async function sendToFbTab(msg) {
  const tab = await findFbTab();
  if (!tab) throw new Error('no open facebook tab');
  try {
    return await browser.tabs.sendMessage(tab.id, msg);
  } catch {
    await ensureContentScripts(tab.id);
    return browser.tabs.sendMessage(tab.id, msg);
  }
}

// ---------- context menu ----------
browser.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === MENU_CLEAR) {
    try {
      await PP.store.clear();
      log('captures cleared');
    } catch (e) {
      log('clear failed', e);
    }
    return;
  }
  if (info.menuItemId !== MENU_FB) return;
  try {
    const fbTab = tab && tab.id ? tab : await findFbTab();
    if (fbTab && fbTab.id) {
      await PP.store.setLastFbTab(fbTab.id);
      try {
        const scraped = await browser.tabs.sendMessage(fbTab.id, { type: 'pp-scrape-dom' });
        if (Array.isArray(scraped) && scraped.length) {
          await PP.store.merge(scraped);
          log(`dom fallback merged ${scraped.length} events`);
        }
      } catch {
        // no content script on this tab — captures still exist in storage
      }
    }
  } catch (e) {
    log('menu click handling failed', e);
  }
  await browser.tabs.create({ url: browser.runtime.getURL('summary/summary.html') });
});

// ---------- message router (summary page <-> FB tab) ----------
browser.runtime.onMessage.addListener(async (msg) => {
  switch (msg && msg.type) {
    case 'pp-submit': {
      try {
        const s = await PP.settings.get();
        const results = await sendToFbTab({ type: 'pp-submit-events', events: msg.events, settings: s });
        return { ok: true, results };
      } catch (e) {
        return { ok: false, error: String((e && e.message) || e) };
      }
    }
    default:
      return undefined;
  }
});
