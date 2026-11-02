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
import type { CurrentUser } from '../common/current-user.type';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SaveSearchDto } from './dto/save-search.dto';
import { SavedSearchService } from './saved-search.service';

@Controller('saved-searches')
@UseGuards(JwtAuthGuard)
export class SavedSearchController {
  constructor(private readonly searches: SavedSearchService) {}

  @Get()
  list(@CurrentUserDecorator() user: CurrentUser) {
    return this.searches.list(user.id);
  }

  @Post()
  save(@CurrentUserDecorator() user: CurrentUser, @Body() dto: SaveSearchDto) {
    return this.searches.save(user.id, dto);
  }

  @Delete(':id')
  remove(@CurrentUserDecorator() user: CurrentUser, @Param('id') id: string) {
    return this.searches.remove(user.id, id);
  }
}
