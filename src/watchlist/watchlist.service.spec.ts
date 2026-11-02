import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WatchlistService } from './watchlist.service';

describe('WatchlistService', () => {
  type MockCall = jest.Mock<Promise<unknown>, [unknown]>;
  const makeService = () => {
    const makeMock = (): MockCall => jest.fn<Promise<unknown>, [unknown]>();
    const adFindFirst = makeMock();
    const watchlistFindMany = makeMock();
    const watchlistFindFirst = makeMock();
    const watchlistUpsert = makeMock();
    const watchlistDeleteMany = makeMock();
    const prisma = {
      ad: { findFirst: adFindFirst },
      watchlist: {
        findMany: watchlistFindMany,
        findFirst: watchlistFindFirst,
        upsert: watchlistUpsert,
        deleteMany: watchlistDeleteMany,
      },
    } as unknown as PrismaService;
    return {
      adFindFirst,
      watchlistFindMany,
      watchlistFindFirst,
      watchlistUpsert,
      watchlistDeleteMany,
      service: new WatchlistService(prisma),
    };
  };

  it('lists only the requesting user’s saved ads', async () => {
    const { watchlistFindMany, service } = makeService();
    const ad = { id: 'ad-1' };
    watchlistFindMany.mockResolvedValue([{ ad }]);
    await expect(service.list('user-a')).resolves.toEqual([ad]);
    expect(JSON.stringify(watchlistFindMany.mock.calls[0]?.[0])).toContain(
      'user-a',
    );
    expect(JSON.stringify(watchlistFindMany.mock.calls[0]?.[0])).toContain(
      'APPROVED',
    );
  });

  it('saves with the unique user/ad key', async () => {
    const { adFindFirst, watchlistUpsert, service } = makeService();
    adFindFirst.mockResolvedValue({ id: 'ad-1' });
    watchlistUpsert.mockResolvedValue({});
    await expect(service.add('user-a', 'ad-1')).resolves.toEqual({
      saved: true,
    });
    expect(watchlistUpsert.mock.calls[0]?.[0]).toEqual({
      where: { userId_adId: { userId: 'user-a', adId: 'ad-1' } },
      create: { userId: 'user-a', adId: 'ad-1' },
      update: {},
    });
  });

  it('does not save an unavailable ad', async () => {
    const { adFindFirst, watchlistUpsert, service } = makeService();
    adFindFirst.mockResolvedValue(null);
    await expect(service.add('user-a', 'ad-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(watchlistUpsert).not.toHaveBeenCalled();
  });

  it('removes only the requesting user’s saved row', async () => {
    const { watchlistDeleteMany, service } = makeService();
    watchlistDeleteMany.mockResolvedValue({ count: 1 });
    await expect(service.remove('user-a', 'ad-1')).resolves.toEqual({
      saved: false,
    });
    expect(watchlistDeleteMany.mock.calls[0]?.[0]).toEqual({
      where: { userId: 'user-a', adId: 'ad-1' },
    });
  });

  it('checks saved state within the requesting user’s scope', async () => {
    const { watchlistFindFirst, service } = makeService();
    watchlistFindFirst.mockResolvedValue({ id: 'saved-1' });
    await expect(service.isSaved('user-a', 'ad-1')).resolves.toEqual({
      saved: true,
    });
    expect(JSON.stringify(watchlistFindFirst.mock.calls[0]?.[0])).toContain(
      'user-a',
    );
    expect(JSON.stringify(watchlistFindFirst.mock.calls[0]?.[0])).toContain(
      'ad-1',
    );
  });
});
