import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { toSlug } from '../common/slug';
import { LocationDto } from './dto/location.dto';

@Injectable()
export class LocationService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.location.findMany({ orderBy: { name: 'asc' } });
  }

  async bySlug(slug: string) {
    const location = await this.prisma.location.findUnique({ where: { slug } });
    if (!location) throw new NotFoundException('Location not found');
    return location;
  }

  create(dto: LocationDto) {
    return this.prisma.location.create({
      data: { ...dto, slug: dto.slug ? toSlug(dto.slug) : toSlug(dto.name) },
    });
  }

  update(id: string, dto: LocationDto) {
    return this.prisma.location.update({
      where: { id },
      data: {
        ...dto,
        slug: dto.slug
          ? toSlug(dto.slug)
          : dto.name
            ? toSlug(dto.name)
            : undefined,
      },
    });
  }

  delete(id: string) {
    return this.prisma.location.delete({ where: { id } });
  }
}
