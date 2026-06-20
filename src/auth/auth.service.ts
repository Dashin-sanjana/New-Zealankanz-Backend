import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { NotificationType } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { NotificationService } from '../notification/notification.service';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly mail: EmailService,
    private readonly notifications: NotificationService,
  ) {}

  async register(dto: RegisterDto) {
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
    await this.notifications.create({
      userId: user.id,
      type: NotificationType.EMAIL_VERIFICATION,
      title: 'Verify your email',
      message: 'A verification token was issued for your account.',
    });
    await this.mail.sendVerification(user.email, token);

    return { user: this.publicUser(user), verificationToken: token };
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
    });

    return { accessToken, user: this.publicUser(user) };
  }

  async forgotPassword(dto: ForgotPasswordDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });
    if (!user)
      return { message: 'If the email exists, a reset token was sent' };

    const token = randomBytes(32).toString('hex');
    await this.prisma.passwordResetToken.create({
      data: {
        token,
        userId: user.id,
        expiresAt: new Date(Date.now() + 1000 * 60 * 60),
      },
    });
    await this.notifications.create({
      userId: user.id,
      type: NotificationType.PASSWORD_RESET_REQUESTED,
      title: 'Password reset requested',
      message: 'A password reset token was issued for your account.',
    });
    await this.mail.sendPasswordReset(user.email, token);
    return {
      message: 'If the email exists, a reset token was sent',
      resetToken: token,
    };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const token = await this.prisma.passwordResetToken.findUnique({
      where: { token: dto.token },
      include: { user: true },
    });
    if (!token || token.usedAt || token.expiresAt < new Date()) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: token.userId },
        data: { password: await bcrypt.hash(dto.password, 12) },
      }),
      this.prisma.passwordResetToken.update({
        where: { id: token.id },
        data: { usedAt: new Date() },
      }),
    ]);
    return { message: 'Password reset successful' };
  }

  async verifyEmail(tokenValue: string) {
    const token = await this.prisma.emailVerificationToken.findUnique({
      where: { token: tokenValue },
    });
    if (!token || token.usedAt || token.expiresAt < new Date()) {
      throw new BadRequestException('Invalid or expired verification token');
    }
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: token.userId },
        data: { emailVerified: true },
      }),
      this.prisma.emailVerificationToken.update({
        where: { id: token.id },
        data: { usedAt: new Date() },
      }),
    ]);
    return { message: 'Email verified' };
  }

  logout() {
    return {
      message:
        'Logout is client-side for stateless JWTs. Remove the access token on the client.',
    };
  }

  private async createEmailVerificationToken(userId: string) {
    const token = randomBytes(32).toString('hex');
    await this.prisma.emailVerificationToken.create({
      data: {
        token,
        userId,
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
      },
    });
    return token;
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
