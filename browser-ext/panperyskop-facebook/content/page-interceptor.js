// Page-world interceptor (injected via scripting.executeScript world:'MAIN').
// Runs in the PAGE context, where window.fetch/XMLHttpRequest are writable
// (Firefox content scripts cannot override them — Xray wrappers).
//
// SAFETY: the response is read ONLY via clone() and the original is returned
// untouched — the response stream is never delayed/aborted, so Facebook never
// sees a network error and never retries (a retry loop is what rate-limited the
// account with filterResponseData). Every POST /api/graphql/ body is forwarded
// to the content script via window.postMessage for parsing + storage.
(function () {
  'use strict';
  if (globalThis.__ppPageInterceptor) return;
  globalThis.__ppPageInterceptor = true;

  function post(msg) {
    try {
      window.postMessage(msg, location.origin);
    } catch (e) {
      // ignore
    }
  }

  post({ type: 'pp-interceptor-active', ts: Date.now() });

  function isGraphql(url, method) {
    return String(method).toUpperCase() === 'POST' && /\/api\/graphql\//.test(url || '');
  }

  const origFetch = window.fetch;
  if (origFetch) {
    window.fetch = function (input, init) {
      const url = typeof input === 'string' ? input : (input && input.url) || '';
      const method = (init && init.method) || 'GET';
      if (isGraphql(url, method)) {
        return origFetch.apply(this, arguments).then((res) => {
          try {
            res.clone().text().then((text) => post({ type: 'pp-graphql', text }));
          } catch (e) {
            // never break the page's own fetch
          }
          return res;
        });
      }
      return origFetch.apply(this, arguments);
    };
  }

  const proto = XMLHttpRequest.prototype;
  const origOpen = proto.open;
  const origSend = proto.send;
  proto.open = function (method, url) {
    this.__ppUrl = url;
    this.__ppMethod = method;
    return origOpen.apply(this, arguments);
  };
  proto.send = function () {
    this.addEventListener('load', () => {
      try {
        if (isGraphql(this.__ppUrl, this.__ppMethod)) post({ type: 'pp-graphql', text: this.responseText });
      } catch (e) {
        // ignore
      }
    });
    return origSend.apply(this, arguments);
  };
})();
