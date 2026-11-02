import 'dotenv/config';
import { AdStatus, BannerPlacement, NotificationType, PrismaClient, UserRole } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcrypt';
import { Pool } from 'pg';
import { getDatabaseUrl } from '../src/prisma/database-url';

const connectionString = getDatabaseUrl();
const database = new URL(connectionString);
const demoDatabaseHost = process.env.DEMO_DATABASE_HOST;

if (
  process.env.NODE_ENV !== 'demo' ||
  process.env.DEMO_SEED_ENABLED !== '1' ||
  !demoDatabaseHost ||
  database.hostname !== demoDatabaseHost ||
  database.pathname !== '/nzk_demo'
) {
  throw new Error(
    'Demo seed requires NODE_ENV=demo, DEMO_SEED_ENABLED=1, and local database nzk_demo.',
  );
}

const accounts = {
  admin: {
    email: process.env.DEMO_ADMIN_EMAIL,
    password: process.env.DEMO_ADMIN_PASSWORD,
    name: 'Demo Administrator',
    role: UserRole.ADMIN,
  },
  seller: {
    email: process.env.DEMO_SELLER_EMAIL,
    password: process.env.DEMO_SELLER_PASSWORD,
    name: 'Aroha Ngata',
    role: UserRole.USER,
  },
  buyer: {
    email: process.env.DEMO_BUYER_EMAIL,
    password: process.env.DEMO_BUYER_PASSWORD,
    name: 'Theo Morgan',
    role: UserRole.USER,
  },
} as const;

for (const account of Object.values(accounts)) {
  if (!account.email || !account.password || account.password.length < 12) {
    throw new Error('Demo account emails and passwords of 12+ characters are required.');
  }
}

const prisma = new PrismaClient({
  adapter: new PrismaPg(new Pool({ connectionString })),
});

async function ensureUser(account: (typeof accounts)[keyof typeof accounts]) {
  const password = await bcrypt.hash(account.password!, 12);
  return prisma.user.upsert({
    where: { email: account.email! },
    update: {
      name: account.name,
      password,
      role: account.role,
      active: true,
      emailVerified: true,
      sessionVersion: { increment: 1 },
    },
    create: {
      email: account.email!,
      name: account.name,
      password,
      role: account.role,
      active: true,
      emailVerified: true,
    },
  });
}

async function ensureCategory(name: string, slug: string, parentId?: string) {
  return prisma.category.upsert({
    where: { slug },
    update: { name, parentId },
    create: { name, slug, parentId },
  });
}

