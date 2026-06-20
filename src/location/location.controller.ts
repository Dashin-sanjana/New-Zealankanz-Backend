import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { CacheInterceptor } from '@nestjs/cache-manager';
import { UserRole } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { LocationDto } from './dto/location.dto';
import { LocationService } from './location.service';

@Controller('locations')
export class LocationController {
  constructor(private readonly locations: LocationService) {}

  @UseInterceptors(CacheInterceptor)
  @Get()
  list() {
    return this.locations.list();
  }

  @UseInterceptors(CacheInterceptor)
  @Get(':slug')
  bySlug(@Param('slug') slug: string) {
    return this.locations.bySlug(slug);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post('admin')
  create(@Body() dto: LocationDto) {
    return this.locations.create(dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Patch('admin/:id')
  update(@Param('id') id: string, @Body() dto: LocationDto) {
    return this.locations.update(id, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Delete('admin/:id')
  delete(@Param('id') id: string) {
    return this.locations.delete(id);
  }
}
