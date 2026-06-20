import { getPagination, paginated } from './pagination';
import { toSlug } from './slug';

describe('common helpers', () => {
  it('creates SEO-friendly slugs', () => {
    expect(toSlug('Napier/Hastings Listings')).toBe('napierhastings-listings');
  });

  it('normalizes pagination metadata', () => {
    const pagination = getPagination({ page: 0, limit: 500 });
    expect(pagination).toEqual({ page: 1, limit: 100, skip: 0, take: 100 });
    expect(
      paginated(['item'], 1, pagination.page, pagination.limit).meta.pages,
    ).toBe(1);
  });
});
