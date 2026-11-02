import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { getJwtSecret } from '../common/runtime-config';

type JwtPayload = {
  sub: string;
  email: string;
  role: UserRole;
  sessionVersion: number;
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: getJwtSecret(),
    });
  }

  async validate(payload: JwtPayload) {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        role: true,
        active: true,
        sessionVersion: true,
      },
    });
    if (!user?.active || user.sessionVersion !== payload.sessionVersion) {
      throw new UnauthorizedException('Session is no longer valid');
    }
    return { id: user.id, email: user.email, role: user.role };
  }
}
