import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { AdStatus } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { ContactSubmissionDto } from './dto/contact-submission.dto';

@Injectable()
export class ContactService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: EmailService,
    private readonly config: ConfigService,
  ) {}

  async submit(dto: ContactSubmissionDto) {
    const ad = dto.adId
      ? await this.prisma.ad.findFirst({
          where: {
            id: dto.adId,
            status: AdStatus.APPROVED,
            OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
          },
          select: {
            id: true,
            title: true,
            contactEmail: true,
            demoContent: true,
            user: { select: { email: true } },
          },
        })
      : null;
    if (dto.adId && !ad) {
      throw new NotFoundException('Approved listing not found');
    }
    if (ad?.demoContent) {
      throw new ForbiddenException(
        'Demo listings do not accept seller enquiries.',
      );
    }
    this.mail.ensureAvailable();
    const adminEmail = this.config.get<string>('ADMIN_EMAIL');
    if (!ad && !adminEmail) {
      throw new ServiceUnavailableException(
        'Contact delivery is temporarily unavailable.',
      );
    }

    const submission = await this.prisma.contactSubmission.create({
      data: {
        name: dto.name,
        email: dto.email,
        subject: dto.subject,
        message: dto.message,
        adId: ad?.id,
      },
    });
    let sellerNotified: boolean | null = null;
    if (ad) {
      await this.mail.sendListingEnquiry({
        to: ad.contactEmail || ad.user.email,
        senderName: dto.name,
        senderEmail: dto.email,
        adTitle: ad.title,
        message: dto.message,
      });
      sellerNotified = true;
    }
    if (adminEmail) {
      await this.mail.sendAdminContactNotification(adminEmail, dto.subject);
    }
    return { ...submission, sellerNotified };
  }

  list() {
    return this.prisma.contactSubmission.findMany({
      include: { ad: { select: { id: true, title: true, slug: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  listForSeller(userId: string) {
    return this.prisma.contactSubmission.findMany({
      where: { ad: { is: { userId } } },
      include: { ad: { select: { id: true, title: true, slug: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  read(id: string) {
    return this.prisma.contactSubmission.update({
      where: { id },
      data: { readAt: new Date() },
    });
  }
}
