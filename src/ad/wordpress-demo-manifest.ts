export type WordPressCategoryTerm = {
  taxonomy: string;
  name: string;
  slug: string;
};

export type WordPressDemoRecord = {
  sourceId: number;
  slug: string;
  title: string;
  description: string;
  sourceUrl: string;
  price: string | null;
  priceCurrency: string | null;
  currencySymbol: string | null;
  priceLabel: string | null;
  priceType: string;
  location: string | null;
  categories: WordPressCategoryTerm[];
  categoryName: string;
  categorySlug: string;
  publishedAt: Date | null;
  featured: boolean;
  imageReferenceCount: number;
  images: [];
};

const categoryMappings: Array<{
  terms: string[];
  name: string;
  slug: string;
}> = [
  { terms: ['animals'], name: 'Animals', slug: 'animals' },
  { terms: ['art-design'], name: 'Art & Design', slug: 'art-design' },
  { terms: ['education'], name: 'Education', slug: 'education' },
  { terms: ['electronics'], name: 'Electronics', slug: 'electronics' },
  {
    terms: ['fashion-beauty'],
    name: 'Fashion & Beauty',
    slug: 'fashion-beauty',
  },
  { terms: ['furniture'], name: 'Furniture', slug: 'furniture' },
  { terms: ['games'], name: 'Games', slug: 'games' },
  { terms: ['jobs'], name: 'Jobs', slug: 'jobs' },
  { terms: ['real-estate'], name: 'Property', slug: 'property' },
  { terms: ['services'], name: 'Services', slug: 'services' },
  { terms: ['vehicles', 'cars', 'motorcycles'], name: 'Motor', slug: 'motor' },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseCategories(value: unknown, sourceId: number) {
  if (!Array.isArray(value))
    throw new Error(`Source ${sourceId}: categories are missing.`);
  const categories = value.map((term) => {
    if (!isRecord(term))
      throw new Error(`Source ${sourceId}: invalid category term.`);
    const { taxonomy, name, slug } = term;
    if (
      typeof taxonomy !== 'string' ||
      typeof name !== 'string' ||
      typeof slug !== 'string'
    )
      throw new Error(`Source ${sourceId}: invalid category fields.`);
    return { taxonomy, name, slug };
  });
  if (!categories.some((term) => term.taxonomy === 'ad_cats'))
    throw new Error(`Source ${sourceId}: no ad category is present.`);
  return categories;
}

function mapCategory(categories: WordPressCategoryTerm[], sourceId: number) {
  const slugs = new Set(
    categories
      .filter((term) => term.taxonomy === 'ad_cats')
      .map((term) => term.slug),
  );
  const mapped = categoryMappings.find((mapping) =>
    mapping.terms.some((term) => slugs.has(term)),
  );
  if (!mapped)
    throw new Error(`Source ${sourceId}: category is not supported.`);
  return { name: mapped.name, slug: mapped.slug };
}

function parsePriceCurrency(
  categories: WordPressCategoryTerm[],
  symbol: unknown,
  sourceId: number,
) {
  if (symbol !== null && typeof symbol !== 'string')
    throw new Error(`Source ${sourceId}: invalid currency symbol.`);
  const terms = categories.filter((term) => term.taxonomy === 'ad_currency');
  if (symbol === null) {
    if (terms.length)
      throw new Error(`Source ${sourceId}: currency term has no symbol.`);
    return { symbol: null, code: null };
  }
  if (
    terms.length !== 1 ||
    terms[0].name !== symbol ||
    !/^[a-z]{3}$/i.test(terms[0].slug)
  )
    throw new Error(
      `Source ${sourceId}: currency symbol has no matching source currency term.`,
    );
  return { symbol, code: terms[0].slug.toUpperCase() };
}

export function parseWordPressDemoManifest(
  value: unknown,
): WordPressDemoRecord[] {
  if (!isRecord(value) || !Array.isArray(value.records))
    throw new Error('WordPress demo manifest must contain a records array.');
  if (value.record_count !== 22 || value.records.length !== 22)
    throw new Error(
      `Expected 22 published records; received ${value.records.length}.`,
    );
  if (
    typeof value.scope !== 'string' ||
    !/published ad_post records only/i.test(value.scope)
  )
    throw new Error(
      'Manifest scope must be restricted to published ad_post records.',
    );

  const seenIds = new Set<number>();
  const seenSlugs = new Set<string>();
  const output = value.records.map((valueRecord) => {
    if (!isRecord(valueRecord))
      throw new Error('Manifest contains an invalid record.');
    const row = valueRecord;
    const sourceId = row.source_id;
    if (!Number.isSafeInteger(sourceId) || Number(sourceId) <= 0)
      throw new Error('Manifest contains an invalid WordPress source ID.');
    const id = Number(sourceId);
    if (seenIds.has(id))
      throw new Error(`Duplicate WordPress source ID ${id}.`);
    seenIds.add(id);

    const slug = row.slug;
    const title = row.title;
    const description = row.description_text;
    const sourceUrl = row.source_url;
    const location = row.location;
    const priceType = row.price_type;
    const priceOriginal = row.price_original;
    const featured = row.featured;
    if (
      typeof slug !== 'string' ||
      !slug ||
      typeof title !== 'string' ||
      !title.trim() ||
      typeof description !== 'string' ||
      typeof sourceUrl !== 'string' ||
      (location !== null && typeof location !== 'string') ||
      typeof priceType !== 'string' ||
      !priceType ||
      (priceOriginal !== null &&
        (typeof priceOriginal !== 'string' ||
          !/^\d+(?:\.\d+)?$/.test(priceOriginal))) ||
      typeof featured !== 'boolean'
    )
      throw new Error(`Source ${id}: required source fields are invalid.`);
    if (seenSlugs.has(slug))
      throw new Error(`Duplicate WordPress slug ${slug}.`);
    seenSlugs.add(slug);
    if (row.demo !== true || row.seller_contact_enabled !== false)
      throw new Error(`Source ${id}: demo/contact safeguards are not set.`);
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(sourceUrl);
    } catch {
      throw new Error(`Source ${id}: invalid source URL.`);
    }
    if (
      parsedUrl.protocol !== 'https:' ||
      parsedUrl.hostname !== 'marketplace.newzealankans.co.nz' ||
      !parsedUrl.pathname.includes(`/ad/${slug}/`)
    )
      throw new Error(`Source ${id}: source URL does not match its slug.`);

    const categories = parseCategories(row.categories, id);
    const mapped = mapCategory(categories, id);
    const currency = parsePriceCurrency(categories, row.currency_symbol, id);
    const publishedAt =
      typeof row.published_date === 'string' && row.published_date
        ? new Date(row.published_date)
        : null;
    if (publishedAt && Number.isNaN(publishedAt.getTime()))
      throw new Error(`Source ${id}: invalid published date.`);
    const imageUrls = row.image_urls;
    if (
      !Array.isArray(imageUrls) ||
      imageUrls.some((url) => typeof url !== 'string')
    )
      throw new Error(`Source ${id}: media references are invalid.`);

    return {
      sourceId: id,
      slug,
      title: title.trim(),
      description: description.trim(),
      sourceUrl,
      price: priceOriginal,
      priceCurrency: currency.code,
      currencySymbol: currency.symbol,
      priceLabel:
        priceOriginal === null
          ? priceType === 'no_price'
            ? 'No Price'
            : priceType === 'on_call'
              ? 'Price On Call'
              : null
          : null,
      priceType,
      location:
        typeof location === 'string' && location.trim()
          ? location.trim()
          : null,
      categories,
      categoryName: mapped.name,
      categorySlug: mapped.slug,
      publishedAt,
      featured,
      // URLs are references only. No image reuse permission was verified.
      imageReferenceCount: imageUrls.length,
      images: [] as [],
    };
  });
  return output;
}
