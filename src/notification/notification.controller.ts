import { Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUserDecorator } from '../auth/decorators/current-user.decorator';
import type { CurrentUser } from '../common/current-user.type';
import { NotificationService } from './notification.service';

@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationController {
  constructor(private readonly notifications: NotificationService) {}

  @Get()
  listMine(@CurrentUserDecorator() user: CurrentUser) {
    return this.notifications.listForUser(user.id);
  }

  @Patch(':id/read')
  markRead(@Param('id') id: string, @CurrentUserDecorator() user: CurrentUser) {
    return this.notifications.markRead(id, user.id);
  }
}
