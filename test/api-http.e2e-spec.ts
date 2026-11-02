import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AdStatus, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { access, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import type { Server } from 'node:http';
import request from 'supertest';
import sharp from 'sharp';
import express from 'express';
import { JwtService } from '@nestjs/jwt';
import { AppModule } from '../src/app.module';
import { EmailService } from '../src/email/email.service';
import { PrismaService } from '../src/prisma/prisma.service';

function usesIsolatedDatabase(): boolean {
  if (process.env.RUN_DATABASE_INTEGRATION !== '1' || !process.env.DATABASE_URL)
    return false;
  try {
    const url = new URL(process.env.DATABASE_URL);
    return (
      ['127.0.0.1', 'localhost', '::1'].includes(url.hostname) &&
      ['5544', '55432', '55433'].includes(url.port) &&
      url.pathname === '/nzk_test'
    );
  } catch {
    return false;
  }
}

const enabled = usesIsolatedDatabase();
if (process.env.RUN_DATABASE_INTEGRATION === '1' && !enabled) {
  throw new Error(
    'HTTP integration tests require local nzk_test on an approved local test port.',
  );
}

function readBody<T>(response: unknown): T {
  return (response as { body: T }).body;
}

function httpServer(app: INestApplication): Server {
  const server: unknown = app.getHttpServer();
  return server as Server;
}

(enabled ? describe : describe.skip)('Marketplace API HTTP integration', () => {
  const prefix = `nzkhttp${Date.now()}`;
  const email = `${prefix}@example.test`;
  const secondEmail = `second-${prefix}@example.test`;
  const adminEmail = `admin-${prefix}@example.test`;
  let issuedVerificationToken = '';
  let issuedPasswordResetToken = '';
  const mailer = {
    sendVerification: jest.fn((_to: string, token: string) => {
      issuedVerificationToken = token;
      return Promise.resolve();
    }),
    sendPasswordReset: jest.fn((_to: string, token: string) => {
      issuedPasswordResetToken = token;
      return Promise.resolve();
    }),
    sendAdSubmitted: jest.fn().mockResolvedValue(undefined),
    sendAdApproved: jest.fn().mockResolvedValue(undefined),
    sendAdRejected: jest.fn().mockResolvedValue(undefined),
    sendAdExpired: jest.fn().mockResolvedValue(undefined),
    sendAdminContactNotification: jest.fn().mockResolvedValue(undefined),
    sendListingEnquiry: jest.fn().mockResolvedValue(true),
  };
  let app!: INestApplication;
  let server!: Server;
  let prisma!: PrismaService;
  let userId = '';
  let secondUserId = '';
  let adminId = '';
  let childCategoryId = '';
  let locationId = '';

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(EmailService)
      .useValue(mailer)
      .compile();
    app = module.createNestApplication();
    app.use(
      '/uploads',
      express.static(join(process.cwd(), 'uploads'), {
        setHeaders: (response) => {
          response.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
        },
      }),
    );
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    await app.init();
    server = httpServer(app);
    prisma = app.get(PrismaService);
    const parent = await prisma.category.create({
      data: { name: `${prefix} Motors`, slug: `${prefix}-motor` },
    });
    const child = await prisma.category.create({
      data: {
        name: `${prefix} Cars`,
        slug: `${prefix}-cars`,
        parentId: parent.id,
      },
    });
    const location = await prisma.location.create({
      data: { name: `${prefix} Auckland`, slug: `${prefix}-auckland` },
    });
    childCategoryId = child.id;
    locationId = location.id;
  }, 30000);

  afterAll(async () => {
    if (prisma) {
      const fixtureImages = await prisma.adImage.findMany({
        where: { ad: { slug: { startsWith: prefix } } },
        select: { filename: true },
      });
      await Promise.all(
        fixtureImages.map(({ filename }) =>
          unlink(join(process.cwd(), 'uploads/ads', filename)).catch(
            () => undefined,
          ),
        ),
      );
      await prisma.contactSubmission.deleteMany({
        where: { email: { in: [email, secondEmail] } },
      });
      await prisma.banner.deleteMany({
        where: { title: { startsWith: prefix } },
      });
      await prisma.watchlist.deleteMany({
        where: { userId: { in: [userId, secondUserId, adminId] } },
      });
      await prisma.ad.deleteMany({ where: { slug: { startsWith: prefix } } });
      await prisma.category.deleteMany({
        where: { slug: { startsWith: prefix } },
      });
      await prisma.location.deleteMany({
        where: { slug: { startsWith: prefix } },
      });
      await prisma.user.deleteMany({ where: { email: { contains: prefix } } });
    }
    await app?.close();
  }, 30000);

  it('routes real public, account, listing, Watchlist, enquiry and admin requests', async () => {
    const categoriesResponse = await request(server)
      .get('/api/categories')
      .expect(200);
    const categories =
      readBody<Array<{ slug: string; children: Array<{ slug: string }> }>>(
        categoriesResponse,
      );
    expect(
      categories.some(
        (category) =>
          category.slug === `${prefix}-motor` &&
          category.children.some((child) => child.slug === `${prefix}-cars`),
      ),
    ).toBe(true);
    const locationsResponse = await request(server)
      .get('/api/locations')
      .expect(200);
    expect(
      readBody<Array<{ slug: string }>>(locationsResponse).some(
        (item) => item.slug === `${prefix}-auckland`,
      ),
    ).toBe(true);
    await request(server).get('/api/watchlist').expect(401);
    await request(server).get('/api/admin/ads/pending').expect(401);
    await request(server).get('/api/users/admin').expect(401);

    const registration = await request(server)
      .post('/api/auth/register')
      .send({ name: 'API Test User', email, password: 'local-test-pass-123' })
      .expect(201);
    expect(
      readBody<{ demoVerificationToken?: string }>(registration)
        .demoVerificationToken,
    ).toBeUndefined();
    userId = readBody<{ user: { id: string } }>(registration).user.id;
    const tokenRecord = await prisma.emailVerificationToken.findFirstOrThrow({
      where: { userId },
    });
    expect(tokenRecord.token).not.toBe(issuedVerificationToken);
    await request(server)
      .get(`/api/auth/verify-email/${issuedVerificationToken}`)
      .expect(200);
    const previousNodeEnv = process.env.NODE_ENV;
    const previousDemoVerification = process.env.DEMO_EMAIL_VERIFICATION;
    process.env.NODE_ENV = 'demo';
    process.env.DEMO_EMAIL_VERIFICATION = 'true';
    let demoVerificationToken = '';
    try {
      const demoRegistration = await request(server)
        .post('/api/auth/register')
        .send({
          name: 'Demo Verification User',
          email: `${prefix}-demo@example.test`,
          password: 'local-demo-pass-123',
        })
        .expect(201);
      demoVerificationToken = readBody<{ demoVerificationToken: string }>(
        demoRegistration,
      ).demoVerificationToken;
      expect(demoVerificationToken).toHaveLength(64);
      const demoHealth = await request(server).get('/api/health').expect(200);
      expect(readBody<{ email: string }>(demoHealth).email).toBe(
        'disabled_demo',
      );
    } finally {
      if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previousNodeEnv;
      if (previousDemoVerification === undefined)
        delete process.env.DEMO_EMAIL_VERIFICATION;
      else process.env.DEMO_EMAIL_VERIFICATION = previousDemoVerification;
    }
    await request(server)
      .get(`/api/auth/verify-email/${demoVerificationToken}`)
      .expect(200);
    await prisma.emailVerificationToken.create({
      data: {
        userId,
        token: `${prefix}-expired-verification-token`,
        expiresAt: new Date(Date.now() - 1000),
      },
    });
    await request(server)
      .get(`/api/auth/verify-email/${prefix}-expired-verification-token`)
      .expect(400);
    const login = await request(server)
      .post('/api/auth/login')
      .send({ email, password: 'local-test-pass-123' })
      .expect(201);
    const userToken = readBody<{ accessToken: string }>(login).accessToken;
    const expiredToken = await app
      .get(JwtService)
      .signAsync(
        { sub: userId, email, role: UserRole.USER, sessionVersion: 0 },
        { expiresIn: -1 },
      );
    await request(server)
      .get('/api/users/me')
      .set('Authorization', `Bearer ${expiredToken}`)
      .expect(401);
    const currentUser = await request(server)
      .get('/api/users/me')
      .set('Authorization', `Bearer ${userToken}`)
      .expect(200);
    expect(
      readBody<{ emailVerified: boolean }>(currentUser).emailVerified,
    ).toBe(true);
    const profile = await request(server)
      .patch('/api/users/me')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ name: 'Updated API Test User' })
      .expect(200);
    expect(readBody<{ name: string }>(profile).name).toBe(
      'Updated API Test User',
    );

    const approvedAd = await prisma.ad.create({
      data: {
        title: `${prefix} approved listing`,
        slug: `${prefix}-approved`,
        description: 'Synthetic API integration listing',
        price: 250,
        contactEmail: 'seller@example.test',
        status: AdStatus.APPROVED,
        userId,
        categoryId: childCategoryId,
        locationId,
      },
    });
    await request(server)
      .post('/api/ads')
      .set('Authorization', `Bearer ${userToken}`)
      .field('title', 'x')
      .field('description', 'short')
      .field('categoryId', childCategoryId)
      .field('locationId', locationId)
      .expect(400);
    const search = await request(server)
      .get('/api/ads')
      .query({
        keyword: prefix,
        category: `${prefix}-motor`,
        subcategory: `${prefix}-cars`,
        location: `${prefix}-auckland`,
        minPrice: 200,
        maxPrice: 300,
        sort: 'price_asc',
        limit: 5,
      })
      .expect(200);
    expect(readBody<{ meta: { total: number } }>(search).meta.total).toBe(1);
    const listingDetails = await request(server)
      .get(`/api/ads/slug/${approvedAd.slug}`)
      .expect(200);
    const details = readBody<{ user: Record<string, unknown> }>(listingDetails);
    expect(Object.hasOwn(details.user, 'email')).toBe(false);

    const posted = await request(server)
      .post('/api/ads')
      .set('Authorization', `Bearer ${userToken}`)
      .field('title', `${prefix} pending listing`)
      .field('description', 'Synthetic pending description for API integration')
      .field('categoryId', childCategoryId)
      .field('locationId', locationId)
      .expect(201);
    const postedId = readBody<{ id: string }>(posted).id;
    await request(server)
      .post('/api/ads')
      .set('Authorization', `Bearer ${userToken}`)
      .field('title', `${prefix} invalid image listing`)
      .field('description', 'Synthetic invalid image content test')
      .field('categoryId', childCategoryId)
      .field('locationId', locationId)
      .attach('images', Buffer.from('not an image'), {
        filename: 'spoofed.png',
        contentType: 'image/png',
      })
      .expect(400);
    const validPng = await sharp({
      create: {
        width: 2,
        height: 2,
        channels: 3,
        background: '#ffffff',
      },
    })
      .png()
      .toBuffer();
    const imageAdResponse = await request(server)
      .post('/api/ads')
      .set('Authorization', `Bearer ${userToken}`)
      .field('title', `${prefix} image listing`)
      .field('description', 'Synthetic image listing for API integration')
      .field('categoryId', childCategoryId)
      .field('locationId', locationId)
      .attach('images', validPng, {
        filename: 'integration.png',
        contentType: 'image/png',
      })
      .expect(201);
    const imageAd = readBody<{ id: string }>(imageAdResponse);
    const imageRecord = await prisma.adImage.findFirstOrThrow({
      where: { adId: imageAd.id },
    });
    await access(join(process.cwd(), 'uploads/ads', imageRecord.filename));
    const retrievedImage = await request(server)
      .get(`/uploads/ads/${imageRecord.filename}`)
      .expect(200);
    expect(retrievedImage.headers['content-type']).toMatch(/image\/webp/);

    const removable = await request(server)
      .post('/api/ads')
      .set('Authorization', `Bearer ${userToken}`)
      .field('title', `${prefix} removable listing`)
      .field('description', 'Synthetic listing for owner deletion testing')
      .field('categoryId', childCategoryId)
      .field('locationId', locationId)
      .expect(201);
    const removableId = readBody<{ id: string }>(removable).id;
    await request(server)
      .delete(`/api/ads/${removableId}`)
      .set('Authorization', `Bearer ${userToken}`)
      .expect(200);
    await expect(
      prisma.ad.findUnique({ where: { id: removableId } }),
    ).resolves.toBeNull();
    const myAds = await request(server)
      .get('/api/ads/me/list')
      .set('Authorization', `Bearer ${userToken}`)
      .expect(200);
    expect(
      readBody<Array<{ id: string }>>(myAds).some((ad) => ad.id === postedId),
    ).toBe(true);
    await request(server)
      .patch(`/api/ads/${postedId}`)
      .set('Authorization', `Bearer ${userToken}`)
      .field('title', `${prefix} edited listing`)
      .field('description', 'Edited synthetic description for API integration')
      .field('categoryId', childCategoryId)
      .field('locationId', locationId)
      .expect(200);
    const notifications = await request(server)
      .get('/api/notifications')
      .set('Authorization', `Bearer ${userToken}`)
      .expect(200);
    const notificationId =
      readBody<Array<{ id: string }>>(notifications)[0]?.id;
    if (notificationId) {
      await request(server)
        .patch(`/api/notifications/${notificationId}/read`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);
    }

    const secondRegistration = await request(server)
      .post('/api/auth/register')
      .send({
        name: 'Other User',
        email: secondEmail,
        password: 'local-test-pass-456',
      })
      .expect(201);
    secondUserId = readBody<{ user: { id: string } }>(secondRegistration).user
      .id;
    const secondLogin = await request(server)
      .post('/api/auth/login')
      .send({ email: secondEmail, password: 'local-test-pass-456' })
      .expect(201);
    let secondToken = readBody<{ accessToken: string }>(
      secondLogin,
    ).accessToken;
    await request(server)
      .delete(`/api/ads/${postedId}`)
      .set('Authorization', `Bearer ${secondToken}`)
      .expect(403);

    await request(server)
      .post('/api/watchlist')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ adId: approvedAd.id })
      .expect(201);
    const savedList = await request(server)
      .get('/api/watchlist')
      .set('Authorization', `Bearer ${userToken}`)
      .expect(200);
    expect(
      readBody<Array<{ id: string }>>(savedList).some(
        (ad) => ad.id === approvedAd.id,
      ),
    ).toBe(true);
    await request(server)
      .delete(`/api/watchlist/${approvedAd.id}`)
      .set('Authorization', `Bearer ${userToken}`)
      .expect(200);

    const enquiry = await request(server)
      .post('/api/contact')
      .send({
        name: 'Test buyer',
        email: 'buyer@example.test',
        subject: 'Question about listing',
        message: 'Is this listing still available?',
        adId: approvedAd.id,
      })
      .expect(201);
    expect(readBody<{ sellerNotified: boolean }>(enquiry).sellerNotified).toBe(
      true,
    );
    expect(mailer.sendListingEnquiry).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'seller@example.test' }),
    );
    const sellerInbox = await request(server)
      .get('/api/contact/me')
      .set('Authorization', `Bearer ${userToken}`)
      .expect(200);
    expect(
      readBody<Array<{ adId: string }>>(sellerInbox).some(
        (item) => item.adId === approvedAd.id,
      ),
    ).toBe(true);
    const privateInbox = await request(server)
      .get('/api/contact/me')
      .set('Authorization', `Bearer ${secondToken}`)
      .expect(200);
    expect(readBody<unknown[]>(privateInbox)).toHaveLength(0);

    const admin = await prisma.user.create({
      data: {
        email: adminEmail,
        password: await bcrypt.hash('local-admin-pass-789', 4),
        role: UserRole.ADMIN,
      },
    });
    adminId = admin.id;
    const adminLogin = await request(server)
      .post('/api/auth/login')
      .send({ email: adminEmail, password: 'local-admin-pass-789' })
      .expect(201);
    const adminToken = readBody<{ accessToken: string }>(
      adminLogin,
    ).accessToken;
    await request(server)
      .get('/api/admin/ads/pending')
      .set('Authorization', `Bearer ${userToken}`)
      .expect(403);
    await request(server)
      .get('/api/users/admin')
      .set('Authorization', `Bearer ${userToken}`)
      .expect(403);
    const userList = await request(server)
      .get('/api/users/admin')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(
      readBody<Array<{ id: string }>>(userList).map((user) => user.id),
    ).toContain(secondUserId);
    await request(server)
      .get(`/api/users/admin/${secondUserId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    await request(server)
      .patch(`/api/users/admin/${secondUserId}/deactivate`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    await request(server)
      .post('/api/auth/login')
      .send({ email: secondEmail, password: 'local-test-pass-456' })
      .expect(401);
    await request(server)
      .patch(`/api/users/admin/${secondUserId}/activate`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    let secondAccountLogin = await request(server)
      .post('/api/auth/login')
      .send({ email: secondEmail, password: 'local-test-pass-456' })
      .expect(201);
    secondToken = readBody<{ accessToken: string }>(
      secondAccountLogin,
    ).accessToken;
    await request(server)
      .patch(`/api/users/admin/${secondUserId}/role`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ role: UserRole.ADMIN })
      .expect(200);
    await request(server)
      .get('/api/admin/ads/pending')
      .set('Authorization', `Bearer ${secondToken}`)
      .expect(401);
    secondAccountLogin = await request(server)
      .post('/api/auth/login')
      .send({ email: secondEmail, password: 'local-test-pass-456' })
      .expect(201);
    secondToken = readBody<{ accessToken: string }>(
      secondAccountLogin,
    ).accessToken;
    await request(server)
      .get('/api/admin/ads/pending')
      .set('Authorization', `Bearer ${secondToken}`)
      .expect(200);
    await request(server)
      .patch(`/api/users/admin/${secondUserId}/role`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ role: UserRole.USER })
      .expect(200);
    await request(server)
      .get('/api/admin/ads/pending')
      .set('Authorization', `Bearer ${secondToken}`)
      .expect(401);
    secondAccountLogin = await request(server)
      .post('/api/auth/login')
      .send({ email: secondEmail, password: 'local-test-pass-456' })
      .expect(201);
    secondToken = readBody<{ accessToken: string }>(
      secondAccountLogin,
    ).accessToken;
    await request(server)
      .get('/api/admin/ads/pending')
      .set('Authorization', `Bearer ${secondToken}`)
      .expect(403);
    const createdCategory = await request(server)
      .post('/api/categories/admin')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: `${prefix} Admin Category` })
      .expect(201);
    const adminCategoryId = readBody<{ id: string }>(createdCategory).id;
    await request(server)
      .patch(`/api/categories/admin/${adminCategoryId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: `${prefix} Updated Category` })
      .expect(200);
    await request(server)
      .delete(`/api/categories/admin/${adminCategoryId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const createdLocation = await request(server)
      .post('/api/locations/admin')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: `${prefix} Admin Location` })
      .expect(201);
    const adminLocationId = readBody<{ id: string }>(createdLocation).id;
    await request(server)
      .patch(`/api/locations/admin/${adminLocationId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: `${prefix} Updated Location` })
      .expect(200);
    await request(server)
      .delete(`/api/locations/admin/${adminLocationId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const contactInbox = await request(server)
      .get('/api/contact/admin')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(
      readBody<Array<{ adId: string | null }>>(contactInbox).some(
        (item) => item.adId !== null,
      ),
    ).toBe(true);
    const approved = await request(server)
      .patch(`/api/admin/ads/${postedId}/approve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(readBody<{ status: AdStatus }>(approved).status).toBe(
      AdStatus.APPROVED,
    );
    const rejected = await request(server)
      .patch(`/api/admin/ads/${imageAd.id}/reject`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: 'Synthetic moderation review' })
      .expect(200);
    expect(readBody<{ status: AdStatus }>(rejected).status).toBe(
      AdStatus.REJECTED,
    );
    await request(server)
      .get(`/api/ads/slug/${prefix}-image-listing`)
      .expect(404);
    const editedRejectedAd = await request(server)
      .patch(`/api/ads/${imageAd.id}`)
      .set('Authorization', `Bearer ${userToken}`)
      .field('title', `${prefix} image listing updated`)
      .field('description', 'Updated synthetic image listing for integration')
      .field('categoryId', childCategoryId)
      .field('locationId', locationId)
      .expect(200);
    expect(readBody<{ status: AdStatus }>(editedRejectedAd).status).toBe(
      AdStatus.PENDING,
    );
    await request(server)
      .patch(`/api/admin/ads/${imageAd.id}/approve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const visibleImageAd = await request(server)
      .get(`/api/ads/slug/${prefix}-image-listing-updated`)
      .expect(200);
    expect(readBody<{ images: unknown[] }>(visibleImageAd).images).toHaveLength(
      1,
    );
    const storedImages = await prisma.adImage.findMany({
      where: { adId: imageAd.id },
      select: { filename: true },
    });
    await request(server)
      .delete(`/api/ads/${imageAd.id}`)
      .set('Authorization', `Bearer ${userToken}`)
      .expect(200);
    await request(server)
      .get(`/api/ads/slug/${prefix}-image-listing-updated`)
      .expect(404);
    for (const image of storedImages) {
      await expect(
        access(join(process.cwd(), 'uploads/ads', image.filename)),
      ).rejects.toThrow();
    }

    await request(server)
      .patch('/api/users/me/password')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        currentPassword: 'local-test-pass-123',
        newPassword: 'local-change-pass-123',
      })
      .expect(200);
    await request(server)
      .get('/api/users/me')
      .set('Authorization', `Bearer ${userToken}`)
      .expect(401);
    await request(server)
      .post('/api/auth/forgot-password')
      .send({ email })
      .expect(201);
    let resetToken = await prisma.passwordResetToken.findFirstOrThrow({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    expect(resetToken.token).not.toBe(issuedPasswordResetToken);
    await prisma.passwordResetToken.update({
      where: { id: resetToken.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await request(server)
      .post('/api/auth/reset-password')
      .send({
        token: issuedPasswordResetToken,
        password: 'local-expired-pass-123',
      })
      .expect(400);
    await request(server)
      .post('/api/auth/forgot-password')
      .send({ email })
      .expect(201);
    resetToken = await prisma.passwordResetToken.findFirstOrThrow({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    expect(resetToken.token).not.toBe(issuedPasswordResetToken);
    await request(server)
      .post('/api/auth/reset-password')
      .send({
        token: issuedPasswordResetToken,
        password: 'local-reset-pass-123',
      })
      .expect(201);
    await request(server)
      .post('/api/auth/reset-password')
      .send({
        token: issuedPasswordResetToken,
        password: 'local-reset-pass-456',
      })
      .expect(400);
    const resetLogin = await request(server)
      .post('/api/auth/login')
      .send({ email, password: 'local-reset-pass-123' })
      .expect(201);
    const resetAccessToken = readBody<{ accessToken: string }>(
      resetLogin,
    ).accessToken;
    await request(server)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${resetAccessToken}`)
      .expect(201);
    await request(server)
      .get('/api/users/me')
      .set('Authorization', `Bearer ${resetAccessToken}`)
      .expect(401);

    const bannerResponse = await request(server)
      .post('/api/banners/admin')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        sponsor: 'Test sponsor',
        title: `${prefix} banner`,
        description: 'Test banner text',
        imageUrl: 'https://example.test/banner.jpg',
        placement: 'HOME',
      })
      .expect(201);
    const bannerId = readBody<{ id: string }>(bannerResponse).id;
    await request(server)
      .patch(`/api/banners/admin/${bannerId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        sponsor: 'Edited sponsor',
        title: `${prefix} banner edited`,
        description: 'Edited banner text',
        imageUrl: 'https://example.test/banner.jpg',
        placement: 'HOME',
      })
      .expect(200);
    const publicBanners = await request(server)
      .get('/api/banners/HOME')
      .expect(200);
    expect(
      readBody<Array<{ sponsor: string }>>(publicBanners).some(
        (banner) => banner.sponsor === 'Edited sponsor',
      ),
    ).toBe(true);
  }, 120000);
});
