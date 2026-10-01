// The .js class arms the entrance states, so a failed script still shows the page.
document.documentElement.classList.add('js');

const splash = document.querySelector('.splash');

if (splash) {
  const logo = splash.querySelector('.splash-logo');
  logo?.classList.add('is-in');
  window.addEventListener('load', () => splash.classList.add('is-out'), { once: true });
  window.setTimeout(() => splash.classList.add('is-out'), 1200);
}

const nav = document.getElementById('nav');
if (nav) {
  const onScroll = () => nav.classList.toggle('is-stuck', window.scrollY > 8);
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });
}

const openButton = document.getElementById('menu-open');
const closeButton = document.getElementById('menu-close');
const sheet = document.getElementById('menu-sheet');

function setSheet(open) {
  if (!sheet || !openButton) return;
  sheet.hidden = !open;
  openButton.setAttribute('aria-expanded', String(open));
  document.body.style.overflow = open ? 'hidden' : '';
  if (open) {
    sheet.querySelector('a, button')?.focus();
  } else {
    openButton.focus();
  }
}

openButton?.addEventListener('click', () => setSheet(true));
closeButton?.addEventListener('click', () => setSheet(false));
sheet?.addEventListener('click', (event) => {
  if (event.target === sheet) setSheet(false);
});
sheet?.querySelectorAll('a').forEach((link) => link.addEventListener('click', () => setSheet(false)));
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && sheet && !sheet.hidden) setSheet(false);
});

// Only an element that sits below the fold at load is armed. Anything already on
// screen stays visible, so a failed observer can never leave a blank page.
const reveals = document.querySelectorAll('.reveal, .statement');
if (reveals.length && 'IntersectionObserver' in window) {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-in');
      observer.unobserve(entry.target);
    });
  }, { threshold: 0.15, rootMargin: '0px 0px -8% 0px' });
  reveals.forEach((element) => {
    if (element.getBoundingClientRect().top > window.innerHeight) {
      element.classList.add('is-armed');
      observer.observe(element);
    }
  });
}

const hero = document.getElementById('hero');
const media = document.getElementById('hero-media');
if (hero && media) {
  const track = media.querySelector('.hero-track');
  const slides = Array.from(media.querySelectorAll('.hero-slide'));
  const example = document.getElementById('example');
  const examples = JSON.parse(media.dataset.examples ?? '[]');
  const calm = window.matchMedia('(prefers-reduced-motion: reduce)');
  const WAVE_OUT_MS = 131;
  let index = 0;
  let timer;
  let paused = false;

  const wordSpan = (word, i) => {
    const span = document.createElement('span');
    span.className = 'example-word is-entering';
    span.textContent = word;
    span.style.setProperty('--i', String(i));
    return span;
  };

  const enterWords = (text) => {
    const fragment = document.createDocumentFragment();
    text.split(/\s+/).filter(Boolean).forEach((word, i) => {
      fragment.append(wordSpan(word, i));
      fragment.append(document.createTextNode(' '));
    });
    example.replaceChildren(fragment);
    void example.offsetWidth;
    example.querySelectorAll('.example-word').forEach((word) => word.classList.remove('is-entering'));
  };

  const leaveWords = (text) => {
    example.querySelectorAll('.example-word').forEach((word) => word.classList.add('is-leaving'));
    window.setTimeout(() => enterWords(text), WAVE_OUT_MS);
  };

  const setExample = (text) => {
    if (!example) return;
    if (calm.matches) { example.textContent = text; return; }
    if (example.querySelector('.example-word')) leaveWords(text);
    else enterWords(text);
  };

  const show = (next) => {
    if (!slides.length) return;
    index = ((next % slides.length) + slides.length) % slides.length;
    if (track) track.style.transform = `translateX(${-index * 100}%)`;
    if (examples.length) setExample(examples[index % examples.length]);
  };

  const stop = () => { if (timer) window.clearInterval(timer); timer = undefined; };
  const start = () => {
    if (paused || slides.length < 2) return;
    stop();
    timer = window.setInterval(() => show(index + 1), 4000);
  };

  const pauseButton = hero.querySelector('[data-slide-pause]');

  const syncPauseButton = () => {
    if (!pauseButton) return;
    const playLabel = pauseButton.dataset.labelPlay ?? '';
    const pauseLabel = pauseButton.dataset.labelPause ?? '';
    pauseButton.textContent = paused ? '▶' : 'II';
    pauseButton.setAttribute('aria-label', paused ? playLabel : pauseLabel);
  };

  hero.querySelectorAll('[data-slide-prev]').forEach((button) => button.addEventListener('click', () => { paused = true; stop(); syncPauseButton(); show(index - 1); }));
  hero.querySelectorAll('[data-slide-next]').forEach((button) => button.addEventListener('click', () => { paused = true; stop(); syncPauseButton(); show(index + 1); }));

  let dragging = false;
  let dragStartX = 0;
  let dragStartY = 0;

  const endDrag = (clientX) => {
    if (!dragging) return;
    dragging = false;
    const shift = clientX - dragStartX;
    if (Math.abs(shift) < 40) return;
    paused = true;
    stop();
    show(shift < 0 ? index + 1 : index - 1);
  };

  media.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    dragging = true;
    dragStartX = event.clientX;
    dragStartY = event.clientY;
  });
  window.addEventListener('pointerup', (event) => endDrag(event.clientX));
  window.addEventListener('pointercancel', () => { dragging = false; });

  media.addEventListener('touchstart', (event) => {
    dragStartX = event.touches[0].clientX;
    dragStartY = event.touches[0].clientY;
    dragging = true;
  }, { passive: true });
  media.addEventListener('touchend', (event) => {
    const touch = event.changedTouches[0];
    const horizontal = Math.abs(touch.clientX - dragStartX) > Math.abs(touch.clientY - dragStartY);
    if (!horizontal) { dragging = false; return; }
    endDrag(touch.clientX);
  }, { passive: true });
  pauseButton?.addEventListener('click', () => {
    paused = !paused;
    if (paused) stop(); else start();
    syncPauseButton();
  });
  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));
  show(0);
  start();
}

