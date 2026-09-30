import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { NotificationSubscriber } from './notifications.subscriber';

/**
 * Outbox-driven customer notifications (increment 3.6). Console adapter only;
 * provider adapters replace it behind NotificationsService.deliver.
 */
@Module({
  providers: [NotificationsService, NotificationSubscriber],
  exports: [NotificationsService],
})
export class NotificationsModule {}
