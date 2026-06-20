import { Injectable } from '@nestjs/common';
import { BannerPlacement, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BannerDto } from './dto/banner.dto';

@Injectable()
export class BannerService {
  constructor(private readonly prisma: PrismaService) {}

  activeByPlacement(placement: BannerPlacement) {
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
