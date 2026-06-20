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
import { CategoryService } from './category.service';
import { CategoryDto } from './dto/category.dto';

@Controller('categories')
export class CategoryController {
  constructor(private readonly categories: CategoryService) {}

  @UseInterceptors(CacheInterceptor)
  @Get()
  list() {
    return this.categories.list();
  }

  @UseInterceptors(CacheInterceptor)
  @Get(':slug')
  bySlug(@Param('slug') slug: string) {
    return this.categories.bySlug(slug);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post('admin')
  create(@Body() dto: CategoryDto) {
    return this.categories.create(dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Patch('admin/:id')
  update(@Param('id') id: string, @Body() dto: CategoryDto) {
    return this.categories.update(id, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Delete('admin/:id')
  delete(@Param('id') id: string) {
    return this.categories.delete(id);
  }
}
