import { Module } from '@nestjs/common';
import { RevalidationSubscriber } from './revalidation.subscriber';

/** Outbox-driven storefront cache revalidation (increment 3.8). */
@Module({
  providers: [RevalidationSubscriber],
})
export class RevalidationModule {}
