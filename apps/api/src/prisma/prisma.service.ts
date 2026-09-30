import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@fakhri/prisma';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('Prisma');

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('connected to postgres');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    this.logger.log('disconnected from postgres');
  }
}