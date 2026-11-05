import { parseWordPressDemoManifest } from './wordpress-demo-manifest';

type TestRecord = {
  source_id: number;
  slug: string;
  title: string;
  description_text: string;
  source_url: string;
  price_original: string | null;
  currency_symbol: string | null;
  price_type: string;
  location: string | null;
  categories: Array<{ taxonomy: string; name: string; slug: string }>;
  published_date: string;
  featured: boolean;
  demo: boolean;
  seller_contact_enabled: boolean;
  image_urls: string[];
};

function manifest() {
  const records: TestRecord[] = Array.from({ length: 22 }, (_, index) => ({
    source_id: 1000 + index,
    slug: `sample-${index}`,
    title: `Sample listing ${index}`,
    description_text: 'Public listing description.',
    source_url: `https://marketplace.newzealankans.co.nz/ad/sample-${index}/`,
    price_original: '1250',
    currency_symbol: '$',
    price_type: 'Fixed',
    location: 'Colombo',
    categories: [
      { taxonomy: 'ad_cats', name: 'Electronics', slug: 'electronics' },
      { taxonomy: 'ad_currency', name: '$', slug: 'usd' },
    ],
    published_date: '2026-10-30T10:00:00Z',
    featured: false,
    demo: true,
    seller_contact_enabled: false,
    image_urls: [
      'https://marketplace.newzealankans.co.nz/wp-content/uploads/example.jpg',
    ],
  }));
  return {
    record_count: 22,
    scope: 'published ad_post records only',
    records,
  };
}

describe('parseWordPressDemoManifest', () => {
  it('validates source rows and keeps unverified media out of imported images', () => {
    const result = parseWordPressDemoManifest(manifest());
    expect(result).toHaveLength(22);
    expect(result[0]).toMatchObject({
      sourceId: 1000,
      categoryName: 'Electronics',
      categorySlug: 'electronics',
      price: '1250',
      priceCurrency: 'USD',
      currencySymbol: '$',
      images: [],
      imageReferenceCount: 1,
    });
  });

  it('does not assign a currency when the source has no currency term', () => {
    const input = manifest();
    input.records[0].currency_symbol = null;
    input.records[0].categories = [
      { taxonomy: 'ad_cats', name: 'Games', slug: 'games' },
    ];
    const [record] = parseWordPressDemoManifest(input);
    expect(record.priceCurrency).toBeNull();
    expect(record.price).toBe('1250');
    expect(record.priceLabel).toBeNull();
    expect(record.categoryName).toBe('Games');
  });

  it('preserves explicit no-price price types without creating a numeric price', () => {
    const input = manifest();
    input.records[0].price_original = null;
    input.records[0].price_type = 'no_price';
    const [record] = parseWordPressDemoManifest(input);
    expect(record.price).toBeNull();
    expect(record.priceType).toBe('no_price');
    expect(record.priceLabel).toBe('No Price');
  });

  it('rejects a record that enables seller contact', () => {
    const input = manifest();
    input.records[0].seller_contact_enabled = true;
    expect(() => parseWordPressDemoManifest(input)).toThrow(
      /demo\/contact safeguards/,
    );
  });

  it('rejects duplicate source IDs instead of allowing duplicate imports', () => {
    const input = manifest();
    input.records[1].source_id = input.records[0].source_id;
    expect(() => parseWordPressDemoManifest(input)).toThrow(
      /Duplicate WordPress source ID/,
    );
  });
});
