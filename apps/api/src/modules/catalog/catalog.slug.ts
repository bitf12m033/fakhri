import { slugify } from '@fakhri/shared';
import { invalid } from './catalog.errors';

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Use an explicit slug, or derive one from the display name. */
export function requireSlug(name: string, explicit?: string): string {
  const slug = explicit?.trim() || slugify(name);
  if (!slug || !SLUG.test(slug) || slug.length > 80) {
    throw invalid('Slug must be lowercase letters, numbers, and hyphens');
  }
  return slug;
}
