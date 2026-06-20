import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { ChangePasswordDto, UpdateProfileDto } from './dto/user.dto';

const userSelect = {
  id: true,
  email: true,
  name: true,
  phone: true,
  role: true,
  active: true,
  emailVerified: true,
  createdAt: true,
  updatedAt: true,
};

@Injectable()
export class UserService {
  constructor(private readonly prisma: PrismaService) {}

  me(id: string) {
    return this.prisma.user.findUnique({ where: { id }, select: userSelect });
  }

  updateMe(id: string, dto: UpdateProfileDto) {
    return this.prisma.user.update({
      where: { id },
      data: dto,
      select: userSelect,
    });
  }

  list() {
    return this.prisma.user.findMany({
      select: userSelect,
      orderBy: { createdAt: 'desc' },
    });
  }

  async detail(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        ...userSelect,
        ads: {
          select: { id: true, title: true, status: true, createdAt: true },
        },
      },
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async changePassword(id: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    const valid = await bcrypt.compare(dto.currentPassword, user.password);
    if (!valid) throw new BadRequestException('Current password is incorrect');
    await this.prisma.user.update({
      where: { id },
      data: { password: await bcrypt.hash(dto.newPassword, 12) },
    });
    return { message: 'Password changed successfully' };
  }

  setActive(id: string, active: boolean) {
    return this.prisma.user.update({
      where: { id },
      data: { active },
      select: userSelect,
    });
  }

  setRole(id: string, role: UserRole) {
    return this.prisma.user.update({
      where: { id },
      data: { role },
      select: userSelect,
    });
  }
}
