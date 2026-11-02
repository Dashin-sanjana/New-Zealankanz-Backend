import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { AdStatus, NotificationType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { NotificationService } from '../notification/notification.service';
import { getPagination, paginated } from '../common/pagination';
import { toSlug } from '../common/slug';
import { optimizeImage } from '../common/optimize-image';
import { StorageService } from '../storage/storage.service';
import {
  getCategoryFields,
  validateCategoryAttributes,
} from '../category/category-fields';

type StoredAd = Prisma.AdGetPayload<{ include: typeof adInclude }>;
import { AdQueryDto, AdSort, UpsertAdDto } from './dto/ad.dto';

const adInclude = {
  category: { include: { parent: true } },
  location: true,
  images: { orderBy: { sortOrder: 'asc' as const } },
  user: { select: { id: true, name: true, email: true } },
};

const publicAdSelect = {
  id: true,
  title: true,
  slug: true,
  description: true,
  price: true,
  status: true,
  featured: true,
  createdAt: true,
  attributes: true,
  contactName: true,
  contactPhone: true,
  demoContent: true,
  sourceUrl: true,
  priceCurrency: true,
  priceLabel: true,
  priceType: true,
  category: {
    select: {
      id: true,
      name: true,
      slug: true,
      parent: { select: { id: true, name: true, slug: true } },
    },
  },
  location: { select: { id: true, name: true, slug: true } },
  images: {
    select: { id: true, url: true, sortOrder: true },
    orderBy: { sortOrder: 'asc' as const },
  },
};

const publicAdDetailSelect = {
  ...publicAdSelect,
};

@Injectable()
export class AdService {
  private readonly logger = new Logger(AdService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: EmailService,
    private readonly notifications: NotificationService,
    private readonly storage: StorageService,
  ) {}

  async publicList(query: AdQueryDto) {
    return this.list(
      query,
      { status: AdStatus.APPROVED },
      { select: publicAdSelect },
    );
  }

  async adminList(query: AdQueryDto) {
    return this.list(query, query.status ? { status: query.status } : {});
  }

  async pending(query: AdQueryDto) {
    return this.list(query, { status: AdStatus.PENDING });
  }

  async publicBySlug(slug: string) {
    const ad = await this.prisma.ad.findFirst({
      where: { slug, status: AdStatus.APPROVED },
      select: publicAdDetailSelect,
    });
    if (!ad) throw new NotFoundException('Ad not found');
    return ad;
  }

  async myAds(userId: string) {
    return this.prisma.ad.findMany({
      where: { userId },
      include: adInclude,
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(userId: string, dto: UpsertAdDto, files: Express.Multer.File[]) {
    await this.validatedAttributes(dto.categoryId, dto.attributes);
    if (files.length > 0) this.storage.ensureAvailable();
    const images = await this.optimizedImageData(files);
    let ad: StoredAd;
    try {
      ad = await this.prisma.$transaction(async (transaction) => {
        const created = await transaction.ad.create({
          data: {
            ...this.adData(dto),
            userId,
            status: AdStatus.PENDING,
            slug: await this.uniqueSlug(dto.title),
            expiresAt: dto.expiresAt
              ? new Date(dto.expiresAt)
              : new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
          },
        });
        if (images.length > 0) {
          await transaction.adImage.createMany({
            data: images.map((image) => ({ ...image, adId: created.id })),
          });
        }
        return transaction.ad.findUniqueOrThrow({
          where: { id: created.id },
          include: adInclude,
        });
      });
    } catch (error) {
      await Promise.all(
        images.map((image) => this.storage.remove(image.filename)),
      );
      throw error;
    }
    await this.notifyAdSubmitted(ad.userId, ad.user.email, ad.title);
    return ad;
  }

  async updateOwn(
    userId: string,
    id: string,
    dto: UpsertAdDto,
    files: Express.Multer.File[],
  ) {
    const existing = await this.prisma.ad.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Ad not found');
    if (existing.userId !== userId) throw new ForbiddenException('Not your ad');
    await this.validatedAttributes(
      dto.categoryId || existing.categoryId,
      dto.attributes,
    );
    const imageCount = await this.prisma.adImage.count({ where: { adId: id } });

    if (files.length > 0) this.storage.ensureAvailable();
    const images = await this.optimizedImageData(files, imageCount);
    let updatedAd: StoredAd;
    try {
      updatedAd = await this.prisma.$transaction(async (transaction) => {
        const updated = await transaction.ad.update({
          where: { id },
          data: {
            ...this.adData(dto),
            slug:
              dto.title === existing.title
                ? existing.slug
                : await this.uniqueSlug(dto.title),
            status: AdStatus.PENDING,
            rejectionReason: null,
          },
        });
        if (images.length > 0) {
          await transaction.adImage.createMany({
            data: images.map((image) => ({ ...image, adId: updated.id })),
          });
        }
        return transaction.ad.findUniqueOrThrow({
          where: { id: updated.id },
          include: adInclude,
        });
      });
    } catch (error) {
      await Promise.all(
        images.map((image) => this.storage.remove(image.filename)),
      );
      throw error;
    }
    return updatedAd;
  }

  async deleteOwn(userId: string, id: string) {
    const existing = await this.prisma.ad.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Ad not found');
    if (existing.userId !== userId) throw new ForbiddenException('Not your ad');
    const deleted = await this.prisma.ad.delete({
      where: { id },
      include: { images: true },
    });
    await this.removeImages(deleted.images.map((image) => image.filename));
    return deleted;
  }

  async approve(id: string) {
    const ad = await this.prisma.ad.update({
      where: { id },
      data: { status: AdStatus.APPROVED, rejectionReason: null },
      include: adInclude,
    });
    await this.notifications.create({
      userId: ad.userId,
      type: NotificationType.AD_APPROVED,
      title: 'Ad approved',
      message: `${ad.title} is now live.`,
    });
    await this.sendEmail(() =>
      this.mail.sendAdApproved(ad.user.email, ad.title),
    );
    return ad;
  }

  async reject(id: string, reason?: string) {
    const ad = await this.prisma.ad.update({
      where: { id },
      data: { status: AdStatus.REJECTED, rejectionReason: reason },
      include: adInclude,
    });
    await this.notifications.create({
      userId: ad.userId,
      type: NotificationType.AD_REJECTED,
      title: 'Ad rejected',
      message: reason ?? `${ad.title} was rejected.`,
    });
    await this.sendEmail(() =>
      this.mail.sendAdRejected(ad.user.email, ad.title, reason),
    );
    return ad;
  }

  setFeatured(id: string, featured: boolean) {
    return this.prisma.ad.update({
      where: { id },
      data: { featured },
      include: adInclude,
    });
  }

  async expire(id: string) {
    const ad = await this.prisma.ad.update({
      where: { id },
      data: { status: AdStatus.EXPIRED, expiresAt: new Date() },
      include: adInclude,
    });
    await this.notifications.create({
      userId: ad.userId,
      type: NotificationType.AD_EXPIRED,
      title: 'Ad expired',
      message: `${ad.title} has expired.`,
    });
    await this.sendEmail(() =>
      this.mail.sendAdExpired(ad.user.email, ad.title),
    );
    return ad;
  }

  adminUpdate(id: string, dto: UpsertAdDto) {
    return this.validatedAttributes(dto.categoryId, dto.attributes).then(() =>
      this.prisma.ad.update({
        where: { id },
        data: this.adData(dto),
        include: adInclude,
      }),
    );
  }

  async adminDelete(id: string) {
    const deleted = await this.prisma.ad.delete({
      where: { id },
      include: { images: true },
    });
    await this.removeImages(deleted.images.map((image) => image.filename));
    return deleted;
  }

  private async list(
    query: AdQueryDto,
    baseWhere: Prisma.AdWhereInput,
    projection: { include?: Prisma.AdInclude; select?: Prisma.AdSelect } = {
      include: adInclude,
    },
  ) {
    if (
      query.minPrice !== undefined &&
      query.maxPrice !== undefined &&
      query.minPrice > query.maxPrice
    ) {
      throw new BadRequestException('minPrice must not exceed maxPrice');
    }

    const { page, limit, skip, take } = getPagination(query);
    const categoryFilter: Prisma.AdWhereInput['category'] = query.subcategory
      ? {
          slug: query.subcategory,
          ...(query.category
            ? { parent: { is: { slug: query.category } } }
            : {}),
        }
      : query.category
        ? {
            OR: [
              { slug: query.category },
              { parent: { is: { slug: query.category } } },
            ],
          }
        : undefined;
    const priceFilter: Prisma.AdWhereInput['price'] =
      query.minPrice !== undefined || query.maxPrice !== undefined
        ? {
            ...(query.minPrice !== undefined
              ? { gte: new Prisma.Decimal(query.minPrice) }
              : {}),
            ...(query.maxPrice !== undefined
              ? { lte: new Prisma.Decimal(query.maxPrice) }
              : {}),
          }
        : undefined;
    const where: Prisma.AdWhereInput = {
      ...baseWhere,
      ...(query.keyword
        ? {
            OR: [
              { title: { contains: query.keyword, mode: 'insensitive' } },
              { description: { contains: query.keyword, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(query.featured ? { featured: query.featured === 'true' } : {}),
      ...(categoryFilter ? { category: categoryFilter } : {}),
      ...(query.location ? { location: { slug: query.location } } : {}),
      ...(priceFilter ? { price: priceFilter } : {}),
      ...(query.attributes || query.priceCurrency
        ? {
            AND: [
              ...(query.attributes
                ? this.attributeFilters(query.attributes, query.category)
                : []),
              ...(query.priceCurrency
                ? [
                    {
                      OR: [
                        { demoContent: false },
                        { priceCurrency: query.priceCurrency.toUpperCase() },
                      ],
                    },
                  ]
                : []),
            ],
          }
        : {}),
    };

    const orderBy: Prisma.AdOrderByWithRelationInput[] =
      query.sort === AdSort.PRICE_ASC
        ? [
            { price: { sort: 'asc', nulls: 'last' } },
            { createdAt: 'desc' },
            { id: 'asc' },
          ]
        : query.sort === AdSort.PRICE_DESC
          ? [
              { price: { sort: 'desc', nulls: 'last' } },
              { createdAt: 'desc' },
              { id: 'asc' },
            ]
          : query.sort === AdSort.OLDEST
            ? [{ createdAt: 'asc' }, { id: 'asc' }]
            : query.sort === AdSort.NEWEST
              ? [{ createdAt: 'desc' }, { id: 'asc' }]
              : [{ featured: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }];

    const dataQuery = projection.select
      ? this.prisma.ad.findMany({
          where,
          select: projection.select,
          skip,
          take,
          orderBy,
        })
      : this.prisma.ad.findMany({
          where,
          include: projection.include || adInclude,
          skip,
          take,
          orderBy,
        });
    const [data, total] = await Promise.all([
      dataQuery,
      this.prisma.ad.count({ where }),
    ]);
    return paginated(data, total, page, limit);
  }

  private adData(dto: UpsertAdDto) {
    return {
      title: dto.title,
      description: dto.description,
      attributes: dto.attributes as Prisma.InputJsonValue | undefined,
      price:
        dto.price === undefined ? undefined : new Prisma.Decimal(dto.price),
      categoryId: dto.categoryId,
      locationId: dto.locationId,
      contactName: dto.contactName,
      contactEmail: dto.contactEmail,
      contactPhone: dto.contactPhone,
      expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
      metaTitle: dto.metaTitle,
      metaDescription: dto.metaDescription,
    };
  }

  private async validatedAttributes(
    categoryId: string,
    input?: Record<string, unknown>,
  ) {
    if (input === undefined) return undefined;
    const category = await this.prisma.category.findUnique({
      where: { id: categoryId },
      include: { parent: true },
    });
    if (!category) throw new NotFoundException('Category not found');
    return validateCategoryAttributes(
      category.parent?.slug || category.slug,
      input,
    );
  }

  private attributeFilters(
    serialized: string,
    categorySlug?: string,
  ): Prisma.AdWhereInput[] {
    let input: unknown;
    try {
      input = JSON.parse(serialized) as unknown;
    } catch {
      throw new BadRequestException('Attribute filters must be valid JSON.');
    }
    if (!input || typeof input !== 'object' || Array.isArray(input))
      throw new BadRequestException('Attribute filters must be an object.');
    const fields = new Map(
      getCategoryFields(categorySlug || '')
        .filter((field) => field.filterable)
        .map((field) => [field.key, field]),
    );
    return Object.entries(input as Record<string, unknown>).map(
      ([key, value]) => {
        const field = fields.get(key);
        if (!field)
          throw new BadRequestException(
            `The ${key} filter is not supported for this category.`,
          );
        if (field.type === 'number') {
          const range =
            typeof value === 'number' ? { min: value, max: value } : value;
          if (!range || typeof range !== 'object' || Array.isArray(range))
            throw new BadRequestException(
              `${field.label} filter must be a number range.`,
            );
          const bounds = range as Record<string, unknown>;
          const min = bounds.min === undefined ? undefined : Number(bounds.min);
          const max = bounds.max === undefined ? undefined : Number(bounds.max);
          if (
            (min !== undefined &&
              (!Number.isFinite(min) || min < (field.min ?? 0))) ||
            (max !== undefined &&
              (!Number.isFinite(max) ||
                max > (field.max ?? Number.MAX_SAFE_INTEGER))) ||
            (min !== undefined && max !== undefined && min > max)
          ) {
            throw new BadRequestException(
              `${field.label} filter range is invalid.`,
            );
          }
          return {
            attributes: {
              path: [key],
              ...(min !== undefined ? { gte: min } : {}),
              ...(max !== undefined ? { lte: max } : {}),
            },
          };
        }
        if (typeof value !== 'string' || value.length > 300)
          throw new BadRequestException(`${field.label} filter must be text.`);
        if (field.type === 'select' && !field.options?.includes(value))
          throw new BadRequestException(
            `Choose a valid ${field.label.toLowerCase()} filter.`,
          );
        return {
          attributes: {
            path: [key],
            ...(field.type === 'text'
              ? { string_contains: value }
              : { equals: value }),
          },
        };
      },
    );
  }

  private async optimizedImageData(
    files: Express.Multer.File[] = [],
    offset = 0,
  ) {
    const results: {
      url: string;
      filename: string;
      mimetype: string;
      size: number;
      sortOrder: number;
    }[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const optimized = await optimizeImage(file.buffer);
        const filename = `${randomUUID()}-optimized.webp`;
        const stored = await this.storage.store(
          optimized,
          filename,
          'image/webp',
        );
        results.push({
          url: stored.url,
          filename: stored.key,
          mimetype: 'image/webp',
          size: optimized.byteLength,
          sortOrder: offset + i,
        });
      } catch {
        await Promise.all(
          results.map((image) => this.storage.remove(image.filename)),
        );
        throw new BadRequestException(
          'One or more uploaded images are invalid or could not be stored.',
        );
      }
    }

    return results;
  }

  private async removeImages(keys: string[]) {
    const results = await Promise.allSettled(
      keys.map((key) => this.storage.remove(key)),
    );
    if (results.some((result) => result.status === 'rejected')) {
      this.logger.warn('Some listing image objects could not be removed.');
    }
  }

  private async uniqueSlug(title: string) {
    const base = toSlug(title);
    let slug = base;
    let index = 1;
    while (await this.prisma.ad.findUnique({ where: { slug } })) {
      index += 1;
      slug = `${base}-${index}`;
    }
    return slug;
  }

  private async notifyAdSubmitted(
    userId: string,
    email: string,
    title: string,
  ) {
    await this.notifications.create({
      userId,
      type: NotificationType.AD_SUBMITTED,
      title: 'Ad submitted',
      message: `${title} is pending admin approval.`,
    });
    await this.sendEmail(() => this.mail.sendAdSubmitted(email, title));
  }

  private async sendEmail(deliver: () => Promise<unknown>) {
    try {
      await deliver();
    } catch {
      this.logger.warn('Marketplace email notification delivery failed.');
    }
  }
}
