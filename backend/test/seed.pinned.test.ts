import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pinnedVenue } from '../src/seed/venues/pinned';

test('pinnedVenue: every MTP spelling maps to the fixed point', () => {
  for (const name of [
    'MTP, HALA NR 1 Poznań',
    'MTP - PAWILON 5',
    'Międzynarodowe Targi Poznańskie (MTP)',
    'Targi Poznańskie',
  ]) {
    const v = pinnedVenue(name, 'Poznań');
    assert.ok(v, `${name} must pin`);
    assert.equal(v!.id, 'miedzynarodowetargipoznanskiemtp');
    assert.equal(v!.lat, 52.40268998001128);
    assert.equal(v!.lng, 16.909210992543912);
  }
});

test('pinnedVenue: another city never captures an MTP-like name', () => {
  assert.equal(pinnedVenue('MTP Warszawa', 'Warszawa'), null);
  assert.equal(pinnedVenue('MTPA Klub', 'Wrocław'), null);
});

test('pinnedVenue: other trade fairs are not pinned', () => {
  assert.equal(pinnedVenue('Targi Kielce', 'Kielce'), null);
  assert.equal(pinnedVenue('Targi Lublin', 'Lublin'), null);
  assert.equal(pinnedVenue('Targi Akwarystyczne Wrocław', 'Wrocław'), null);
});