const canvas = document.querySelector('.canvas');
if (canvas && window.matchMedia('(hover: hover) and (prefers-reduced-motion: no-preference)').matches) {
  const cards = Array.from(canvas.querySelectorAll('.mcard'));
  canvas.addEventListener('pointermove', (event) => {
    const box = canvas.getBoundingClientRect();
    const dx = (event.clientX - box.left) / box.width - 0.5;
    const dy = (event.clientY - box.top) / box.height - 0.5;
    cards.forEach((card, index) => {
      const depth = (index - (cards.length - 1) / 2) * 6;
      card.style.setProperty('--dx', `${(-dx * depth).toFixed(1)}px`);
      card.style.setProperty('--dy', `${(-dy * 10).toFixed(1)}px`);
    });
  });
  canvas.addEventListener('pointerleave', () => cards.forEach((card) => { card.style.setProperty('--dx', '0px'); card.style.setProperty('--dy', '0px'); }));
}

// Canvas: two rows slide apart on scroll. The rows are clipped by the band, so the
// motion is horizontal only. It is a transform, so the section box never changes.
const artwork = document.querySelector('.upcoming-artwork');
const rowsRoot = document.querySelector('.canvas');
if (artwork && rowsRoot && window.matchMedia('(prefers-reduced-motion: no-preference)').matches) {
  const rowCards = Array.from(rowsRoot.querySelectorAll('.mcard'));
  const ROW_BREAK = 4;
  const AMPLITUDE = 16;
  const rowsFit = () => window.matchMedia('(min-width: 700px)').matches;

  const setRowShift = () => {
    if (!rowsFit()) {
      rowCards.forEach((card) => card.style.removeProperty('--sx'));
      return;
    }
    const box = artwork.getBoundingClientRect();
    const span = window.innerHeight + box.height;
    const progress = span > 0 ? (window.innerHeight - box.top) / span : 0;
    const closeness = Math.min(Math.max(progress, 0), 1) - 0.5;
    const shift = closeness * 2 * AMPLITUDE;
    rowCards.forEach((card, index) => {
      const direction = index < ROW_BREAK ? -1 : 1;
      card.style.setProperty('--sx', `${(shift * direction).toFixed(1)}px`);
    });
  };

  let ticking = false;
  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(() => { ticking = false; setRowShift(); });
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });
  setRowShift();
}
