// Background (MV3 event page — Firefox loads background.js as a classic page,
// NOT a service worker, so no importScripts; the shared libs are listed in the
// manifest's background.scripts). Jobs:
//   1. (OPT-IN only) Inject the page-world GraphQL interceptor when
//      settings.graphqlCapture is on. OFF by default — the DOM MutationObserver
//      in the content script is invisible to Facebook's page JS and needs no
//      injection.
//   2. Context menu: Open summary / Clear captures (diagnostics only — capture
//      and submit are fully automatic now).
//   3. Toolbar action -> summary page; badge shows the submission queue.
'use strict';

const MENU_ROOT = 'pp-menu';
const MENU_SUMMARY = 'pp-menu-summary';
const MENU_CLEAR = 'pp-menu-clear';
const PAGE_INTERCEPTOR = 'content/page-interceptor.js';
const SUMMARY_URL = browser.runtime.getURL('summary/summary.html');

function log(...args) {
  console.log('[ppfb] bg', ...args);
}

function createMenus() {
  try {
    browser.contextMenus.removeAll();
    browser.contextMenus.create({ id: MENU_ROOT, title: 'PanPeryskop', contexts: ['page'] });
    browser.contextMenus.create({ id: MENU_SUMMARY, parentId: MENU_ROOT, title: 'Podsumowanie zbioru', contexts: ['page'] });
    browser.contextMenus.create({ id: MENU_CLEAR, parentId: MENU_ROOT, title: 'Clear captures', contexts: ['page'] });
  } catch (e) {
    log('menu create failed', e);
  }
}

browser.runtime.onInstalled.addListener(createMenus);
browser.runtime.onStartup.addListener(createMenus);

// ---------- page-world interceptor injection (OPT-IN) ----------
async function injectPageInterceptor(tabId) {
  if (!tabId) return;
  try {
    await browser.scripting.executeScript({
      target: { tabId },
      files: [PAGE_INTERCEPTOR],
      world: 'MAIN',
      runAt: 'document_start',
    });
  } catch (e) {
    log('page interceptor injection failed', e);
  }
}

async function graphqlOn() {
  const s = await PP.settings.get();
  return Boolean(s.graphqlCapture);
}

browser.webNavigation.onCommitted.addListener(async (details) => {
  if (details.frameId !== 0) return;
  const url = String(details.url || '');
  if (!/^https:\/\/[a-z0-9.-]*facebook\.com\//i.test(url)) return;
  if (!(await graphqlOn())) return;
  injectPageInterceptor(details.tabId);
});

browser.runtime.onStartup.addListener(async () => {
  createMenus();
  if (!(await graphqlOn())) return;
  const tabs = await browser.tabs.query({ url: ['*://*.facebook.com/*'] });
  for (const t of tabs) if (t.id) await injectPageInterceptor(t.id);
});

// ---------- toolbar action -> summary + submission badge ----------
if (browser.action) {
  browser.action.onClicked.addListener(() => {
    browser.tabs.create({ url: SUMMARY_URL });
  });
}

async function updateBadge() {
  try {
    const states = await PP.store.loadStates();
    const list = Object.values(states);
    const pending = list.filter((s) => s.status === 'captured' || (s.status === 'error' && (s.attempts || 0) < 3)).length;
    const done = list.filter((s) => s.status === 'pending' || s.status === 'duplicate').length;
    const text = pending ? String(pending) : done ? '✓' : '';
    if (browser.action) browser.action.setBadgeText({ text });
  } catch {
    // ignore
  }
}

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
browser.contextMenus.onClicked.addListener(async (info) => {
  if (info.menuItemId === MENU_CLEAR) {
    try {
      await PP.store.clear();
      log('captures cleared');
    } catch (e) {
      log('clear failed', e);
    }
    return;
  }
  if (info.menuItemId === MENU_SUMMARY) {
    browser.tabs.create({ url: SUMMARY_URL });
  }
});

// ---------- message router ----------
browser.runtime.onMessage.addListener(async (msg, sender) => {
  switch (msg && msg.type) {
    case 'pp-state-changed':
      updateBadge();
      return undefined;
    case 'pp-inject': {
      if (!(await graphqlOn())) return undefined;
      await injectPageInterceptor(sender && sender.tab && sender.tab.id);
      return undefined;
    }
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
