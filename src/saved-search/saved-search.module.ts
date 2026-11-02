import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SavedSearchController } from './saved-search.controller';
import { SavedSearchService } from './saved-search.service';

@Module({
  imports: [PrismaModule],
  controllers: [SavedSearchController],
  providers: [SavedSearchService],
})
export class SavedSearchModule {}
