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

// Hero: stala rama. Prev, pause, next i kropki zmieniaja tylko przyklad
// i zdjecie, wiec uklad nie skacze.
const hero = document.getElementById('hero');
const media = document.getElementById('hero-media');
if (hero && media) {
  const images = Array.from(media.querySelectorAll('img'));
  const dots = Array.from(hero.querySelectorAll('.dots button'));
  const example = document.getElementById('example');
  const examples = JSON.parse(media.dataset.examples ?? '[]');
  const calm = window.matchMedia('(prefers-reduced-motion: reduce)');
  let index = 0;
  let timer;

  const show = (next) => {
    index = (next + images.length) % images.length;
    images.forEach((image, i) => image.classList.toggle('is-active', i === index));
    dots.forEach((dot, i) => dot.setAttribute('aria-selected', String(i === index)));
    if (!example || !examples.length) return;
    const text = examples[index % examples.length];
    if (calm.matches) { example.textContent = text; return; }
    example.classList.add('is-swap');
    window.setTimeout(() => { example.textContent = text; example.classList.remove('is-swap'); }, 200);
  };
  const stop = () => { if (timer) clearInterval(timer); timer = undefined; };
  const start = () => { if (calm.matches || images.length < 2) return; stop(); timer = setInterval(() => show(index + 1), 7000); };
  const hold = () => { stop(); window.setTimeout(start, 12000); };

  dots.forEach((dot, i) => dot.addEventListener('click', () => { show(i); hold(); }));
  hero.querySelectorAll('[data-slide-prev]').forEach((button) => button.addEventListener('click', () => { show(index - 1); hold(); }));
  hero.querySelectorAll('[data-slide-next]').forEach((button) => button.addEventListener('click', () => { show(index + 1); hold(); }));
  hero.querySelectorAll('[data-slide-pause]').forEach((button) => button.addEventListener('click', () => {
    const playLabel = button.dataset.labelPlay ?? '';
    const pauseLabel = button.getAttribute('aria-label') ?? '';
    if (timer) { stop(); button.textContent = '▶'; button.setAttribute('aria-label', playLabel); }
    else { start(); button.textContent = 'II'; button.setAttribute('aria-label', pauseLabel); }
  }));
  hero.addEventListener('focusin', stop);
  media.addEventListener('pointerdown', hold);
  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));
  start();
}

// Canvas: karty ida lekko za mysza, kazda o swoim wspolczynniku.
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
