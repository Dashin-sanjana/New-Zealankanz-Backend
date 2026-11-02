import { Injectable, NotFoundException } from '@nestjs/common';
import { AdStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const watchlistAdInclude = {
  category: { include: { parent: true } },
  location: true,
  images: { orderBy: { sortOrder: 'asc' as const } },
  user: { select: { id: true, name: true } },
};

function availableAdWhere(adId?: string): Prisma.AdWhereInput {
  return {
    ...(adId ? { id: adId } : {}),
    status: AdStatus.APPROVED,
    OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
  };
}

@Injectable()
export class WatchlistService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string) {
    const items = await this.prisma.watchlist.findMany({
      where: { userId, ad: { is: availableAdWhere() } },
      include: { ad: { include: watchlistAdInclude } },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    });
    return items.map(({ ad }) => ad);
  }

  async add(userId: string, adId: string) {
    const ad = await this.prisma.ad.findFirst({
      where: availableAdWhere(adId),
      select: { id: true },
    });
    if (!ad) throw new NotFoundException('Approved listing not found');

    try {
      await this.prisma.watchlist.upsert({
        where: { userId_adId: { userId, adId } },
        create: { userId, adId },
        update: {},
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2003'
      ) {
        throw new NotFoundException('Approved listing not found');
      }
      throw error;
    }
    return { saved: true };
  }

  async remove(userId: string, adId: string) {
    await this.prisma.watchlist.deleteMany({ where: { userId, adId } });
    return { saved: false };
  }

  async isSaved(userId: string, adId: string) {
    const item = await this.prisma.watchlist.findFirst({
      where: {
        userId,
        adId,
        ad: { is: availableAdWhere(adId) },
      },
      select: { id: true },
    });
    return { saved: Boolean(item) };
  }
}
