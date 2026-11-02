import { randomBytes } from 'node:crypto';
import { chmod, unlink, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { PrismaClient, AdStatus, UserRole } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import bcrypt from 'bcrypt';
import { Pool } from 'pg';

const databaseUrl = process.env.DATABASE_URL || '';
const target = new URL(databaseUrl);
if (
  !['127.0.0.1', 'localhost', '::1'].includes(target.hostname) ||
  target.port !== '5544' ||
  target.pathname !== '/nzk_test'
) {
  throw new Error('QA fixtures require only local nzk_test on 127.0.0.1:5544.');
}

const [command, runId] = process.argv.slice(2);
if (!['seed', 'cleanup'].includes(command) || !/^qa[0-9a-z-]{8,28}$/.test(runId || '')) {
  throw new Error('Usage: qa-fixtures.mjs seed|cleanup qaYYYYMMDD-xxxxxx');
}

const pool = new Pool({ connectionString: databaseUrl });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
const prefix = `nzk-${runId}-`;
const credentialsPath = `/private/tmp/${prefix}credentials.json`;

async function cleanup() {
  const fixtureAds = await prisma.ad.findMany({
    where: { slug: { startsWith: prefix } },
    select: { id: true },
  });
  const adIds = fixtureAds.map(({ id }) => id);
  const filenames = await prisma.adImage.findMany({
    where: { adId: { in: adIds } },
    select: { filename: true },
  });
  const fixtureUsers = await prisma.user.findMany({
    where: { email: { in: [`seller.${runId}@example.test`, `buyer.${runId}@example.test`, `admin.${runId}@example.test`] } },
    select: { id: true },
  });
  const userIds = fixtureUsers.map(({ id }) => id);
  await prisma.contactSubmission.deleteMany({ where: { adId: { in: adIds } } });
  await prisma.watchlist.deleteMany({ where: { OR: [{ adId: { in: adIds } }, { userId: { in: userIds } }] } });
  await prisma.savedSearch.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.ad.deleteMany({ where: { id: { in: adIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  for (const { filename } of filenames) {
    if (filename && basename(filename) === filename) {
      await unlink(join(process.cwd(), 'uploads/ads', filename)).catch(() => undefined);
    }
  }
  await unlink(credentialsPath).catch(() => undefined);
  console.log(`Removed ${adIds.length} ads and ${userIds.length} QA accounts for ${runId}.`);
}

async function seed() {
  const existing = await prisma.ad.count({ where: { slug: { startsWith: prefix } } });
  if (existing) throw new Error(`Fixtures already exist for ${runId}; cleanup first or choose a new run id.`);

  const password = randomBytes(18).toString('base64url');
  const passwordHash = await bcrypt.hash(password, 12);
  const accounts = await Promise.all([
    prisma.user.create({ data: { email: `seller.${runId}@example.test`, name: 'Aroha Ngata (QA)', password: passwordHash, role: UserRole.USER, active: true, emailVerified: true } }),
    prisma.user.create({ data: { email: `buyer.${runId}@example.test`, name: 'Theo Morgan (QA)', password: passwordHash, role: UserRole.USER, active: true, emailVerified: true } }),
    prisma.user.create({ data: { email: `admin.${runId}@example.test`, name: 'Marketplace Admin (QA)', password: passwordHash, role: UserRole.ADMIN, active: true, emailVerified: true } }),
  ]);
  const [seller, buyer, admin] = accounts;
  const categorySlugs = ['motor', 'cars', 'sale', 'phones', 'full-time', 'furniture', 'trades'];
  const locationSlugs = ['christchurch', 'auckland', 'wellington', 'hamilton', 'dunedin', 'tauranga'];
  const categories = await prisma.category.findMany({ where: { slug: { in: categorySlugs } } });
  const locations = await prisma.location.findMany({ where: { slug: { in: locationSlugs } } });
  const categoryBySlug = new Map(categories.map((row) => [row.slug, row.id]));
  const locationBySlug = new Map(locations.map((row) => [row.slug, row.id]));
  for (const slug of categorySlugs) if (!categoryBySlug.has(slug)) throw new Error(`Required category missing: ${slug}`);
  for (const slug of locationSlugs) if (!locationBySlug.has(slug)) throw new Error(`Required location missing: ${slug}`);

  const art = (label, background) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="960" height="600" viewBox="0 0 960 600"><rect width="960" height="600" fill="${background}"/><path d="M0 450 Q300 300 600 450 T1200 450V600H0Z" fill="#d0b36a" opacity=".72"/><text x="54" y="110" font-family="Arial,sans-serif" font-size="30" fill="#fff">NewZealankanz · QA</text><text x="54" y="520" font-family="Arial,sans-serif" font-size="44" font-weight="700" fill="#fff">${label}</text></svg>`)}`;
  const fixtures = [
    { key: 'motor', title: '2022 Toyota Aqua Hybrid', description: 'Well cared for hybrid hatchback with service records, reversing camera and a recent WOF. Viewing in Christchurch by arrangement.', price: 16990, category: 'cars', location: 'christchurch', status: AdStatus.APPROVED, featured: true, attributes: { make: 'Toyota', model: 'Aqua', year: 2022, mileage: 38500, condition: 'Used', transmission: 'Automatic', fuel: 'Hybrid', bodyType: 'Hatchback' }, color: '#344f46' },
    { key: 'property', title: 'Sunny three-bedroom Auckland home', description: 'Warm family home close to local schools, parks and transport, with a sunny deck and off-street parking.', price: 895000, category: 'sale', location: 'auckland', status: AdStatus.APPROVED, featured: true, attributes: { listingType: 'Sale', propertyType: 'House', bedrooms: 3, bathrooms: 2, floorArea: 155, landArea: 480 }, color: '#526c58' },
    { key: 'electronics', title: 'iPhone 14 Pro 256GB', description: 'Unlocked device in tidy condition, includes original box and charging cable. Meet in Wellington CBD.', price: 820, category: 'phones', location: 'wellington', status: AdStatus.APPROVED, featured: false, attributes: { brand: 'Apple', model: 'iPhone 14 Pro', condition: 'Used', storage: '256GB', specifications: 'Unlocked, space black' }, color: '#554d63' },
    { key: 'job', title: 'Customer experience coordinator', description: 'Friendly local team seeking a full-time coordinator. Hybrid work arrangement and professional development support.', price: null, category: 'full-time', location: 'hamilton', status: AdStatus.PENDING, featured: false, attributes: { employmentType: 'Full-time', salaryMin: 62000, salaryMax: 74000, experience: '1–3 years', workArrangement: 'Hybrid' }, color: '#4e6673' },
    { key: 'home', title: 'Solid rimu dining table and six chairs', description: 'Well maintained timber dining set with a few age marks. Collection from Dunedin; help loading available.', price: 680, category: 'furniture', location: 'dunedin', status: AdStatus.APPROVED, featured: false, attributes: { condition: 'Used', material: 'Rimu', brand: 'New Zealand made' }, color: '#6a5745' },
    { key: 'service', title: 'Qualified home maintenance and repairs', description: 'Local registered team for small repairs, painting and seasonal maintenance around Tauranga. Free written quotes.', price: 85, category: 'trades', location: 'tauranga', status: AdStatus.REJECTED, featured: false, rejectionReason: 'QA-only rejected listing to verify moderation states.', attributes: { serviceType: 'Home maintenance', availability: 'Weekdays' }, color: '#415b51' },
  ];

  const created = [];
  for (const item of fixtures) {
    const ad = await prisma.ad.create({
      data: {
        title: item.title,
        slug: `${prefix}${item.key}`,
        description: item.description,
        price: item.price,
        categoryId: categoryBySlug.get(item.category),
        locationId: locationBySlug.get(item.location),
        status: item.status,
        featured: item.featured,
        attributes: item.attributes,
        rejectionReason: item.rejectionReason,
        userId: seller.id,
        contactName: seller.name,
        contactEmail: seller.email,
        contactPhone: '021 555 0198',
        images: { create: [{ url: art(item.key, item.color), filename: `${prefix}${item.key}.svg`, mimetype: 'image/svg+xml', size: 1 }] },
      },
      select: { id: true, slug: true, status: true },
    });
    created.push(ad);
  }
  const carMakes = [
    ['Honda', 'Fit'], ['Mazda', 'Demio'], ['Suzuki', 'Swift'], ['Toyota', 'Corolla'],
    ['Nissan', 'Leaf'], ['Kia', 'Niro'], ['Hyundai', 'Ioniq'], ['Subaru', 'Impreza'],
    ['Mitsubishi', 'Outlander'], ['Honda', 'Grace'], ['Mazda', 'Axela'], ['Suzuki', 'Vitara'],
  ];
  for (const [index, [make, model]] of carMakes.entries()) {
    const slug = `${prefix}car-${String(index + 1).padStart(2, '0')}`;
    const locationSlug = locationSlugs[index % locationSlugs.length];
    const ad = await prisma.ad.create({
      data: {
        title: `${2017 + (index % 8)} ${make} ${model} · QA listing ${index + 1}`,
        slug,
        description: `Fictional New Zealand ${make} ${model} listing for local search, price sorting and pagination QA. Service history available; viewing in ${locationSlug}.`,
        price: 8500 + index * 1250,
        categoryId: categoryBySlug.get('cars'),
        locationId: locationBySlug.get(locationSlug),
        status: AdStatus.APPROVED,
        featured: false,
        attributes: { make, model, year: 2017 + (index % 8), mileage: 25000 + index * 8400, condition: 'Used', transmission: index % 2 ? 'Manual' : 'Automatic', fuel: index % 3 ? 'Petrol' : 'Hybrid', bodyType: index % 2 ? 'Hatchback' : 'SUV' },
        userId: seller.id,
        contactName: seller.name,
        contactEmail: seller.email,
        contactPhone: '021 555 0198',
        createdAt: new Date(Date.now() - index * 86_400_000),
        images: { create: [{ url: art(`${make} ${model}`, '#344f46'), filename: `${slug}.svg`, mimetype: 'image/svg+xml', size: 1 }] },
      },
      select: { id: true, slug: true, status: true },
    });
    created.push(ad);
  }
  const motor = created.find((ad) => ad.slug.endsWith('motor'));
  await prisma.watchlist.create({ data: { userId: buyer.id, adId: motor.id } });
  await prisma.savedSearch.create({ data: { userId: buyer.id, name: 'Toyota hybrids in Christchurch', query: { category: 'motor', location: 'christchurch', attributes: JSON.stringify({ make: 'Toyota', fuel: 'Hybrid' }) } } });

  const credentialData = {
    baseUrl: 'http://127.0.0.1:5191',
    runId,
    password,
    accounts: {
      seller: { email: seller.email, userId: seller.id },
      buyer: { email: buyer.email, userId: buyer.id },
      admin: { email: admin.email, userId: admin.id },
    },
    references: {
      motorCategoryId: categoryBySlug.get('motor'),
      carCategoryId: categoryBySlug.get('cars'),
      christchurchLocationId: locationBySlug.get('christchurch'),
    },
    listings: created,
  };
  await writeFile(credentialsPath, JSON.stringify(credentialData, null, 2), { mode: 0o600 });
  await chmod(credentialsPath, 0o600);
  console.log(`Created ${created.length} fictional listings and three local-only accounts for ${runId}.`);
  console.log(`Private local test credentials: ${credentialsPath}`);
}

try {
  if (command === 'cleanup') await cleanup();
  else await seed();
} finally {
  await prisma.$disconnect();
  await pool.end();
}
