import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { parseEnv } from '@fakhri/config';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { HealthModule } from './health/health.module';
import { OutboxModule } from './outbox/outbox.module';
import { AuditModule } from './audit/audit.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { SearchModule } from './modules/search/search.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: (env) => parseEnv(env),
    }),
    PrismaModule,
    RedisModule,
    HealthModule,
    OutboxModule,
    AuditModule,
    CatalogModule,
    SearchModule,
  ],
})
export class AppModule {}