async function main() {
  const admin = await ensureUser(accounts.admin);
  const seller = await ensureUser(accounts.seller);
  const buyer = await ensureUser(accounts.buyer);

  const property = await ensureCategory('Property', 'property');
  const sale = await ensureCategory('For sale', 'for-sale', property.id);
  const rent = await ensureCategory('Rentals', 'rentals', property.id);
  const flatmates = await ensureCategory('Flatmates', 'flatmates', property.id);
  const motor = await ensureCategory('Motor', 'motor');
  const cars = await ensureCategory('Cars', 'cars', motor.id);
  const jobs = await ensureCategory('Jobs', 'jobs');
  const services = await ensureCategory('Services', 'services');
  const locations = new Map<string, string>();
  for (const name of ['Auckland', 'Wellington', 'Christchurch', 'Dunedin', 'Queenstown']) {
    const slug = name.toLowerCase().replaceAll(' ', '-');
    const location = await prisma.location.upsert({
      where: { slug },
      update: { name },
      create: { name, slug },
    });
    locations.set(name, location.id);
  }

  const listings = [
    { slug: 'demo-auckland-family-home', title: 'Sunlit Auckland family home', description: 'A welcoming three-bedroom home near parks, schools and local shops, with a sunny deck and off-street parking.', price: 985000, categoryId: sale.id, city: 'Auckland', image: 'photo-1600585154340-be6161a56a0c', status: AdStatus.APPROVED, featured: true },
    { slug: 'demo-wellington-flat', title: 'Central Wellington apartment', description: 'Modern two-bedroom apartment close to the waterfront, cafés and public transport. Available for a long-term tenancy.', price: 680, categoryId: rent.id, city: 'Wellington', image: 'photo-1522708323590-d24dbb6b0267', status: AdStatus.APPROVED, featured: true },
    { slug: 'demo-christchurch-hybrid', title: '2019 hybrid hatchback', description: 'Reliable, economical hybrid with service history, reversing camera and fresh WOF. Viewing in Christchurch by arrangement.', price: 17950, categoryId: cars.id, city: 'Christchurch', image: 'photo-1492144534655-ae79c964c9d7', status: AdStatus.APPROVED, featured: true },
    { slug: 'demo-dunedin-room', title: 'Sunny room near Dunedin campus', description: 'Furnished room in a friendly shared home, with fibre internet and a short walk to campus and the gardens.', price: 245, categoryId: flatmates.id, city: 'Dunedin', image: 'photo-1522771739844-6a9f6d5f14af', status: AdStatus.APPROVED, featured: false },
    { slug: 'demo-queenstown-role', title: 'Guest experience coordinator', description: 'A local Queenstown hospitality team is looking for a warm, organised coordinator for a permanent full-time role.', price: null, categoryId: jobs.id, city: 'Queenstown', image: 'photo-1497366754035-f200968a6e72', status: AdStatus.APPROVED, featured: false },
    { slug: 'demo-auckland-trades', title: 'Local home maintenance and repairs', description: 'Qualified local team offering small repairs, painting and seasonal home maintenance across central Auckland.', price: 85, categoryId: services.id, city: 'Auckland', image: 'photo-1621905251189-08b45d6a269e', status: AdStatus.APPROVED, featured: false },
    { slug: 'demo-seller-pending', title: 'Demo seller listing awaiting review', description: 'A fictional listing in the pending queue for administrator moderation demonstrations.', price: 1200, categoryId: cars.id, city: 'Wellington', image: 'photo-1503376780353-7e6692767b70', status: AdStatus.PENDING, featured: false },
  ];

  for (const listing of listings) {
    const { city, image: imageId, ...listingData } = listing;
    const image = `https://images.unsplash.com/${imageId}?auto=format&fit=crop&w=1200&q=82`;
    await prisma.ad.upsert({
      where: { slug: listingData.slug },
      create: {
        ...listingData,
        contactName: seller.name,
        contactEmail: seller.email,
        contactPhone: '021 555 0184',
        userId: seller.id,
        locationId: locations.get(city)!,
        images: { create: [{ url: image, filename: `${listing.slug}.jpg`, mimetype: 'image/jpeg', size: 90000 }] },
      },
      update: {
        title: listingData.title,
        description: listingData.description,
        price: listingData.price,
        status: listingData.status,
        featured: listingData.featured,
        userId: seller.id,
        categoryId: listingData.categoryId,
        locationId: locations.get(city)!,
        contactName: seller.name,
        contactEmail: seller.email,
        images: {
          deleteMany: {},
          create: [{ url: image, filename: `${listing.slug}.jpg`, mimetype: 'image/jpeg', size: 90000 }],
        },
      },
    });
  }

  for (const banner of [
    { title: 'Demo — Find your next home', sponsor: 'Harbour Homes', placement: BannerPlacement.HOME, imageUrl: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1400&q=82', linkUrl: '/category/property' },
    { title: 'Demo — Drive local', sponsor: 'Southern Motoring', placement: BannerPlacement.SIDEBAR, imageUrl: 'https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?auto=format&fit=crop&w=1000&q=82', linkUrl: '/category/motor' },
  ]) {
    const existing = await prisma.banner.findFirst({ where: { title: banner.title } });
    if (existing) await prisma.banner.update({ where: { id: existing.id }, data: { ...banner, active: true } });
    else await prisma.banner.create({ data: { ...banner, active: true } });
  }

  const featuredAd = await prisma.ad.findUniqueOrThrow({ where: { slug: 'demo-auckland-family-home' } });
  await prisma.watchlist.upsert({
    where: { userId_adId: { userId: buyer.id, adId: featuredAd.id } },
    update: {},
    create: { userId: buyer.id, adId: featuredAd.id },
  });
  const enquiry = await prisma.contactSubmission.findFirst({
    where: { adId: featuredAd.id, email: buyer.email, subject: 'Demo buyer enquiry' },
  });
  if (!enquiry) {
    await prisma.contactSubmission.create({
      data: { adId: featuredAd.id, name: buyer.name!, email: buyer.email, subject: 'Demo buyer enquiry', message: 'Hello, is a viewing available this weekend?' },
    });
  }
  const notification = await prisma.notification.findFirst({
    where: { userId: seller.id, title: 'Demo enquiry received' },
  });
  if (!notification) {
    await prisma.notification.create({
      data: { userId: seller.id, type: NotificationType.AD_SUBMITTED, title: 'Demo enquiry received', message: 'A buyer asked about the Auckland family home.' },
    });
  }

  console.log(`Demo data is ready in ${database.pathname}; no production data was touched.`);
  console.log(`Demo administrator account: ${admin.email}`);
}

main()
  .finally(async () => prisma.$disconnect())
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'Demo seed failed.');
    process.exitCode = 1;
  });
