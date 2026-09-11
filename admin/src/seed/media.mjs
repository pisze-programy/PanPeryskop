// Media processing: ImageMagick/ffmpeg/sips command execution + image
// compression. I/O only — no decision logic. Every external dependency (exec,
// platform) is injectable so the branches are unit-testable without running
// real encoders.
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const PHOTO_MAX = 1080;
export const THUMB_MAX = 320;

// Small box (256 MB VPS): ImageMagick/ffmpeg can OOM-flake — retry once.
export function run(cmd, exec = execSync) {
  let lastErr;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return exec(cmd, { stdio: ['ignore', 'ignore', 'pipe'], timeout: 180_000 });
    } catch (e) {
      lastErr = e;
      if (attempt === 0) exec('sleep 3', { stdio: 'ignore' });
    }
  }
  throw lastErr;
}

// Cross-platform image resize → JPEG. macOS uses sips; Linux (VPS) uses
// ImageMagick. NOTE: do NOT use `-auto-orient` with ImageMagick 7's convert
// — it fails with "no decode delegate" on valid JPEGs (confirmed). Posters are
// portrait already, so orientation correction is unnecessary. ImageMagick runs
// with a hard memory cap so it spills to disk instead of OOMing the 256 MB box.
export function compressImage(runFn, src, out, max, platform = process.platform) {
  if (platform === 'darwin') {
    runFn(`sips -Z ${max} -s format jpeg "${src}" --out "${out}"`);
  } else {
    runFn(`convert -limit memory 64MiB -limit map 128MiB "${src}" -resize ${max}x${max}\\> -quality 85 "${out}"`);
  }
}

export function optimize(runFn, src, tmp, platform = process.platform) {
  const ext = src.split('.').pop().toLowerCase();
  const isVideo = ['mp4', 'mov', 'm4v'].includes(ext);
  if (isVideo) {
    const mediaOut = join(tmp, 'media.mp4');
    const thumbOut = join(tmp, 'thumb.jpg');
    runFn(`ffmpeg -y -i "${src}" -vf "scale='min(720,iw)':-2" -c:v libx264 -preset fast -crf 28 -c:a aac -b:a 96k -movflags +faststart "${mediaOut}"`);
    runFn(
      `ffmpeg -y -i "${src}" -ss 00:00:00.5 -vframes 1 -vf "scale='min(${THUMB_MAX},iw)':-2" "${thumbOut}" 2>/dev/null || ` +
      `ffmpeg -y -i "${src}" -vframes 1 -vf "scale='min(${THUMB_MAX},iw)':-2" "${thumbOut}"`
    );
    return {
      file: readFileSync(mediaOut), fileName: 'media.mp4', mime: 'video/mp4',
      thumb: readFileSync(thumbOut), type: 'video',
    };
  }
  const mediaOut = join(tmp, 'media.jpg');
  const thumbOut = join(tmp, 'thumb.jpg');
  compressImage(runFn, src, mediaOut, PHOTO_MAX, platform);
  compressImage(runFn, src, thumbOut, THUMB_MAX, platform);
  return {
    file: readFileSync(mediaOut), fileName: 'media.jpg', mime: 'image/jpeg',
    thumb: readFileSync(thumbOut), type: 'photo',
  };
}