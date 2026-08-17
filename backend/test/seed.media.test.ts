import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectMediaType, extForMediaType } from '../src/core/mediaFormat';

function byteSeq(...bytes: number[]): Uint8Array {
  return new Uint8Array(bytes);
}

test('detectMediaType: webp (RIFF....WEBP)', () => {
  const webp = byteSeq(0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50);
  assert.equal(detectMediaType(webp), 'image/webp');
});

test('detectMediaType: still detects jpeg/png/heic/mp4', () => {
  assert.equal(detectMediaType(byteSeq(0xff, 0xd8, 0xff, 0xe0)), 'image/jpeg');
  assert.equal(detectMediaType(byteSeq(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)), 'image/png');
  const heic = byteSeq(0, 0, 0, 0, 0x66, 0x74, 0x79, 0x70, ...'heic'.split('').map((c) => c.charCodeAt(0)));
  assert.equal(detectMediaType(heic), 'image/heic');
  const mp4 = byteSeq(0, 0, 0, 0, 0x66, 0x74, 0x79, 0x70, ...'mp42'.split('').map((c) => c.charCodeAt(0)));
  assert.equal(detectMediaType(mp4), 'video/mp4');
});

test('detectMediaType: rejects garbage and short buffers', () => {
  assert.equal(detectMediaType(byteSeq(0, 1, 2, 3)), null);
  assert.equal(detectMediaType(new Uint8Array(0)), null);
  // RIFF but missing WEBP marker
  assert.equal(detectMediaType(byteSeq(0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x00, 0x00, 0x00, 0x00)), null);
});

test('extForMediaType: webp -> .webp, jpeg -> .jpg', () => {
  assert.equal(extForMediaType('image/webp'), 'webp');
  assert.equal(extForMediaType('image/jpeg'), 'jpg');
  assert.equal(extForMediaType('image/png'), 'png');
});
