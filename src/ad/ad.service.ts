import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { AdStatus, NotificationType, Prisma } from '@prisma/client';
import { extname, join } from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { NotificationService } from '../notification/notification.service';
import { getPagination, paginated } from '../common/pagination';
import { toSlug } from '../common/slug';
import { optimizeImage } from '../common/optimize-image';
import { AdQueryDto, UpsertAdDto } from './dto/ad.dto';

const adInclude = {
  category: { include: { parent: true } },
  location: true,
  images: { orderBy: { sortOrder: 'asc' as const } },
  user: { select: { id: true, name: true, email: true } },
};

@Injectable()
export class AdService {
  private readonly logger = new Logger(AdService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: EmailService,
    private readonly notifications: NotificationService,
  ) {}

  async publicList(query: AdQueryDto) {
    return this.list(query, { status: AdStatus.APPROVED });
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
      include: adInclude,
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
    const ad = await this.prisma.ad.create({
      data: {
        ...this.adData(dto),
        userId,
        status: AdStatus.PENDING,
        slug: await this.uniqueSlug(dto.title),
        expiresAt: dto.expiresAt
          ? new Date(dto.expiresAt)
          : new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
        images: { create: await this.optimizedImageData(files) },
      },
      include: adInclude,
    });
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
    const imageCount = await this.prisma.adImage.count({ where: { adId: id } });

    return this.prisma.ad.update({
      where: { id },
      data: {
        ...this.adData(dto),
        slug:
          dto.title === existing.title
            ? existing.slug
            : await this.uniqueSlug(dto.title),
        status: AdStatus.PENDING,
        rejectionReason: null,
        images: { create: await this.optimizedImageData(files, imageCount) },
      },
      include: adInclude,
    });
  }

  async deleteOwn(userId: string, id: string) {
    const existing = await this.prisma.ad.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Ad not found');
    if (existing.userId !== userId) throw new ForbiddenException('Not your ad');
    return this.prisma.ad.delete({ where: { id } });
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
    await this.mail.sendAdApproved(ad.user.email, ad.title);
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
    await this.mail.sendAdRejected(ad.user.email, ad.title, reason);
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
    await this.mail.sendAdExpired(ad.user.email, ad.title);
    return ad;
  }

  adminUpdate(id: string, dto: UpsertAdDto) {
    return this.prisma.ad.update({
      where: { id },
      data: this.adData(dto),
      include: adInclude,
    });
  }

  adminDelete(id: string) {
    return this.prisma.ad.delete({ where: { id } });
  }

  private async list(query: AdQueryDto, baseWhere: Prisma.AdWhereInput) {
    const { page, limit, skip, take } = getPagination(query);
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
      ...(query.subcategory
        ? { category: { slug: query.subcategory } }
        : query.category
        ? { category: { slug: query.category } }
        : {}),
      ...(query.location ? { location: { slug: query.location } } : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.ad.findMany({
        where,
        include: adInclude,
        skip,
        take,
        orderBy: [{ featured: 'desc' }, { createdAt: 'desc' }],
      }),
      this.prisma.ad.count({ where }),
    ]);
    return paginated(data, total, page, limit);
  }

  private adData(dto: UpsertAdDto) {
    return {
      title: dto.title,
      description: dto.description,
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

  private async optimizedImageData(files: Express.Multer.File[] = [], offset = 0) {
    const results: {
      url: string;
      filename: string;
      mimetype: string;
      size: number;
      sortOrder: number;
    }[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const originalPath = file.path;
      let filename = file.filename;
      let mimetype = file.mimetype;
      let size = file.size;
      let url = `/uploads/ads/${filename}`;

      try {
        const optimizedPath = await optimizeImage(originalPath);
        const optimizedFilename = optimizedPath.split('/').pop() as string;
        filename = optimizedFilename;
        mimetype = 'image/webp';
        url = `/uploads/ads/${optimizedFilename}`;
        // Size will be smaller — set 0 as placeholder (file system read not needed)
        size = file.size;
      } catch (err) {
        this.logger.warn(`Image optimisation failed for ${filename}: ${err}`);
      }

      results.push({ url, filename, mimetype, size, sortOrder: offset + i });
    }

    return results;
  }

  private imageData(files: Express.Multer.File[] = [], offset = 0) {
    return files.map((file, index) => ({
      url: `/uploads/ads/${file.filename}`,
      filename: file.filename,
      mimetype: file.mimetype,
      size: file.size,
      sortOrder: offset + index,
    }));
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
    await this.mail.sendAdSubmitted(email, title);
  }
}
