import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import { PrismaClient, AdStatus, Prisma } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcrypt';
import { Pool } from 'pg';

const SOURCE = 'wordpress-marketplace';
const API =
  'https://marketplace.newzealankans.co.nz/wp-json/wp/v2/ad_post?per_page=100&_embed=1';
const HOME_FEATURED = new Set([223, 268, 276, 291, 343, 190, 298, 232]);
const CATEGORY_MAP: Array<[RegExp, string, string]> = [
  [/ad_cats-animals/, 'Animals', 'animals'],
  [/ad_cats-art-design/, 'Art & Design', 'art-design'],
  [/ad_cats-education/, 'Education', 'education'],
  [/ad_cats-electronics/, 'Electronics', 'electronics'],
  [/ad_cats-fashion-beauty/, 'Fashion & Beauty', 'fashion-beauty'],
  [/ad_cats-furniture/, 'Furniture', 'furniture'],
  [/ad_cats-games/, 'Games', 'games'],
  [/ad_cats-jobs/, 'Jobs', 'jobs'],
  [/ad_cats-real-estate/, 'Property', 'property'],
  [/ad_cats-services/, 'Services', 'services'],
  [/ad_cats-vehicles|ad_cats-cars|ad_cats-motorcycles/, 'Motor', 'motor'],
];

type WpRecord = {
  id: number;
  date_gmt?: string;
  slug: string;
  link: string;
  title: { rendered: string };
  content: { rendered: string };
  class_list?: string[];
  status: string;
};
type Extracted = {
  record: WpRecord;
  title: string;
  description: string;
  category: string;
  categorySlug: string;
  categories: string[];
  price: Prisma.Decimal | null;
  priceCurrency: string | null;
  priceLabel: string | null;
  priceType: string | null;
  location: string | null;
  images: string[];
  createdAt: Date | null;
  featured: boolean;
  issues: string[];
};

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) throw new Error('DATABASE_URL is required.');
const target = new URL(dbUrl);
const operation = process.argv[2] || '--dry-run';
if (!['--dry-run', '--apply', '--rollback', '--production-apply'].includes(operation))
  throw new Error('Use --dry-run, --apply, --rollback, or gated --production-apply.');
const localTarget = target.hostname === '127.0.0.1' && target.port === '55433' && target.pathname === '/nzk_marketplace_demo';
const productionApply = operation === '--production-apply';
const approvedProductionTarget = productionApply
  && process.env.PRISMA_IMPORT_PRODUCTION_APPROVED === 'yes'
  && process.env.PRISMA_IMPORT_PRODUCTION_BRANCH === 'br-cool-heart-adq4jews'
  && target.hostname.endsWith('.neon.tech')
  && target.pathname === '/neondb';
if (productionApply && !approvedProductionTarget)
  throw new Error('Production import requires the approved production branch ID and exact neondb Neon target.');
if (!productionApply && (!localTarget || process.env.NODE_ENV === 'production'))
  throw new Error('Staging imports are restricted to 127.0.0.1:55433/nzk_marketplace_demo.');

const prisma = new PrismaClient({
  adapter: new PrismaPg(new Pool({ connectionString: dbUrl })),
});

function decodeHtml(value: string) {
  return value
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([\da-f]+);/gi, (_, n: string) =>
      String.fromCodePoint(parseInt(n, 16)),
    )
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&rsquo;|&lsquo;/g, '’')
    .replace(/&rdquo;|&ldquo;/g, '”')
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&hellip;/g, '…')
    .replace(/&pound;/g, '£')
    .replace(/&euro;/g, '€');
}

function textFromHtml(value: string) {
  return decodeHtml(
    value.replace(/<!--[^]*?-->/g, ' ').replace(/<[^>]*>/g, ' '),
  )
    .replace(/\s+/g, ' ')
    .trim();
}

