/* Pan Peryskop — UI: rok, nawigacja, lang, reveal, rotator słów, fallback wideo */

(function () {
  "use strict";

  /* ---------- rok ---------- */
  var yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  /* ---------- nawigacja: scroll + menu mobilne ---------- */
  var nav = document.getElementById("nav");
  var burger = document.getElementById("nav-burger");
  var navLinks = document.getElementById("nav-links");

  function onScroll() {
    if (nav) nav.classList.toggle("is-scrolled", window.scrollY > 8);
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  if (burger && navLinks) {
    burger.addEventListener("click", function () {
      var open = navLinks.classList.toggle("is-open");
      burger.classList.toggle("is-open", open);
      burger.setAttribute("aria-expanded", open ? "true" : "false");
    });
    navLinks.addEventListener("click", function (e) {
      if (e.target.closest("a")) {
        navLinks.classList.remove("is-open");
        burger.classList.remove("is-open");
        burger.setAttribute("aria-expanded", "false");
      }
    });
  }

  /* ---------- scrollspy ---------- */
  var spyLinks = document.querySelectorAll(".nav-links a[href^='#']");
  if ("IntersectionObserver" in window && spyLinks.length) {
    var sections = [];
    spyLinks.forEach(function (a) {
      var sec = document.querySelector(a.getAttribute("href"));
      if (sec) sections.push(sec);
    });
    var spyObs = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (en) {
          if (!en.isIntersecting) return;
          spyLinks.forEach(function (a) {
            a.classList.toggle("is-active", a.getAttribute("href") === "#" + en.target.id);
          });
        });
      },
      { rootMargin: "-40% 0px -55% 0px" }
    );
    sections.forEach(function (s) { spyObs.observe(s); });
  }

  /* ---------- lang ---------- */
  document.querySelectorAll("[data-lang]").forEach(function (a) {
    a.addEventListener("click", function () {
      try { localStorage.setItem("pp_lang", a.dataset.lang); } catch (e) { /* noop */ }
    });
  });

  /* ---------- reveal ---------- */
  var revealEls = document.querySelectorAll(".reveal, .stagger");
  if ("IntersectionObserver" in window && revealEls.length) {
    var ro = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting) {
            en.target.classList.add("is-in");
            ro.unobserve(en.target);
          }
        });
      },
      { threshold: 0.15, rootMargin: "0px 0px -40px 0px" }
    );
    revealEls.forEach(function (el) { ro.observe(el); });
  }

  /* ---------- rotator słów w H1 (inline-grid — frazy w jednej komórce) ---------- */
  var rotators = document.querySelectorAll(".rotator");
  function initRotator(rot) {
    var words = Array.prototype.slice.call(rot.querySelectorAll(".w"));
    if (!words.length) return;
    words[0].classList.add("is-in");
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    var active = 0;
    setInterval(function () {
      var next = (active + 1) % words.length;
      words[active].classList.remove("is-in");
      words[active].classList.add("is-out");
      words[next].classList.remove("is-out");
      words[next].classList.add("is-in");
      active = next;
    }, 2600);
  }
  rotators.forEach(initRotator);
})();
