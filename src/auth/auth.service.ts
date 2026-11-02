import {
  BadRequestException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { NotificationType } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { NotificationService } from '../notification/notification.service';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ResendVerificationDto } from './dto/resend-verification.dto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly mail: EmailService,
    private readonly notifications: NotificationService,
  ) {}

  async register(dto: RegisterDto) {
    this.mail.ensureAvailable();
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });
    if (existing) throw new BadRequestException('Email is already registered');

    const user = await this.prisma.user.create({
      data: {
        email: dto.email.toLowerCase(),
        password: await bcrypt.hash(dto.password, 12),
        name: dto.name,
        phone: dto.phone,
      },
    });
    const token = await this.createEmailVerificationToken(user.id);
    this.notifications
      .create({
        userId: user.id,
        type: NotificationType.EMAIL_VERIFICATION,
        title: 'Verify your email',
        message: 'A verification token was issued for your account.',
      })
      .catch(() =>
        this.logger.warn('Registration notification delivery failed.'),
      );
    await this.mail.sendVerification(user.email, token);

    return {
      user: this.publicUser(user),
      ...(process.env.NODE_ENV === 'demo' &&
      process.env.DEMO_EMAIL_VERIFICATION === 'true'
        ? { demoVerificationToken: token }
        : {}),
    };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });
    if (!user || !(await bcrypt.compare(dto.password, user.password))) {
      throw new UnauthorizedException('Invalid email or password');
    }
    if (!user.active) throw new UnauthorizedException('Inactive account');

    const accessToken = await this.jwt.signAsync({
      sub: user.id,
      email: user.email,
      role: user.role,
      sessionVersion: user.sessionVersion,
    });

    return { accessToken, user: this.publicUser(user) };
  }

  async forgotPassword(dto: ForgotPasswordDto) {
    this.mail.ensureAvailable();
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });
    if (!user)
      return { message: 'If the email exists, a reset token was sent' };

    const token = randomBytes(32).toString('hex');
    await this.prisma.passwordResetToken.create({
      data: {
        token: this.hashToken(token),
        userId: user.id,
        expiresAt: new Date(Date.now() + 1000 * 60 * 60),
      },
    });
    try {
      await this.mail.sendPasswordReset(user.email, token);
    } catch (error) {
      await this.prisma.passwordResetToken
        .delete({ where: { token: this.hashToken(token) } })
        .catch(() => undefined);
      throw error;
    }
    this.notifications
      .create({
        userId: user.id,
        type: NotificationType.PASSWORD_RESET_REQUESTED,
        title: 'Password reset requested',
        message: 'A password reset token was issued for your account.',
      })
      .catch(() =>
        this.logger.warn('Password reset notification delivery failed.'),
      );
    return {
      message: 'If the email exists, a reset token was sent',
    };
  }

  async resetPassword(dto: ResetPasswordDto) {
    this.mail.ensureAvailable();
    const token = await this.prisma.passwordResetToken.findFirst({
      where: { token: { in: [this.hashToken(dto.token), dto.token] } },
      include: { user: true },
    });
    if (!token || token.usedAt || token.expiresAt < new Date()) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    const password = await bcrypt.hash(dto.password, 12);
    await this.prisma.$transaction(async (transaction) => {
      await transaction.user.update({
        where: { id: token.userId },
        data: { password, sessionVersion: { increment: 1 } },
      });
      await transaction.passwordResetToken.update({
        where: { id: token.id },
        data: { usedAt: new Date() },
      });
    });
    return { message: 'Password reset successful' };
  }

  async verifyEmail(tokenValue: string) {
    this.mail.ensureAvailable();
    const token = await this.prisma.emailVerificationToken.findFirst({
      where: { token: { in: [this.hashToken(tokenValue), tokenValue] } },
    });
    if (!token || token.usedAt || token.expiresAt < new Date()) {
      throw new BadRequestException('Invalid or expired verification token');
    }
    await this.prisma.$transaction(async (transaction) => {
      await transaction.user.update({
        where: { id: token.userId },
        data: { emailVerified: true },
      });
      await transaction.emailVerificationToken.update({
        where: { id: token.id },
        data: { usedAt: new Date() },
      });
    });
    return { message: 'Email verified' };
  }

  async logout(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { sessionVersion: { increment: 1 } },
    });
    return { message: 'Logout successful' };
  }

  async resendVerification(dto: ResendVerificationDto) {
    this.mail.ensureAvailable();
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });
    if (!user) {
      return {
        message:
          'If the email is registered, a new verification link has been sent.',
      };
    }
    if (user.emailVerified) {
      throw new BadRequestException('Email is already verified');
    }

    const token = await this.createEmailVerificationToken(user.id);
    this.notifications
      .create({
        userId: user.id,
        type: NotificationType.EMAIL_VERIFICATION,
        title: 'Verify your email',
        message: 'A verification token was issued for your account.',
      })
      .catch(() =>
        this.logger.warn('Verification notification delivery failed.'),
      );
    await this.mail.sendVerification(user.email, token);

    return { message: 'Verification email sent successfully.' };
  }

  private async createEmailVerificationToken(userId: string) {
    const token = randomBytes(32).toString('hex');
    await this.prisma.emailVerificationToken.create({
      data: {
        token: this.hashToken(token),
        userId,
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
      },
    });
    return token;
  }

  private hashToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  private publicUser(user: {
    id: string;
    email: string;
    name: string | null;
    phone: string | null;
    role: string;
    active: boolean;
    emailVerified: boolean;
    createdAt: Date;
  }) {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      phone: user.phone,
      role: user.role,
      active: user.active,
      emailVerified: user.emailVerified,
      createdAt: user.createdAt,
    };
  }
}
