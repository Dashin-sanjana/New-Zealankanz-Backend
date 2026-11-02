import {
  Body,
  Controller,
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
import { CurrentUserDecorator } from '../auth/decorators/current-user.decorator';
import type { CurrentUser } from '../common/current-user.type';
import { ContactService } from './contact.service';
import { ContactSubmissionDto } from './dto/contact-submission.dto';
import { Throttle } from '@nestjs/throttler';

@Controller('contact')
export class ContactController {
  constructor(private readonly contact: ContactService) {}

  @Post()
  @Throttle({ default: { limit: 8, ttl: 60_000 } })
  submit(@Body() dto: ContactSubmissionDto) {
    return this.contact.submit(dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  listMine(@CurrentUserDecorator() user: CurrentUser) {
    return this.contact.listForSeller(user.id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get('admin')
  list() {
    return this.contact.list();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Patch('admin/:id/read')
  read(@Param('id') id: string) {
    return this.contact.read(id);
  }
}
