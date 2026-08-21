// Options page: edit API settings, persisted via PP.settings.set().
'use strict';

const FIELDS = ['baseUrl', 'adminSecret'];

async function load() {
  const s = await PP.settings.get();
  for (const f of FIELDS) {
    const el = document.getElementById(f);
    if (el) el.value = s[f] || '';
  }
}

async function save() {
  const partial = {};
  for (const f of FIELDS) {
    const el = document.getElementById(f);
    if (el) partial[f] = el.value.trim();
  }
  await PP.settings.set(partial);
  const status = document.getElementById('status');
  status.textContent = 'Saved.';
  setTimeout(() => (status.textContent = ''), 1500);
}

document.getElementById('save').addEventListener('click', save);
load();
