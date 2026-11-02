import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { toSlug } from '../common/slug';
import { CategoryDto } from './dto/category.dto';
import { getCategoryFields } from './category-fields';

@Injectable()
export class CategoryService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    const categories = await this.prisma.category.findMany({
      where: { parentId: null },
      include: { children: { orderBy: { name: 'asc' } } },
      orderBy: { name: 'asc' },
    });
    return categories.map((category) => ({
      ...category,
      fields: getCategoryFields(category.slug),
      capabilities: [
        'server-filtering',
        'category-attributes',
        'saved-searches',
      ],
      children: category.children.map((child) => ({
        ...child,
        fields: getCategoryFields(category.slug),
      })),
    }));
  }

  async bySlug(slug: string) {
    const category = await this.prisma.category.findUnique({
      where: { slug },
      include: { parent: true, children: { orderBy: { name: 'asc' } } },
    });
    if (!category) throw new NotFoundException('Category not found');
    return {
      ...category,
      fields: getCategoryFields(category.parent?.slug || category.slug),
    };
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