function extractGroup(html: string, id: string, nextId?: string) {
  const start = html.search(new RegExp(`id=["']${id}["']`, 'i'));
  if (start < 0) return '';
  const end = nextId
    ? html.slice(start).search(new RegExp(`id=["']${nextId}["']`, 'i'))
    : -1;
  return html.slice(start, end >= 0 ? start + end : start + 25000);
}

function parseDetail(html: string) {
  const priceMatch = html.match(
    /class=["'][^"']*\bad-price-box\b[^"']*["'][^>]*>([\s\S]{0,1800}?)<\/div>/i,
  );
  const priceLabel = priceMatch
    ? textFromHtml(priceMatch[1])
        .replace(/\bDealer\b.*$/i, '')
        .trim()
    : null;
  const locationGroup = extractGroup(html, 'adt-ad-location-box');
  const locationMatch = locationGroup.match(
    /Location:\s*([\s\S]*?)(?:Write a Review|<\/div>|<\/a>)/i,
  );
  const location = locationMatch
    ? textFromHtml(locationMatch[1]) || null
    : null;
  const gallery = extractGroup(html, 'sync1', 'sync2');
  const images = [...gallery.matchAll(/https?:[^"'\s<>]+/g)]
    .map((match) => decodeHtml(match[0]).replace(/&amp;/g, '&'))
    .filter((url) => {
      try {
        const parsed = new URL(url);
        return (
          parsed.hostname === 'marketplace.newzealankans.co.nz' &&
          parsed.pathname.startsWith('/wp-content/uploads/')
        );
      } catch {
        return false;
      }
    })
    .filter((url, index, all) => all.indexOf(url) === index);
  return { priceLabel, location, images };
}

function extract(record: WpRecord, html: string | null): Extracted {
  const classes = (record.class_list || []).filter((entry) =>
    entry.startsWith('ad_cats-'),
  );
  const mapped = CATEGORY_MAP.find(([pattern]) =>
    classes.some((entry) => pattern.test(entry)),
  );
  if (!mapped)
    throw new Error(`Source ${record.id} has no supported source category.`);
  const detail = html
    ? parseDetail(html)
    : { priceLabel: null, location: null, images: [] };
  const currency =
    (record.class_list || [])
      .map((entry) =>
        entry.match(/^ad_currency-([a-z]{3})$/i)?.[1]?.toUpperCase(),
      )
      .find(Boolean) || null;
  const amountMatch = detail.priceLabel?.match(
    /(?:^|\s)(\d[\d,]*(?:\.\d{1,2})?)(?:\s|$)/,
  );
  const amount = amountMatch
    ? new Prisma.Decimal(amountMatch[1].replace(/,/g, ''))
    : null;
  const priceType =
    /\b(negotiable|fixed price)\b/i
      .exec(detail.priceLabel || '')?.[1]
      ?.toLowerCase() || null;
  const issues: string[] = [];
  if (!html) issues.push('detail-page-unavailable');
  if (!detail.images.length) issues.push('no-authorized-gallery-image');
  if (!detail.priceLabel || /no price|price on call/i.test(detail.priceLabel))
    issues.push('price-missing');
  if (!currency) issues.push('currency-not-explicit');
  if (!detail.location) issues.push('location-missing');
  if (!priceType) issues.push('negotiation-type-not-published');
  return {
    record,
    title: textFromHtml(record.title.rendered),
    description: textFromHtml(record.content.rendered),
    category: mapped[1],
    categorySlug: mapped[2],
    categories: classes.map((entry) => entry.slice('ad_cats-'.length)),
    price: amount,
    priceCurrency: currency,
    priceLabel: detail.priceLabel,
    priceType,
    location: detail.location,
    // No individual third-party image has verified reuse permission for production.
    // The frontend renders its clearly labeled missing-image state for these demos.
    images: [],
    createdAt: record.date_gmt ? new Date(`${record.date_gmt}Z`) : null,
    featured: HOME_FEATURED.has(record.id),
    issues,
  };
}

async function getSourceRecords(): Promise<Extracted[]> {
  const response = await fetch(API, {
    headers: { 'User-Agent': 'NewZealankanzDemoImport/1.0 (read-only)' },
  });
  if (!response.ok)
    throw new Error(`WordPress public API returned HTTP ${response.status}.`);
  const body = (await response.json()) as WpRecord[];
  if (!Array.isArray(body) || body.length !== 22)
    throw new Error(
      `Expected 22 published source rows; received ${Array.isArray(body) ? body.length : 'invalid response'}.`,
    );
  const fetchRecord = async (record: WpRecord) => {
    if (record.status !== 'publish')
      throw new Error(`Source ${record.id} is not published.`);
    let html: string | null = null;
    for (let attempt = 0; attempt < 4 && !html; attempt++) {
      try {
        const page = await fetch(record.link, {
          headers: { 'User-Agent': 'NewZealankanzDemoImport/1.0 (read-only)' },
        });
        if (page.ok) html = await page.text();
        else if (page.status === 404) break;
        else if (attempt < 3)
          await new Promise((resolve) =>
            setTimeout(resolve, 350 * (attempt + 1)),
          );
      } catch {
        if (attempt < 3)
          await new Promise((resolve) =>
            setTimeout(resolve, 350 * (attempt + 1)),
          );
      }
    }
    return extract(record, html);
  };
  const records: Extracted[] = [];
  for (let start = 0; start < body.length; start += 4) {
    records.push(
      ...(await Promise.all(body.slice(start, start + 4).map(fetchRecord))),
    );
  }
  if (new Set(records.map((record) => record.record.id)).size !== 22)
    throw new Error('Duplicate source IDs in API response.');
  return records;
}

async function ensureCategory(name: string, slug: string) {
  return prisma.category.upsert({
    where: { slug },
    update: {},
    create: { name, slug },
  });
}

async function apply(records: Extracted[]) {
  const existingOwner = await prisma.user.findUnique({ where: { email: 'demo-content@system.invalid' } });
  if (existingOwner && (!existingOwner.systemAccount || existingOwner.active))
    throw new Error('Reserved demo owner email is already used by an active or non-demo account.');
  const owner = existingOwner ?? await prisma.user.create({
    data: {
      email: 'demo-content@system.invalid',
      name: 'Marketplace Demo Collection',
      password: await bcrypt.hash(randomBytes(48).toString('hex'), 12),
      active: false,
      emailVerified: false,
      systemAccount: true,
    },
  });
  const categoryIds = new Map<string, string>();
  for (const [, name, slug] of CATEGORY_MAP) {
    const category = await ensureCategory(name, slug);
    categoryIds.set(slug, category.id);
  }
  let imported = 0;
  for (const item of records) {
    const location = item.location
      ? await prisma.location.upsert({
          where: {
            slug: item.location
              .toLocaleLowerCase()
              .replace(/[^a-z0-9]+/g, '-')
              .replace(/^-|-$/g, ''),
          },
          update: {},
          create: {
            name: item.location,
            slug: item.location
              .toLocaleLowerCase()
              .replace(/[^a-z0-9]+/g, '-')
              .replace(/^-|-$/g, ''),
          },
        })
      : null;
    const attributes = {
      _sourceCategories: item.categories,
      _sourceAdType:
        item.record.class_list
          ?.find((entry) => entry.startsWith('ad_type-'))
          ?.slice(8) || null,
      _sourceDate: item.record.date_gmt || null,
    } as Prisma.InputJsonValue;
    const key = {
      sourceSystem_sourceRecordId: {
        sourceSystem: SOURCE,
        sourceRecordId: String(item.record.id),
      },
    };
    const existingSourceAd = await prisma.ad.findUnique({ where: key, select: { id: true, demoContent: true } });
    if (existingSourceAd && !existingSourceAd.demoContent)
      throw new Error(`Source ID ${item.record.id} collides with a non-demo production listing.`);
    const ad = await prisma.ad.upsert({
      where: key,
      update: {
        title: item.title,
        description: item.description,
        categoryId: categoryIds.get(item.categorySlug)!,
        locationId: location?.id ?? null,
        price: item.price,
        priceCurrency: item.priceCurrency,
        priceLabel: item.priceLabel,
        priceType: item.priceType,
        status: AdStatus.APPROVED,
        featured: item.featured,
        demoContent: true,
        sourceUrl: item.record.link,
        attributes,
        ...(item.createdAt ? { createdAt: item.createdAt } : {}),
      },
      create: {
        title: item.title,
        slug: `${item.record.slug}-demo`,
        description: item.description,
        categoryId: categoryIds.get(item.categorySlug)!,
        locationId: location?.id ?? null,
        price: item.price,
        priceCurrency: item.priceCurrency,
        priceLabel: item.priceLabel,
        priceType: item.priceType,
        status: AdStatus.APPROVED,
        featured: item.featured,
        demoContent: true,
        sourceSystem: SOURCE,
        sourceRecordId: String(item.record.id),
        sourceUrl: item.record.link,
        userId: owner.id,
        attributes,
        ...(item.createdAt ? { createdAt: item.createdAt } : {}),
      },
    });
    await prisma.adImage.deleteMany({ where: { adId: ad.id } });
    if (item.images.length) {
      await prisma.adImage.createMany({
        data: item.images.map((url, sortOrder) => ({
          adId: ad.id,
          url,
          sortOrder,
          filename:
            url.split('/').pop() || `source-${item.record.id}-${sortOrder}`,
          mimetype: null,
          size: null,
        })),
      });
    }
    imported++;
  }
  return imported;
}

async function rollback() {
  return prisma.$transaction(async (tx) => {
    const count = await tx.ad.count({
      where: { sourceSystem: SOURCE, demoContent: true },
    });
    await tx.ad.deleteMany({
      where: { sourceSystem: SOURCE, demoContent: true },
    });
    await tx.user.deleteMany({
      where: { email: 'demo-content@system.invalid', systemAccount: true },
    });
    return count;
  });
}

async function main() {
  if (operation === '--rollback') {
    console.log(
      `Rollback removed ${await rollback()} source-controlled demo listings.`,
    );
    return;
  }
  const items = await getSourceRecords();
  const alreadyImported = await prisma.ad.count({
    where: { sourceSystem: SOURCE, demoContent: true },
  });
  if (productionApply) {
    const sourceRows = await prisma.ad.count({ where: { sourceSystem: SOURCE } });
    if (sourceRows !== alreadyImported || (alreadyImported !== 0 && alreadyImported !== 22))
      throw new Error(`Found ${sourceRows} source-keyed rows and ${alreadyImported} demos; expected none or exactly 22 verified demo listings.`);
  }
  console.log(
    JSON.stringify(
      {
        mode: operation,
        target: `${target.hostname}:${target.port}${target.pathname}`,
        sourceRecords: items.length,
        alreadyImported,
        planned: operation === '--dry-run' ? 'no writes' : 'idempotent upsert',
        summary: {
          featured: items.filter((item) => item.featured).length,
          withImages: items.filter((item) => item.images.length).length,
          withoutImages: items.filter((item) => !item.images.length).length,
          missingLocation: items.filter((item) => !item.location).length,
          missingCurrency: items.filter((item) => !item.priceCurrency).length,
        },
        records: items.map((item) => ({
          id: item.record.id,
          slug: item.record.slug,
          title: item.title,
          category: item.category,
          images: item.images.length,
          price: item.priceLabel,
          currency: item.priceCurrency,
          location: item.location,
          issues: item.issues,
        })),
      },
      null,
      2,
    ),
  );
  if (operation === '--apply')
    console.log(`Imported/updated ${await apply(items)} demo records.`);
}

main()
  .catch((error: unknown) => {
    console.error(
      error instanceof Error ? error.message : 'Demo import failed.',
    );
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
