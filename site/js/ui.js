// The .js class arms the entrance states, so a failed script still shows the page.
document.documentElement.classList.add('js');

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
const reveals = document.querySelectorAll('.reveal');
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

const slides = document.getElementById('slides');
if (slides) {
  const dots = Array.from(document.querySelectorAll('.dots button'));
  const panels = Array.from(slides.children);
  const calm = window.matchMedia('(prefers-reduced-motion: reduce)');
  let timer;

  const goTo = (index) => panels[index]?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  const activeIndex = () => Math.max(0, dots.findIndex((dot) => dot.getAttribute('aria-selected') === 'true'));
  const stop = () => { if (timer) clearInterval(timer); timer = undefined; };
  const start = () => { if (calm.matches || dots.length < 2) return; stop(); timer = setInterval(() => goTo((activeIndex() + 1) % dots.length), 7000); };
  const hold = () => { stop(); window.setTimeout(start, 12000); };

  const sync = () => {
    const middle = slides.scrollLeft + slides.clientWidth / 2;
    let active = 0;
    panels.forEach((panel, index) => {
      const centre = panel.offsetLeft + panel.offsetWidth / 2;
      if (Math.abs(centre - middle) < panel.offsetWidth / 2) active = index;
    });
    dots.forEach((dot, index) => dot.setAttribute('aria-selected', String(index === active)));
  };

  dots.forEach((dot, index) => dot.addEventListener('click', () => { goTo(index); hold(); }));
  slides.addEventListener('scroll', sync, { passive: true });
  slides.addEventListener('pointerdown', hold);
  slides.addEventListener('focusin', stop);
  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));
  sync();
  start();
}

// Slider: slajdy, kropki, prev/next/pause i animowany przyklad. Ta sama
// mechanika obsluguje hero i mozaike planow.
document.querySelectorAll('.slides, [data-slider]').forEach((strip) => {
  const panels = Array.from(strip.children).filter((el) => !el.classList.contains('ctrl'));
  const root = strip.closest('section') ?? document;
  const dots = Array.from(root.querySelectorAll('.dots button'));
  const calm = window.matchMedia('(prefers-reduced-motion: reduce)');
  const example = root.querySelector('#example');
  const examples = JSON.parse(strip.dataset.examples ?? '[]');
  let timer;
  let index = 0;

  const goTo = (next) => {
    index = (next + panels.length) % panels.length;
    panels[index]?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    if (dots.length) dots.forEach((dot, i) => dot.setAttribute('aria-selected', String(i === index)));
    if (example && examples.length && !calm.matches) {
      example.classList.add('is-swap');
      window.setTimeout(() => { example.textContent = examples[index % examples.length]; example.classList.remove('is-swap'); }, 200);
    }
  };
  const stop = () => { if (timer) clearInterval(timer); timer = undefined; };
  const start = () => { if (calm.matches || panels.length < 2) return; stop(); timer = setInterval(() => goTo(index + 1), 7000); };
  const hold = () => { stop(); window.setTimeout(start, 12000); };

  root.querySelectorAll('.dots button').forEach((dot, i) => dot.addEventListener('click', () => { goTo(i); hold(); }));
  root.querySelectorAll('[data-slide-prev]').forEach((b) => b.addEventListener('click', () => { goTo(index - 1); hold(); }));
  root.querySelectorAll('[data-slide-next]').forEach((b) => b.addEventListener('click', () => { goTo(index + 1); hold(); }));
  root.querySelectorAll('[data-slide-pause]').forEach((b) => b.addEventListener('click', () => {
    const running = Boolean(timer);
    const playLabel = b.dataset.labelPlay ?? '';
    const pauseLabel = b.getAttribute('aria-label') ?? '';
    if (running) { stop(); b.textContent = '▶'; b.setAttribute('aria-label', playLabel); }
    else { start(); b.textContent = 'II'; b.setAttribute('aria-label', pauseLabel); }
  }));
  strip.addEventListener('pointerdown', hold);
  start();
});
