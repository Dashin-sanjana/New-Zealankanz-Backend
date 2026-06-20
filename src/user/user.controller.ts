import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { CurrentUserDecorator } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { CurrentUser } from '../common/current-user.type';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ChangePasswordDto, UpdateProfileDto, UpdateUserRoleDto } from './dto/user.dto';
import { UserService } from './user.service';

@UseGuards(JwtAuthGuard)
@Controller('users')
export class UserController {
  constructor(private readonly users: UserService) {}

  @Get('me')
  me(@CurrentUserDecorator() user: CurrentUser) {
    return this.users.me(user.id);
  }

  @Patch('me')
  updateMe(
    @CurrentUserDecorator() user: CurrentUser,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.users.updateMe(user.id, dto);
  }

  @Patch('me/password')
  changePassword(
    @CurrentUserDecorator() user: CurrentUser,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.users.changePassword(user.id, dto);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get('admin')
  list() {
    return this.users.list();
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get('admin/:id')
  detail(@Param('id') id: string) {
    return this.users.detail(id);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @Patch('admin/:id/activate')
  activate(@Param('id') id: string) {
    return this.users.setActive(id, true);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @Patch('admin/:id/deactivate')
  deactivate(@Param('id') id: string) {
    return this.users.setActive(id, false);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @Patch('admin/:id/role')
  setRole(@Param('id') id: string, @Body() dto: UpdateUserRoleDto) {
    return this.users.setRole(id, dto.role);
  }
}
