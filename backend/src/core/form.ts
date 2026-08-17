// Safe accessors for multipart fields parsed by Hono (values may be string,
// File, arrays, or absent). Avoids unchecked `as string` / `as File` casts.

export type ParsedForm = Record<string, string | File | File[] | undefined>;

export function strField(form: ParsedForm, name: string): string | undefined {
  const v = form[name];
  return typeof v === 'string' ? v : undefined;
}

export function fileField(form: ParsedForm, name: string): File | undefined {
  const v = form[name];
  return v instanceof File ? v : undefined;
}
