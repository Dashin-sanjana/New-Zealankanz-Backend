import { Injectable } from '@nestjs/common';
import { AdStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SeoService {
  constructor(private readonly prisma: PrismaService) {}

  async sitemap() {
    const [ads, categories, locations] = await Promise.all([
      this.prisma.ad.findMany({
        where: { status: AdStatus.APPROVED },
        select: {
          slug: true,
          updatedAt: true,
          metaTitle: true,
          metaDescription: true,
        },
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.category.findMany({
        select: {
          slug: true,
          updatedAt: true,
          metaTitle: true,
          metaDescription: true,
        },
      }),
      this.prisma.location.findMany({
        select: {
          slug: true,
          updatedAt: true,
          metaTitle: true,
          metaDescription: true,
        },
      }),
    ]);
    const baseUrl = process.env.PUBLIC_SITE_URL || 'http://localhost:5173';
    const urls = [
      { loc: baseUrl, updatedAt: new Date() },
      ...ads.map((ad) => ({
        loc: `${baseUrl}/ads/${ad.slug}`,
        updatedAt: ad.updatedAt,
      })),
      ...categories.map((category) => ({
        loc: `${baseUrl}/category/${category.slug}`,
        updatedAt: category.updatedAt,
      })),
      ...locations.map((location) => ({
        loc: `${baseUrl}/location/${location.slug}`,
        updatedAt: location.updatedAt,
      })),
    ];

    return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
      .map(
        (url) =>
          `  <url><loc>${url.loc}</loc><lastmod>${url.updatedAt.toISOString()}</lastmod></url>`,
      )
      .join('\n')}\n</urlset>`;
  }
}
