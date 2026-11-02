import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUserDecorator } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { CurrentUser } from '../common/current-user.type';
import { AddWatchlistDto } from './dto/add-watchlist.dto';
import { WatchlistService } from './watchlist.service';

@UseGuards(JwtAuthGuard)
@Controller('watchlist')
export class WatchlistController {
  constructor(private readonly watchlist: WatchlistService) {}

  @Get()
  list(@CurrentUserDecorator() user: CurrentUser) {
    return this.watchlist.list(user.id);
  }

  @Post()
  add(@CurrentUserDecorator() user: CurrentUser, @Body() dto: AddWatchlistDto) {
    return this.watchlist.add(user.id, dto.adId);
  }

  @Get(':adId')
  isSaved(
    @CurrentUserDecorator() user: CurrentUser,
    @Param('adId') adId: string,
  ) {
    return this.watchlist.isSaved(user.id, adId);
  }

  @Delete(':adId')
  remove(
    @CurrentUserDecorator() user: CurrentUser,
    @Param('adId') adId: string,
  ) {
    return this.watchlist.remove(user.id, adId);
  }
}
