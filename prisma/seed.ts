import 'dotenv/config';
import { PrismaClient, UserRole, AdStatus, BannerPlacement, NotificationType } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as bcrypt from 'bcrypt';
import slugify from 'slugify';

const connectionString = process.env.DATABASE_URL;
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const toSlug = (value: string) =>
  slugify(value, { lower: true, strict: true, trim: true });

async function upsertCategory(name: string, parentId?: string) {
  const slug = toSlug(parentId ? `${name}` : name);
  return prisma.category.upsert({
    where: { slug },
    update: { name, parentId },
    create: { name, slug, parentId },
  });
}

async function main() {
  const adminEmail = process.env.DEFAULT_ADMIN_EMAIL ?? 'admin@newzealankans.local';
  const adminPassword = process.env.DEFAULT_ADMIN_PASSWORD ?? 'Admin123!';
  const includeSampleData = process.env.INCLUDE_SAMPLE_DATA === 'true';
  const password = await bcrypt.hash(adminPassword, 12);

  // 1. Upsert Admin User (must keep this)
  const adminUser = await prisma.user.upsert({
    where: { email: adminEmail },
    update: { role: UserRole.ADMIN, active: true, emailVerified: true },
    create: {
      email: adminEmail,
      password,
      name: 'Marketplace Admin',
      role: UserRole.ADMIN,
      active: true,
      emailVerified: true,
    },
  });

  console.log('Cleaning up old test data...');
  // Delete related data first due to foreign keys
  await prisma.passwordResetToken.deleteMany({});
  await prisma.emailVerificationToken.deleteMany({});
  await prisma.notification.deleteMany({});
  await prisma.adImage.deleteMany({});
  await prisma.ad.deleteMany({});
  await prisma.banner.deleteMany({});
  await prisma.contactSubmission.deleteMany({});
  
  // Clean up non-admin users
  await prisma.user.deleteMany({
    where: {
      email: {
        not: adminEmail,
      },
    },
  });

  if (!includeSampleData) {
    console.log('Creating production categories...');
    const property = await upsertCategory('Property');
    await upsertCategory('Sale', property.id);
    await upsertCategory('Rent', property.id);
    await upsertCategory('Flatmates', property.id);
    await upsertCategory('Motor');
    await upsertCategory('Jobs');
    await upsertCategory('Services');

    console.log('Creating production locations...');
    for (const name of [
      'Auckland',
      'Wellington',
      'Christchurch',
      'Hamilton',
      'Tauranga',
      'Dunedin',
      'Queenstown',
      'Palmerston North',
      'Napier/Hastings',
      'Rotorua',
      'Invercargill',
    ]) {
      await prisma.location.upsert({
        where: { slug: toSlug(name) },
        update: { name },
        create: { name, slug: toSlug(name) },
      });
    }

    console.log('Production seed complete. Set INCLUDE_SAMPLE_DATA=true to seed demo listings.');
    return;
  }

  console.log('Creating sample users...');
  const userPassword = await bcrypt.hash('Password123!', 12);
  
  const john = await prisma.user.create({
    data: {
      email: 'john@example.com',
      password: userPassword,
      name: 'John Doe',
      phone: '021-123-4567',
      role: UserRole.USER,
      active: true,
      emailVerified: true,
    },
  });

  const jane = await prisma.user.create({
    data: {
      email: 'jane@example.com',
      password: userPassword,
      name: 'Jane Smith',
      phone: '022-987-6543',
      role: UserRole.USER,
      active: true,
      emailVerified: true,
    },
  });

  console.log('Creating categories...');
  const property = await upsertCategory('Property');
  const sale = await upsertCategory('Sale', property.id);
  const rent = await upsertCategory('Rent', property.id);
  const flatmates = await upsertCategory('Flatmates', property.id);
  const motor = await upsertCategory('Motor');
  const jobs = await upsertCategory('Jobs');
  const services = await upsertCategory('Services');

  console.log('Creating locations...');
  const locationsData = [
    'Auckland',
    'Wellington',
    'Christchurch',
    'Hamilton',
    'Tauranga',
    'Dunedin',
    'Queenstown',
    'Palmerston North',
    'Napier/Hastings',
    'Rotorua',
    'Invercargill',
  ];

  const locationsMap: Record<string, any> = {};
  for (const name of locationsData) {
    const loc = await prisma.location.upsert({
      where: { slug: toSlug(name) },
      update: { name },
      create: { name, slug: toSlug(name) },
    });
    locationsMap[name] = loc;
  }

  console.log('Creating sample ads and images...');

  // Ad 1: Auckland House (Approved & Featured)
  const ad1 = await prisma.ad.create({
    data: {
      title: 'Beautiful 3 Bedroom Family Home',
      slug: 'beautiful-3-bedroom-family-home',
      description: 'Located in the heart of Auckland, this beautiful family home features 3 spacious bedrooms, 2 modern bathrooms, a double garage, and a large sunny backyard. Close to excellent schools, shops, and public transport.',
      price: 1250000.00,
      contactName: john.name,
      contactEmail: john.email,
      contactPhone: john.phone,
      status: AdStatus.APPROVED,
      featured: true,
      userId: john.id,
      categoryId: sale.id,
      locationId: locationsMap['Auckland'].id,
      images: {
        create: [
          {
            url: 'https://images.unsplash.com/photo-1570129477492-45c003edd2be?w=800',
            filename: 'house1.jpg',
            mimetype: 'image/jpeg',
            size: 102400,
            sortOrder: 0,
          },
        ],
      },
    },
  });

  // Ad 2: Wellington Flatmate (Approved)
  const ad2 = await prisma.ad.create({
    data: {
      title: 'Spacious Master Bedroom CBD',
      slug: 'spacious-master-bedroom-cbd',
      description: 'Looking for a clean and tidy flatmate to share our central Wellington apartment. You will get a spacious master bedroom with its own ensuite bathroom. Fully furnished, rent includes power and ultra-fast fibre internet. Move-in date negotiable.',
      price: 320.00,
      contactName: jane.name,
      contactEmail: jane.email,
      contactPhone: jane.phone,
      status: AdStatus.APPROVED,
      featured: false,
      userId: jane.id,
      categoryId: flatmates.id,
      locationId: locationsMap['Wellington'].id,
      images: {
        create: [
          {
            url: 'https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?w=800',
            filename: 'room1.jpg',
            mimetype: 'image/jpeg',
            size: 85400,
            sortOrder: 0,
          },
        ],
      },
    },
  });

  // Ad 3: Toyota Aqua (Approved & Featured)
  const ad3 = await prisma.ad.create({
    data: {
      title: '2018 Toyota Aqua G Hybrid',
      slug: '2018-toyota-aqua-g-hybrid',
      description: 'Super fuel-efficient 2018 Toyota Aqua G Grade hybrid hatchback in immaculate condition. Only 45,000 km, freshly imported, VTNZ pre-purchase appraisal passed. Features lane departure warning, pre-crash safety system, and dual air bags.',
      price: 14990.00,
      contactName: john.name,
      contactEmail: john.email,
      contactPhone: john.phone,
      status: AdStatus.APPROVED,
      featured: true,
      userId: john.id,
      categoryId: motor.id,
      locationId: locationsMap['Christchurch'].id,
      images: {
        create: [
          {
            url: 'https://images.unsplash.com/photo-1549399542-7e3f8b79c341?w=800',
            filename: 'car1.jpg',
            mimetype: 'image/jpeg',
            size: 95000,
            sortOrder: 0,
          },
        ],
      },
    },
  });

  // Ad 4: Job Opening (Approved)
  const ad4 = await prisma.ad.create({
    data: {
      title: 'Senior React Native Developer',
      slug: 'senior-react-native-developer',
      description: 'A leading tech startup in Auckland is looking for a Senior React Native Developer to build state-of-the-art mobile applications. Must have 5+ years of experience with React Native, TypeScript, and native iOS/Android builds. Competitive salary and remote flexibility.',
      price: null,
      contactName: jane.name,
      contactEmail: jane.email,
      contactPhone: jane.phone,
      status: AdStatus.APPROVED,
      featured: false,
      userId: jane.id,
      categoryId: jobs.id,
      locationId: locationsMap['Auckland'].id,
      images: {
        create: [
          {
            url: 'https://images.unsplash.com/photo-1498050108023-c5249f4df085?w=800',
            filename: 'job1.jpg',
            mimetype: 'image/jpeg',
            size: 60000,
            sortOrder: 0,
          },
        ],
      },
    },
  });

  // Ad 5: Pending Ad (Pending)
  const ad5 = await prisma.ad.create({
    data: {
      title: 'Cozy 1 Bedroom Flat for Rent',
      slug: 'cozy-1-bedroom-flat-for-rent',
      description: 'Pending listing for a cozy, warm 1-bedroom flat in Dunedins campus area. Walking distance to the university and supermarket. Heat pump installed, double glazed windows, partly furnished. Perfect for students or couples.',
      price: 400.00,
      contactName: john.name,
      contactEmail: john.email,
      contactPhone: john.phone,
      status: AdStatus.PENDING,
      featured: false,
      userId: john.id,
      categoryId: rent.id,
      locationId: locationsMap['Dunedin'].id,
      images: {
        create: [
          {
            url: 'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=800',
            filename: 'flat1.jpg',
            mimetype: 'image/jpeg',
            size: 78000,
            sortOrder: 0,
          },
        ],
      },
    },
  });

  // Ad 6: Rejected Ad (Rejected)
  const ad6 = await prisma.ad.create({
    data: {
      title: 'Illegal Streaming Device Box',
      slug: 'illegal-streaming-device-box',
      description: 'Rejected listing trying to sell an illegal TV streaming box. This is mapped to status REJECTED for demonstration purposes.',
      price: 150.00,
      contactName: jane.name,
      contactEmail: jane.email,
      contactPhone: jane.phone,
      status: AdStatus.REJECTED,
      rejectionReason: 'Your listing violates our Terms of Service regarding illegal goods or services.',
      featured: false,
      userId: jane.id,
      categoryId: sale.id,
      locationId: locationsMap['Rotorua'].id,
    },
  });

  // Ad 7: Expired Ad (Expired)
  const ad7 = await prisma.ad.create({
    data: {
      title: 'Vintage Wooden Dining Table',
      slug: 'vintage-wooden-dining-table',
      description: 'Beautiful vintage wooden dining table with 6 matching chairs. Has some minor scratches but otherwise in solid condition. Pick up only.',
      price: 250.00,
      contactName: john.name,
      contactEmail: john.email,
      contactPhone: john.phone,
      status: AdStatus.EXPIRED,
      featured: false,
      userId: john.id,
      categoryId: sale.id,
      locationId: locationsMap['Queenstown'].id,
      images: {
        create: [
          {
            url: 'https://images.unsplash.com/photo-1577140917170-285929fb55b7?w=800',
            filename: 'table1.jpg',
            mimetype: 'image/jpeg',
            size: 110000,
            sortOrder: 0,
          },
        ],
      },
    },
  });

  console.log('Creating sample banners...');
  await prisma.banner.createMany({
    data: [
      {
        title: 'Winter Property Expo',
        placement: BannerPlacement.HOME,
        imageUrl: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1200',
        linkUrl: '/categories/property',
        active: true,
      },
      {
        title: 'List Your Car for Free',
        placement: BannerPlacement.SIDEBAR,
        imageUrl: 'https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?w=800',
        linkUrl: '/ads/create',
        active: true,
      },
      {
        title: 'Jobs in Tech Hub',
        placement: BannerPlacement.CATEGORY,
        imageUrl: 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=1200',
        linkUrl: '/categories/jobs',
        active: true,
      },
    ],
  });

  console.log('Creating sample contact submissions...');
  await prisma.contactSubmission.createMany({
    data: [
      {
        name: 'Sarah Connor',
        email: 'sarah@example.com',
        subject: 'Inquiry about featuring an ad',
        message: 'Hi, I would like to know the pricing for making my home listing featured on the home page. Thank you!',
        readAt: null,
      },
      {
        name: 'James Smith',
        email: 'james@example.com',
        subject: 'Bug report on upload',
        message: 'I tried uploading a PNG image for my car listing but it failed with a payload too large error. It was only 6MB.',
        readAt: new Date(),
      },
    ],
  });

  console.log('Creating sample notifications...');
  await prisma.notification.createMany({
    data: [
      {
        userId: john.id,
        type: NotificationType.AD_APPROVED,
        title: 'Ad Approved!',
        message: "Your listing 'Beautiful 3 Bedroom Family Home' has been approved and is now live.",
        readAt: null,
      },
      {
        userId: john.id,
        type: NotificationType.AD_SUBMITTED,
        title: 'Ad Submitted',
        message: "Your listing 'Cozy 1 Bedroom Flat for Rent' has been submitted for admin review.",
        readAt: new Date(),
      },
      {
        userId: jane.id,
        type: NotificationType.AD_REJECTED,
        title: 'Ad Rejected',
        message: "Your listing 'Illegal Streaming Device Box' has been rejected by the administrator.",
        readAt: null,
      },
    ],
  });

  console.log('Database seeding complete successfully!');
}

main()
  .then(async () => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
