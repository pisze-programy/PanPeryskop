// Pan Peryskop — trzy zachowania: stan paska, arkusze menu, wejścia przy scrollu.
// Bez tego pliku strona działa: klasa .js włącza dopiero stan początkowy animacji.
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

const reveals = document.querySelectorAll('.reveal');
if (reveals.length && 'IntersectionObserver' in window) {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-in');
      observer.unobserve(entry.target);
    });
  }, { threshold: 0.15, rootMargin: '0px 0px -8% 0px' });
  reveals.forEach((element) => observer.observe(element));
}
