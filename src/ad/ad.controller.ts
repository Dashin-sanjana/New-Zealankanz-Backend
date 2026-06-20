import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { CacheInterceptor } from '@nestjs/cache-manager';
import { FilesInterceptor } from '@nestjs/platform-express';
import { CurrentUserDecorator } from '../auth/decorators/current-user.decorator';
import type { CurrentUser } from '../common/current-user.type';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdService } from './ad.service';
import { AdQueryDto, UpsertAdDto } from './dto/ad.dto';

@Controller('ads')
export class AdController {
  constructor(private readonly ads: AdService) {}

  @UseInterceptors(CacheInterceptor)
  @Get()
  list(@Query() query: AdQueryDto) {
    return this.ads.publicList(query);
  }

  @UseInterceptors(CacheInterceptor)
  @Get('slug/:slug')
  bySlug(@Param('slug') slug: string) {
    return this.ads.publicBySlug(slug);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me/list')
  myAds(@CurrentUserDecorator() user: CurrentUser) {
    return this.ads.myAds(user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  @UseInterceptors(FilesInterceptor('images', 10))
  create(
    @CurrentUserDecorator() user: CurrentUser,
    @Body() dto: UpsertAdDto,
    @UploadedFiles() files: Express.Multer.File[] = [],
  ) {
    return this.ads.create(user.id, dto, files);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id')
  @UseInterceptors(FilesInterceptor('images', 10))
  update(
    @CurrentUserDecorator() user: CurrentUser,
    @Param('id') id: string,
    @Body() dto: UpsertAdDto,
    @UploadedFiles() files: Express.Multer.File[] = [],
  ) {
    return this.ads.updateOwn(user.id, id, dto, files);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  delete(@CurrentUserDecorator() user: CurrentUser, @Param('id') id: string) {
    return this.ads.deleteOwn(user.id, id);
  }
}
