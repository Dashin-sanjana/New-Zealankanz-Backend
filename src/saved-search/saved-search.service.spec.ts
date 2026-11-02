import { BadRequestException, NotFoundException } from '@nestjs/common';
import { SavedSearchService } from './saved-search.service';

function makeService() {
  const savedSearch = {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    count: jest.fn(),
    upsert: jest.fn(),
    deleteMany: jest.fn(),
  };
  const transaction = { savedSearch };
  const prisma = {
    savedSearch,
    $transaction: jest.fn((callback: (tx: typeof transaction) => unknown) =>
      callback(transaction),
    ),
  };
  return {
    service: new SavedSearchService(prisma as never),
    savedSearch,
    prisma,
  };
}

describe('SavedSearchService', () => {
  it('scopes lists to the authenticated account', async () => {
    const { service, savedSearch } = makeService();
    savedSearch.findMany.mockResolvedValue([]);
    await service.list('user-a');
    expect(savedSearch.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user-a' } }),
    );
  });

  it('upserts only the caller named search with normalized supported filters', async () => {
    const { service, savedSearch } = makeService();
    savedSearch.findUnique.mockResolvedValue(null);
    savedSearch.count.mockResolvedValue(0);
    savedSearch.upsert.mockResolvedValue({ id: 'saved-1' });
    await service.save('user-a', {
      name: '  Toyota  ',
      query: {
        q: 'Toyota',
        minPrice: '10000',
        sort: 'price_asc',
        page: '4',
        token: 'ignored',
      },
    });
    expect(savedSearch.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_name: { userId: 'user-a', name: 'Toyota' } },
        create: {
          userId: 'user-a',
          name: 'Toyota',
          query: { q: 'Toyota', minPrice: 10000, sort: 'price_asc' },
        },
      }),
    );
  });

  it('prevents one user deleting another user search and validates saved filters', async () => {
    const { service, savedSearch } = makeService();
    savedSearch.deleteMany.mockResolvedValue({ count: 0 });
    await expect(service.remove('user-b', 'saved-a')).rejects.toThrow(
      NotFoundException,
    );
    expect(savedSearch.deleteMany).toHaveBeenCalledWith({
      where: { id: 'saved-a', userId: 'user-b' },
    });
    await expect(
      service.save('user-a', { name: 'Bad', query: { sort: 'arbitrary' } }),
    ).rejects.toThrow(BadRequestException);
  });

  it('enforces the per-user saved-search limit', async () => {
    const { service, savedSearch } = makeService();
    savedSearch.findUnique.mockResolvedValue(null);
    savedSearch.count.mockResolvedValue(20);
    await expect(
      service.save('user-a', { name: 'Next', query: { q: 'car' } }),
    ).rejects.toThrow(BadRequestException);
    expect(savedSearch.upsert).not.toHaveBeenCalled();
  });
});
