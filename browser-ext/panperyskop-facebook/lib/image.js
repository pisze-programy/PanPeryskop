// Cover-image handling for submitted events. Runs in a content script (page
// context) so fbcdn fetches carry the logged-in session. Downscales to a ≤1080px
// JPEG + a 320px thumb before upload (same sizes as the app's seed pipeline).
(function () {
  'use strict';

  const MAX = 1080;
  const THUMB = 320;

  async function blobFromUrl(url) {
    const res = await fetch(url, { credentials: 'include', mode: 'cors', signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(`cover image fetch ${res.status}`);
    return res.blob();
  }

  async function toJpeg(blob, max, quality) {
    const bitmap = await createImageBitmap(blob);
    const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0, w, h);
    return canvas.convertToBlob({ type: 'image/jpeg', quality });
  }

  /**
   * Fetch + downscale a cover. Falls back to the raw blob when OffscreenCanvas
   * is unavailable. Throws when the cover can't be fetched at all.
   */
  async function prepare(mediaUrl) {
    if (!mediaUrl) throw new Error('event has no cover image');
    const blob = await blobFromUrl(mediaUrl);
    if (typeof OffscreenCanvas === 'undefined') return { media: blob, thumb: null };
    const media = await toJpeg(blob, MAX, 0.82);
    let thumb = null;
    try {
      thumb = await toJpeg(blob, THUMB, 0.75);
    } catch {
      // thumb is optional — the backend derives a fallback from media if absent
    }
    return { media, thumb };
  }

  globalThis.PP = globalThis.PP || {};
  PP.image = { prepare };
})();
