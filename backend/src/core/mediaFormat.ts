// Media format detection from magic bytes + file-extension mapping. Shared by the
// post upload routes and the seed pipeline (poster/thumb downloads to R2).

// Sniff the MIME type from a byte buffer's magic number (jpeg/png/webp/heic/mp4).
export function detectMediaType(data: Uint8Array): string | null {
  if (data.length >= 4 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) {
    return 'image/jpeg';
  }
  if (data.length >= 8 && data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47) {
    return 'image/png';
  }
  // WebP: "RIFF" + size + "WEBP" at bytes 0-3 / 4-7 / 8-11.
  if (
    data.length >= 12 &&
    data[0] === 0x52 && data[1] === 0x49 && data[2] === 0x46 && data[3] === 0x46 &&
    data[8] === 0x57 && data[9] === 0x45 && data[10] === 0x42 && data[11] === 0x50
  ) {
    return 'image/webp';
  }
  if (
    data.length >= 12 &&
    data[4] === 0x66 && data[5] === 0x74 && data[6] === 0x79 && data[7] === 0x70 &&
    (new TextDecoder().decode(data.subarray(8, 12)) === 'heic' ||
     new TextDecoder().decode(data.subarray(8, 12)) === 'heix' ||
     new TextDecoder().decode(data.subarray(8, 12)) === 'mif1')
  ) {
    return 'image/heic';
  }
  if (
    data.length >= 12 &&
    data[4] === 0x66 && data[5] === 0x74 && data[6] === 0x79 && data[7] === 0x70 &&
    new TextDecoder().decode(data.subarray(8, 12)) === 'mp42'
  ) {
    return 'video/mp4';
  }
  return null;
}

// File extension for a detected MIME type. WebP -> .webp so R2 keys carry the
// real format and the client renders it natively (iOS ImageIO decodes WebP).
export function extForMediaType(type: string): string {
  return type === 'image/jpeg' ? 'jpg' : type === 'image/heic' ? 'heic' : type.split('/')[1];
}
