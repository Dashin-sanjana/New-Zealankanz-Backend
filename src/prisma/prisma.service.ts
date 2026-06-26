import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { describeDatabaseUrl, getDatabaseUrl } from './database-url';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    const connectionString = getDatabaseUrl();
    const pool = new Pool({ connectionString });
    const adapter = new PrismaPg(pool);
    super({ adapter });
  }

  async onModuleInit() {
    await this.$connect();
    try {
      await this.$queryRaw`SELECT 1`;
    } catch (error) {
      throw new Error(
        `Failed to connect to PostgreSQL (${describeDatabaseUrl()}). Check DATABASE_URL credentials and database access.`,
        { cause: error },
      );
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
