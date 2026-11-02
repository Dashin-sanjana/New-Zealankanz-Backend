import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SaveSearchDto } from './dto/save-search.dto';

const allowedKeys = new Set([
  'q',
  'keyword',
  'category',
  'subcategory',
  'location',
  'minPrice',
  'maxPrice',
  'sort',
  'attributes',
]);
const allowedSorts = new Set(['newest', 'oldest', 'price_asc', 'price_desc']);
const maxSavedSearches = 20;

@Injectable()
export class SavedSearchService {
  constructor(private readonly prisma: PrismaService) {}

  list(userId: string) {
    return this.prisma.savedSearch.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, name: true, query: true, createdAt: true },
    });
  }

  async save(userId: string, dto: SaveSearchDto) {
    const name = dto.name.trim();
    const query = this.sanitizeQuery(dto.query);
    const compound = { userId_name: { userId, name } };
    return this.prisma.$transaction(async (transaction) => {
      const existing = await transaction.savedSearch.findUnique({
        where: compound,
        select: { id: true },
      });
      if (
        !existing &&
        (await transaction.savedSearch.count({ where: { userId } })) >=
          maxSavedSearches
      ) {
        throw new BadRequestException(
          `You can save up to ${maxSavedSearches} searches.`,
        );
      }
      return transaction.savedSearch.upsert({
        where: compound,
        create: { userId, name, query },
        update: { query },
        select: { id: true, name: true, query: true, createdAt: true },
      });
    });
  }

  async remove(userId: string, id: string) {
    const result = await this.prisma.savedSearch.deleteMany({
      where: { id, userId },
    });
    if (!result.count) throw new NotFoundException('Saved search not found.');
    return { deleted: true };
  }

  private sanitizeQuery(input: Record<string, unknown>): Prisma.InputJsonValue {
    if (JSON.stringify(input).length > 4000)
      throw new BadRequestException('Saved search filters are too large.');
    const query: Record<string, string | number | Prisma.InputJsonValue> = {};
    for (const [key, value] of Object.entries(input)) {
      if (!allowedKeys.has(key) || key === 'page') continue;
      if (key === 'minPrice' || key === 'maxPrice') {
        if (value === '') continue;
        const amount = Number(value);
        if (!Number.isFinite(amount) || amount < 0)
          throw new BadRequestException(
            `${key} must be a non-negative number.`,
          );
        query[key] = amount;
      } else if (key === 'sort') {
        if (typeof value !== 'string' || !allowedSorts.has(value))
          throw new BadRequestException('Sort option is invalid.');
        query[key] = value;
      } else if (key === 'attributes') {
        if (!value || typeof value !== 'object' || Array.isArray(value))
          throw new BadRequestException('Attribute filters must be an object.');
        query[key] = value;
      } else if (typeof value === 'string') {
        const normalized = value.trim();
        if (normalized.length > 200)
          throw new BadRequestException(`${key} is too long.`);
        if (normalized) query[key] = normalized;
      } else {
        throw new BadRequestException(`${key} has an invalid value.`);
      }
    }
    return query;
  }
}
