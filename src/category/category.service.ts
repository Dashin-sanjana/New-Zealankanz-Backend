import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { toSlug } from '../common/slug';
import { CategoryDto } from './dto/category.dto';

@Injectable()
export class CategoryService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.category.findMany({
      where: { parentId: null },
      include: { children: { orderBy: { name: 'asc' } } },
      orderBy: { name: 'asc' },
    });
  }

  async bySlug(slug: string) {
    const category = await this.prisma.category.findUnique({
      where: { slug },
      include: { parent: true, children: { orderBy: { name: 'asc' } } },
    });
    if (!category) throw new NotFoundException('Category not found');
    return category;
  }

  async create(dto: CategoryDto) {
    return this.prisma.category.create({
      data: {
        ...dto,
        slug: dto.slug ? toSlug(dto.slug) : toSlug(dto.name),
      },
    });
  }

  async update(id: string, dto: CategoryDto) {
    return this.prisma.category.update({
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
    return this.prisma.category.delete({ where: { id } });
  }
}
