import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AdService } from './ad.service';
import { AdQueryDto, RejectAdDto, UpsertAdDto } from './dto/ad.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/ads')
export class AdminAdController {
  constructor(private readonly ads: AdService) {}

  @Get()
  list(@Query() query: AdQueryDto) {
    return this.ads.adminList(query);
  }

  @Get('pending')
  pending(@Query() query: AdQueryDto) {
    return this.ads.pending(query);
  }

  @Patch(':id/approve')
  approve(@Param('id') id: string) {
    return this.ads.approve(id);
  }

  @Patch(':id/reject')
  reject(@Param('id') id: string, @Body() dto: RejectAdDto) {
    return this.ads.reject(id, dto.reason);
  }

  @Patch(':id/feature')
  feature(@Param('id') id: string) {
    return this.ads.setFeatured(id, true);
  }

  @Patch(':id/unfeature')
  unfeature(@Param('id') id: string) {
    return this.ads.setFeatured(id, false);
  }

  @Patch(':id/expire')
  expire(@Param('id') id: string) {
    return this.ads.expire(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpsertAdDto) {
    return this.ads.adminUpdate(id, dto);
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.ads.adminDelete(id);
  }
}
