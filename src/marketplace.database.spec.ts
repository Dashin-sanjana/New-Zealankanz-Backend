import { performance } from 'node:perf_hooks';
import { randomUUID } from 'node:crypto';
import { AdStatus, Prisma } from '@prisma/client';
import { EmailService } from './email/email.service';
import { NotificationService } from './notification/notification.service';
import { PrismaService } from './prisma/prisma.service';
import { AdSort } from './ad/dto/ad.dto';
import { AdService } from './ad/ad.service';
import { WatchlistService } from './watchlist/watchlist.service';
import { ConfigService } from '@nestjs/config';
import { ContactService } from './contact/contact.service';
import { StorageService } from './storage/storage.service';
import { SavedSearchService } from './saved-search/saved-search.service';

function isDedicatedLocalTestDatabase(): boolean {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl || process.env.RUN_DATABASE_INTEGRATION !== '1')
    return false;

  try {
    const url = new URL(databaseUrl);
    return (
      ['127.0.0.1', 'localhost', '::1'].includes(url.hostname) &&
      ['5544', '55432', '55433'].includes(url.port) &&
      url.pathname === '/nzk_test'
    );
  } catch {
    return false;
  }
}

const enabled = isDedicatedLocalTestDatabase();
if (process.env.RUN_DATABASE_INTEGRATION === '1' && !enabled) {
  throw new Error(
    'Database integration tests only run against nzk_test on an approved local test port.',
  );
}

