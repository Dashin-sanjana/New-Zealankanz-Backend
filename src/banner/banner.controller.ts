import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { BannerService } from './banner.service';
import { BannerDto } from './dto/banner.dto';

@Controller('banners')
export class BannerController {
  constructor(private readonly banners: BannerService) {}

  @Get(':placement')
  active(@Param('placement') placement: string) {
    return this.banners.activeByPlacement(placement);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get('admin/all')
  adminList() {
    return this.banners.adminList();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post('admin')
  create(@Body() dto: BannerDto) {
    return this.banners.create(dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Patch('admin/:id')
  update(@Param('id') id: string, @Body() dto: BannerDto) {
    return this.banners.update(id, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Delete('admin/:id')
  delete(@Param('id') id: string) {
    return this.banners.delete(id);
  }
}
