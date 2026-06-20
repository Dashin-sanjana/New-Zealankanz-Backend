import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { randomUUID } from 'crypto';
import { mkdirSync } from 'fs';
import { PrismaModule } from '../prisma/prisma.module';
import { EmailModule } from '../email/email.module';
import { NotificationModule } from '../notification/notification.module';
import { AdController } from './ad.controller';
import { AdService } from './ad.service';
import { AdminAdController } from './admin-ad.controller';

@Module({
  imports: [
    PrismaModule,
    EmailModule,
    NotificationModule,
    MulterModule.register({
      storage: diskStorage({
        destination: (_req, _file, cb) => {
          const destination = 'uploads/ads';
          mkdirSync(destination, { recursive: true });
          cb(null, destination);
        },
        filename: (_req, file, cb) =>
          cb(null, `${randomUUID()}${extname(file.originalname)}`),
      }),
      limits: { fileSize: Number(process.env.MAX_UPLOAD_BYTES ?? 5_000_000) },
      fileFilter: (_req, file, cb) => {
        if (
          !['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(
            file.mimetype,
          )
        ) {
          return cb(
            new Error('Only JPEG, PNG, WebP, and GIF images are allowed'),
            false,
          );
        }
        cb(null, true);
      },
    }),
  ],
  controllers: [AdController, AdminAdController],
  providers: [AdService],
})
export class AdModule {}