(enabled ? describe : describe.skip)(
  'PostgreSQL marketplace integration',
  () => {
    const prefix = `nzkload${Date.now()}`;
    const emailA = `${prefix}-a@example.test`;
    const emailB = `${prefix}-b@example.test`;
    let prisma!: PrismaService;
    let ads: AdService;
    let watchlist: WatchlistService;
    let savedSearches: SavedSearchService;
    let parentCategoryId: string;
    let childCategoryId: string;
    let locationId: string;
    let userAId: string;
    let userBId: string;

    beforeAll(async () => {
      prisma = new PrismaService();
      await prisma.onModuleInit();
      ads = new AdService(
        prisma,
        {} as EmailService,
        {} as NotificationService,
        new StorageService({ get: () => 'local' } as unknown as ConfigService),
      );
      watchlist = new WatchlistService(prisma);
      savedSearches = new SavedSearchService(prisma);

      const parent = await prisma.category.create({
        data: { name: 'Integration Motors', slug: `${prefix}-motor` },
      });
      const child = await prisma.category.create({
        data: {
          name: 'Integration Cars',
          slug: `${prefix}-cars`,
          parentId: parent.id,
        },
      });
      const location = await prisma.location.create({
        data: { name: 'Integration Auckland', slug: `${prefix}-auckland` },
      });
      parentCategoryId = parent.id;
      childCategoryId = child.id;
      locationId = location.id;
      const users = await Promise.all([
        prisma.user.create({
          data: { email: emailA, password: 'test-only-password' },
        }),
        prisma.user.create({
          data: { email: emailB, password: 'test-only-password' },
        }),
      ]);
      [userAId, userBId] = users.map(({ id }) => id);
    }, 30000);

    afterAll(async () => {
      if (!prisma) return;
      await prisma.contactSubmission.deleteMany({
        where: { ad: { slug: { startsWith: prefix } } },
      });
      await prisma.banner.deleteMany({
        where: { title: `${prefix} banner` },
      });
      await prisma.watchlist.deleteMany({
        where: { ad: { slug: { startsWith: prefix } } },
      });
      await prisma.ad.deleteMany({ where: { slug: { startsWith: prefix } } });
      await prisma.category.deleteMany({
        where: { id: { in: [childCategoryId, parentCategoryId] } },
      });
      await prisma.location.deleteMany({ where: { id: locationId } });
      await prisma.user.deleteMany({
        where: { email: { in: [emailA, emailB] } },
      });
      await prisma.onModuleDestroy();
    }, 30000);

    async function insertListings(from: number, count: number) {
      const rows = Array.from({ length: count }, (_, offset) => {
        const index = from + offset;
        return {
          id: randomUUID(),
          title: `${prefix}-common-${index}`,
          slug: `${prefix}-${index}`,
          description: `Synthetic ${prefix} marketplace record`,
          price: new Prisma.Decimal(index),
          status: AdStatus.APPROVED,
          featured: index % 2 === 0,
          userId: index % 2 === 0 ? userAId : userBId,
          categoryId: childCategoryId,
          locationId,
          createdAt: new Date(Date.UTC(2025, 0, 1) + index * 1000),
          updatedAt: new Date(Date.UTC(2025, 0, 1) + index * 1000),
        };
      });
      for (let offset = 0; offset < rows.length; offset += 500) {
        const batch = rows.slice(offset, offset + 500);
        await prisma.$executeRaw(Prisma.sql`
          INSERT INTO "Ad" (
            "id", "title", "slug", "description", "price", "status",
            "featured", "userId", "categoryId", "locationId", "createdAt", "updatedAt"
          ) VALUES ${Prisma.join(
            batch.map(
              (row) => Prisma.sql`(
              ${row.id}, ${row.title}, ${row.slug}, ${row.description}, ${row.price},
              ${AdStatus.APPROVED}::"AdStatus", ${row.featured}, ${row.userId},
              ${row.categoryId}, ${row.locationId}, ${row.createdAt}, ${row.updatedAt}
            )`,
            ),
          )}
        `);
      }
    }

    it('filters, sorts, counts and paginates 100, 1,000 and 10,000 real rows', async () => {
      const sizes = [100, 1000, 10000];
      let inserted = 0;
      const timings: Array<{ rows: number; queryMs: number }> = [];

      for (const size of sizes) {
        await insertListings(inserted + 1, size - inserted);
        inserted = size;
        const startedAt = performance.now();
        const result = await ads.publicList({
          keyword: prefix,
          category: `${prefix}-motor`,
          subcategory: `${prefix}-cars`,
          location: `${prefix}-auckland`,
          page: 1,
          limit: 100,
        });
        timings.push({
          rows: size,
          queryMs: Number((performance.now() - startedAt).toFixed(2)),
        });
        expect(result.meta).toEqual({
          total: size,
          page: 1,
          limit: 100,
          pages: Math.ceil(size / 100),
        });
        expect(result.data).toHaveLength(Math.min(size, 100));
      }
      console.info(
        `Local PostgreSQL search timings: ${JSON.stringify(timings)}`,
      );

      const priceRange = await ads.publicList({
        keyword: prefix,
        minPrice: 100,
        maxPrice: 199,
        sort: AdSort.PRICE_ASC,
        limit: 100,
      });
      expect(priceRange.meta.total).toBe(100);
      expect(Number(priceRange.data[0]?.price)).toBe(100);

      const ascending = await ads.publicList({
        keyword: prefix,
        sort: AdSort.PRICE_ASC,
        limit: 3,
      });
      const descending = await ads.publicList({
        keyword: prefix,
        sort: AdSort.PRICE_DESC,
        limit: 3,
      });
      expect(ascending.data.map((ad) => Number(ad.price))).toEqual([1, 2, 3]);
      expect(descending.data.map((ad) => Number(ad.price))).toEqual([
        10000, 9999, 9998,
      ]);
      const newest = await ads.publicList({
        keyword: prefix,
        sort: AdSort.NEWEST,
        limit: 2,
      });
      const oldest = await ads.publicList({
        keyword: prefix,
        sort: AdSort.OLDEST,
        limit: 2,
      });
      expect(newest.data.map((ad) => Number(ad.price))).toEqual([10000, 9999]);
      expect(oldest.data.map((ad) => Number(ad.price))).toEqual([1, 2]);

      const firstPage = await ads.publicList({
        keyword: prefix,
        page: 1,
        limit: 100,
      });
      const secondPage = await ads.publicList({
        keyword: prefix,
        page: 2,
        limit: 100,
      });
      const firstIds = new Set(firstPage.data.map((ad) => ad.id));
      expect(secondPage.meta.total).toBe(10000);
      expect(secondPage.data.every((ad) => !firstIds.has(ad.id))).toBe(true);

      const empty = await ads.publicList({ keyword: `${prefix}-missing` });
      expect(empty.meta.total).toBe(0);
      expect(empty.data).toHaveLength(0);

      const parentQuery = await ads.publicList({ category: `${prefix}-motor` });
      const childQuery = await ads.publicList({
        category: `${prefix}-motor`,
        subcategory: `${prefix}-cars`,
      });
      expect(parentQuery.meta.total).toBe(10000);
      expect(childQuery.meta.total).toBe(10000);
      expect(parentQuery.data[0]?.category.id).toBe(childCategoryId);
    }, 120000);

    it('enforces Watchlist uniqueness and user-scoped operations on PostgreSQL', async () => {
      const target = await prisma.ad.findUniqueOrThrow({
        where: { slug: `${prefix}-1` },
      });

      {
        const banner = await prisma.banner.create({
          data: {
            sponsor: 'Local sponsor',
            title: `${prefix} banner`,
            description: 'Integration test banner content',
            imageUrl: 'https://example.test/banner.jpg',
            placement: 'HOME',
          },
        });
        expect(banner.sponsor).toBe('Local sponsor');
        expect(banner.description).toBe('Integration test banner content');

        const target = await prisma.ad.findUniqueOrThrow({
          where: { slug: `${prefix}-2` },
        });
        const sendListingEnquiry = jest.fn().mockResolvedValue(true);
        const contact = new ContactService(
          prisma,
          {
            ensureAvailable: jest.fn(),
            sendListingEnquiry,
          } as unknown as EmailService,
          new ConfigService({ ADMIN_EMAIL: '' }),
        );
        const receipt = await contact.submit({
          name: 'Test buyer',
          email: 'buyer@example.test',
          subject: 'Question about a car',
          message: 'Is this listing still available?',
          adId: target.id,
        });
        expect(receipt.sellerNotified).toBe(true);
        expect(receipt.adId).toBe(target.id);
        expect(sendListingEnquiry).toHaveBeenCalledWith(
          expect.objectContaining({
            to: emailA,
            adTitle: `${prefix}-common-2`,
          }),
        );

        const publicResults = await ads.publicList({
          keyword: `${prefix}-common-2`,
        });
        expect(Object.hasOwn(publicResults.data[0]?.user ?? {}, 'email')).toBe(
          false,
        );
        await prisma.banner.delete({ where: { id: banner.id } });
        await prisma.contactSubmission.delete({ where: { id: receipt.id } });
      }
      await expect(watchlist.add(userAId, target.id)).resolves.toEqual({
        saved: true,
      });
      await expect(watchlist.add(userAId, target.id)).resolves.toEqual({
        saved: true,
      });
      expect(
        await prisma.watchlist.count({
          where: { userId: userAId, adId: target.id },
        }),
      ).toBe(1);
      await expect(
        prisma.watchlist.create({
          data: { userId: userAId, adId: target.id },
        }),
      ).rejects.toMatchObject({ code: 'P2002' });

      expect(await watchlist.isSaved(userAId, target.id)).toEqual({
        saved: true,
      });
      expect(await watchlist.isSaved(userBId, target.id)).toEqual({
        saved: false,
      });
      expect((await watchlist.list(userAId)).map((ad) => ad.id)).toContain(
        target.id,
      );
      expect(await watchlist.list(userBId)).toHaveLength(0);

      await watchlist.remove(userBId, target.id);
      expect(
        await prisma.watchlist.count({
          where: { userId: userAId, adId: target.id },
        }),
      ).toBe(1);
      await watchlist.remove(userAId, target.id);
      expect(await watchlist.isSaved(userAId, target.id)).toEqual({
        saved: false,
      });

      await watchlist.add(userAId, target.id);
      await prisma.ad.delete({ where: { id: target.id } });
      expect(await prisma.watchlist.count({ where: { adId: target.id } })).toBe(
        0,
      );

      const survivingAd = await prisma.ad.findUniqueOrThrow({
        where: { slug: `${prefix}-2` },
      });
      await watchlist.add(userBId, survivingAd.id);
      await prisma.user.delete({ where: { id: userBId } });
      expect(await prisma.watchlist.count({ where: { userId: userBId } })).toBe(
        0,
      );
      await expect(
        prisma.ad.findUniqueOrThrow({ where: { id: survivingAd.id } }),
      ).resolves.toBeDefined();
    });

    it('persists category attributes, filters them in SQL, and scopes saved searches', async () => {
      const motor = await prisma.category.findUniqueOrThrow({
        where: { slug: 'motor' },
      });
      const ad = await prisma.ad.create({
        data: {
          title: `${prefix} Toyota`,
          slug: `${prefix}-attributes`,
          description:
            'Synthetic structured listing for local integration testing.',
          price: new Prisma.Decimal(14990),
          status: AdStatus.APPROVED,
          userId: userAId,
          categoryId: motor.id,
          locationId,
          attributes: {
            make: 'Toyota',
            model: 'Aqua',
            year: 2022,
            mileage: 45000,
            condition: 'Used',
          },
        },
      });

      const matches = await ads.publicList({
        keyword: prefix,
        category: 'motor',
        attributes: JSON.stringify({
          make: 'Toyota',
          year: { min: 2020, max: 2024 },
        }),
        limit: 10,
      });
      expect(matches.meta.total).toBe(1);
      expect(matches.data[0]?.id).toBe(ad.id);
      await expect(
        ads.publicList({
          keyword: prefix,
          category: 'motor',
          attributes: JSON.stringify({ year: { min: 2024, max: 2025 } }),
        }),
      ).resolves.toMatchObject({ meta: { total: 0 } });

      await savedSearches.save(userAId, {
        name: 'Toyota under 20k',
        query: { q: 'Toyota', maxPrice: 20000 },
      });
      expect(await savedSearches.list(userAId)).toHaveLength(1);
      expect(await savedSearches.list(userBId)).toHaveLength(0);
      await expect(
        savedSearches.remove(
          userBId,
          (await savedSearches.list(userAId))[0].id,
        ),
      ).rejects.toThrow('Saved search not found');
      await savedSearches.remove(
        userAId,
        (await savedSearches.list(userAId))[0].id,
      );
      expect(await savedSearches.list(userAId)).toHaveLength(0);
    });
  },
);
