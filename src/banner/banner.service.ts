import { BadRequestException, Injectable } from '@nestjs/common';
import { BannerPlacement, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BannerDto } from './dto/banner.dto';

const PLACEMENT_VALUES = new Set<string>(Object.values(BannerPlacement));

@Injectable()
export class BannerService {
  constructor(private readonly prisma: PrismaService) {}

  activeByPlacement(placementParam: string) {
    const placement = this.normalizePlacement(placementParam);
    const now = new Date();
    return this.prisma.banner.findMany({
      where: {
        placement,
        active: true,
        OR: [{ startDate: null }, { startDate: { lte: now } }],
        AND: [{ OR: [{ endDate: null }, { endDate: { gte: now } }] }],
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  adminList() {
    return this.prisma.banner.findMany({ orderBy: { createdAt: 'desc' } });
  }

  create(dto: BannerDto) {
    return this.prisma.banner.create({ data: this.data(dto) });
  }

  update(id: string, dto: BannerDto) {
    return this.prisma.banner.update({ where: { id }, data: this.data(dto) });
  }

  delete(id: string) {
    return this.prisma.banner.delete({ where: { id } });
  }

  private normalizePlacement(placement: string): BannerPlacement {
    const normalized = placement.toUpperCase();
    if (PLACEMENT_VALUES.has(normalized)) {
      return normalized as BannerPlacement;
    }

    const basePlacement = normalized.split('_')[0];
    if (PLACEMENT_VALUES.has(basePlacement)) {
      return basePlacement as BannerPlacement;
    }

    throw new BadRequestException(`Invalid banner placement: ${placement}`);
  }

  private data(dto: BannerDto): Prisma.BannerUncheckedCreateInput {
    return {
      title: dto.title,
      placement: dto.placement,
      imageUrl: dto.imageUrl,
      linkUrl: dto.linkUrl,
      active: dto.active,
      startDate: dto.startDate ? new Date(dto.startDate) : undefined,
      endDate: dto.endDate ? new Date(dto.endDate) : undefined,
    };
  }
}
