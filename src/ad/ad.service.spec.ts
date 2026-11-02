import { BadRequestException } from '@nestjs/common';
import { AdStatus, Prisma } from '@prisma/client';
import { EmailService } from '../email/email.service';
import { NotificationService } from '../notification/notification.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { AdSort } from './dto/ad.dto';
import { AdService } from './ad.service';

describe('AdService public search', () => {
  const makeService = () => {
    const findMany = jest.fn((args: Prisma.AdFindManyArgs) => {
      void args;
      return Promise.resolve([] as never[]);
    });
    const count = jest.fn((args: Prisma.AdCountArgs) => {
      void args;
      return Promise.resolve(0);
    });
    const prisma = {
      ad: { findMany, count },
    } as unknown as PrismaService;
    return {
      prisma,
      findMany,
      count,
      service: new AdService(
        prisma,
        {} as EmailService,
        {} as NotificationService,
        {} as StorageService,
      ),
    };
  };

  it('filters before pagination and returns the total matching count', async () => {
    const { findMany, count, service } = makeService();
    count.mockResolvedValue(61);

    const result = await service.publicList({
      keyword: 'hybrid',
      category: 'motor',
      subcategory: 'cars',
      location: 'christchurch',
      minPrice: 5000,
      maxPrice: 20000,
      featured: 'true',
      sort: AdSort.PRICE_ASC,
      page: 3,
      limit: 25,
    });

    const query = findMany.mock.calls[0]?.[0];
    const countQuery = count.mock.calls[0]?.[0];
    expect(query?.where).toEqual(countQuery?.where);
    expect(query?.where).toMatchObject({
      status: AdStatus.APPROVED,
      featured: true,
      category: { slug: 'cars', parent: { is: { slug: 'motor' } } },
      location: { slug: 'christchurch' },
      price: { gte: new Prisma.Decimal(5000), lte: new Prisma.Decimal(20000) },
    });
    expect(query?.skip).toBe(50);
    expect(query?.take).toBe(25);
    expect(query?.orderBy).toEqual([
      { price: { sort: 'asc', nulls: 'last' } },
      { createdAt: 'desc' },
      { id: 'asc' },
    ]);
    expect(result.meta).toEqual({ total: 61, page: 3, limit: 25, pages: 3 });
  });

  const orderCases: Array<[AdSort, Prisma.AdOrderByWithRelationInput[]]> = [
    [AdSort.NEWEST, [{ createdAt: 'desc' }, { id: 'asc' }]],
    [AdSort.OLDEST, [{ createdAt: 'asc' }, { id: 'asc' }]],
    [
      AdSort.PRICE_DESC,
      [
        { price: { sort: 'desc', nulls: 'last' } },
        { createdAt: 'desc' },
        { id: 'asc' },
      ],
    ],
  ];

  it.each(orderCases)(
    'uses deterministic ordering for %s',
    async (sort, orderBy) => {
      const { findMany, service } = makeService();
      await service.publicList({ sort });
      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy }),
      );
    },
  );

  it('includes child categories when searching a parent category', async () => {
    const { findMany, service } = makeService();
    await service.publicList({ category: 'property' });
    const query = findMany.mock.calls[0]?.[0];
    expect(query?.where).toMatchObject({
      status: AdStatus.APPROVED,
      category: {
        OR: [{ slug: 'property' }, { parent: { is: { slug: 'property' } } }],
      },
    });
  });

  it('matches an explicitly selected child only under its selected parent', async () => {
    const { findMany, service } = makeService();
    await service.publicList({ category: 'property', subcategory: 'sale' });
    const query = findMany.mock.calls[0]?.[0];
    expect(query?.where).toMatchObject({
      category: { slug: 'sale', parent: { is: { slug: 'property' } } },
    });
  });

  it('selects only public listing and approved contact fields', async () => {
    const { findMany, service } = makeService();
    await service.publicList({ category: 'motor' });
    const projection = findMany.mock.calls[0]?.[0]?.select;
    expect(projection).toMatchObject({
      id: true,
      title: true,
      contactName: true,
      contactPhone: true,
      images: { select: { id: true, url: true, sortOrder: true } },
    });
    expect(projection).not.toHaveProperty('contactEmail');
    expect(projection).not.toHaveProperty('user');
  });

  it('rejects an inverted price range before querying', async () => {
    const { findMany, count, service } = makeService();
    await expect(
      service.publicList({ minPrice: 100, maxPrice: 50 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(findMany).not.toHaveBeenCalled();
    expect(count).not.toHaveBeenCalled();
  });
});
