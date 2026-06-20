import { Injectable } from '@nestjs/common';
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
    const submission = await this.prisma.contactSubmission.create({
      data: dto,
    });
    const adminEmail = this.config.get<string>('ADMIN_EMAIL');
    if (adminEmail) {
      await this.mail.sendAdminContactNotification(adminEmail, dto.subject);
    }
    return submission;
  }

  list() {
    return this.prisma.contactSubmission.findMany({
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
