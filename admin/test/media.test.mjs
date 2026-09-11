import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { run, compressImage, optimize, PHOTO_MAX, THUMB_MAX } from '../src/seed/media.mjs';

// ---------- run ----------

test('run: returns the exec result on first success', () => {
  const exec = () => Buffer.from('ok');
  assert.equal(run('cmd', exec).toString(), 'ok');
});

test('run: retries once after a failure, sleeping between attempts', () => {
  const calls = [];
  let n = 0;
  const exec = (cmd, opts) => {
    calls.push({ cmd, opts });
    if (cmd === 'cmd' && ++n === 1) throw new Error('boom');
    return Buffer.from('second');
  };
  assert.equal(run('cmd', exec).toString(), 'second');
  assert.deepEqual(calls.map((c) => c.cmd), ['cmd', 'sleep 3', 'cmd']);
});

test('run: throws the last error when both command attempts fail', () => {
  let n = 0;
  const exec = (cmd) => {
    if (cmd === 'sleep 3') return; // the retry backoff itself succeeds
    throw new Error(`fail-${++n}`);
  };
  assert.throws(() => run('cmd', exec), /fail-2/);
});

test('run: a failing backoff sleep propagates immediately (not wrapped)', () => {
  const exec = (cmd) => { throw new Error(`die:${cmd}`); };
  assert.throws(() => run('cmd', exec), /die:sleep 3/);
});

// ---------- compressImage ----------

test('compressImage: darwin uses sips with the max size', () => {
  const cmds = [];
  compressImage((c) => cmds.push(c), '/in.png', '/out.jpg', 1080, 'darwin');
  assert.equal(cmds.length, 1);
  assert.match(cmds[0], /^sips -Z 1080 -s format jpeg "\/in\.png" --out "\/out\.jpg"$/);
});

test('compressImage: linux uses convert with the memory caps and resize', () => {
  const cmds = [];
  compressImage((c) => cmds.push(c), '/in.png', '/out.jpg', 320, 'linux');
  assert.equal(cmds.length, 1);
  assert.match(cmds[0], /^convert -limit memory 64MiB -limit map 128MiB "\/in\.png" -resize 320x320\\> -quality 85 "\/out\.jpg"$/);
});

// ---------- optimize ----------

function tmpWith(files) {
  const dir = mkdtempSync(join(tmpdir(), 'pp-media-test-'));
  for (const f of files) writeFileSync(join(dir, f), `data:${f}`);
  return dir;
}

test('optimize: photo → media.jpg + thumb.jpg, type photo', () => {
  const dir = tmpWith(['media.jpg', 'thumb.jpg']);
  try {
    const cmds = [];
    const out = optimize((c) => cmds.push(c), '/src/poster.jpg', dir, 'linux');
    assert.equal(out.type, 'photo');
    assert.equal(out.fileName, 'media.jpg');
    assert.equal(out.mime, 'image/jpeg');
    assert.equal(out.file.toString(), 'data:media.jpg');
    assert.equal(out.thumb.toString(), 'data:thumb.jpg');
    // two compressImage calls: full size + thumb
    assert.equal(cmds.length, 2);
    assert.match(cmds[0], new RegExp(`-resize ${PHOTO_MAX}x${PHOTO_MAX}`));
    assert.match(cmds[1], new RegExp(`-resize ${THUMB_MAX}x${THUMB_MAX}`));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('optimize: video (mp4) → media.mp4 + thumb.jpg, type video', () => {
  const dir = tmpWith(['media.mp4', 'thumb.jpg']);
  try {
    const cmds = [];
    const out = optimize((c) => cmds.push(c), '/src/clip.mp4', dir, 'linux');
    assert.equal(out.type, 'video');
    assert.equal(out.fileName, 'media.mp4');
    assert.equal(out.mime, 'video/mp4');
    assert.equal(out.file.toString(), 'data:media.mp4');
    assert.equal(out.thumb.toString(), 'data:thumb.jpg');
    assert.equal(cmds.length, 2); // encode + thumbnail (with fallback)
    assert.match(cmds[1], /\|\|/); // fallback form present
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('optimize: video detection is case-insensitive and covers mov/m4v', () => {
  for (const name of ['CLIP.MP4', 'clip.mov', 'clip.M4V']) {
    const dir = tmpWith(['media.mp4', 'thumb.jpg']);
    try {
      const out = optimize(() => {}, `/src/${name}`, dir, 'linux');
      assert.equal(out.type, 'video', `${name} should be video`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});