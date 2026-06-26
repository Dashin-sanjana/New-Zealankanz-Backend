require('dotenv/config');
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');

function getDatabaseUrl() {
  const databaseUrl = process.env.DATABASE_URL && process.env.DATABASE_URL.trim();

  if (!databaseUrl) {
    throw new Error(
      'DATABASE_URL is not set. Add a valid PostgreSQL connection string to .env before checking the database.',
    );
  }

  let parsed;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error(
      'DATABASE_URL is not a valid PostgreSQL connection string. Expected format: postgresql://user:password@host:port/database',
    );
  }

  if (!['postgresql:', 'postgres:'].includes(parsed.protocol)) {
    throw new Error(
      `DATABASE_URL must use the postgresql:// or postgres:// protocol, got ${parsed.protocol}`,
    );
  }

  if (!parsed.username || !parsed.password) {
    throw new Error('DATABASE_URL must include both username and password.');
  }

  if (!parsed.pathname || parsed.pathname === '/') {
    throw new Error('DATABASE_URL must include a database name.');
  }

  return databaseUrl;
}

const connectionString = getDatabaseUrl();
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function check() {
  try {
    const users = await prisma.user.count();
    const categories = await prisma.category.count();
    const locations = await prisma.location.count();
    const ads = await prisma.ad.count();
    const adImages = await prisma.adImage.count();
    const notifications = await prisma.notification.count();
    const banners = await prisma.banner.count();
    const contactSubmissions = await prisma.contactSubmission.count();

    console.log('Database Row Counts:');
    console.log(`- Users: ${users}`);
    console.log(`- Categories: ${categories}`);
    console.log(`- Locations: ${locations}`);
    console.log(`- Ads: ${ads}`);
    console.log(`- AdImages: ${adImages}`);
    console.log(`- Notifications: ${notifications}`);
    console.log(`- Banners: ${banners}`);
    console.log(`- ContactSubmissions: ${contactSubmissions}`);
  } catch (err) {
    console.error('Error querying database:', err);
  } finally {
    await prisma.$disconnect();
  }
}

check();
