/** Deterministic slug generation for SEO-friendly URLs (FR-14). */
export function slugify(input: string, { maxLength = 60 }: { maxLength?: number } = {}): string {
  return input
    .toString()
    .toLowerCase()
    .trim()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, maxLength)
    .replace(/-+$/g, '');
}