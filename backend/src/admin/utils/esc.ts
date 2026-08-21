// Escaping / safe-embedding helpers for SSR HTML + inline scripts.

export function esc(v: unknown): string {
  return String(v ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]!));
}

// JSON embedded in an inline <script> — escape `<` so hostile strings can never
// break out of the script block.
export function safeJson(v: unknown): string {
  return JSON.stringify(v).replace(/</g, '\\u003c');
}

// Escape a string for embedding inside a single-quoted JS string in an onclick
// attribute. Backslash first so the \uXXXX escapes stay literal.
export function jsStr(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/'/g, '\\u0027')
    .replace(/"/g, '\\u0022')
    .replace(/</g, '\\u003C')
    .replace(/>/g, '\\u003E')
    .replace(/&/g, '\\u0026')
    .replace(/\n/g, '\\n');
}
