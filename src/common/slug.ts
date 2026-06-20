import slugify from 'slugify';

export function toSlug(value: string) {
  return slugify(value, { lower: true, strict: true, trim: true });
}
