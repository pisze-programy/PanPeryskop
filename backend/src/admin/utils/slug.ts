// Slug helpers — diacritic-folded, url-safe ids for admin-created tags.

export function tagSlug(label: string): string {
  return (label || '')
    .normalize('NFC')
    .toLowerCase()
    .replaceAll('ł', 'l')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
