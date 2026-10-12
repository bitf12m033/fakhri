import { Module } from '@nestjs/common';
import { LeadsModule } from '../leads/leads.module';
import { NotificationsService } from './notifications.service';
import { NotificationSubscriber } from './notifications.subscriber';
import { WhatsAppCloudClient } from './whatsapp';
import { WhatsAppWebhookController } from './whatsapp.webhook.controller';

/**
 * Outbox-driven customer notifications (increment 3.6) and WhatsApp campaign
 * delivery (increment 3.10). The console adapter is the default; the Cloud API
 * is used only when NOTIFICATIONS_CHANNEL is whatsapp.
 */
@Module({
  imports: [LeadsModule],
  controllers: [WhatsAppWebhookController],
  providers: [NotificationsService, NotificationSubscriber, WhatsAppCloudClient],
  exports: [NotificationsService],
})
export class NotificationsModule {}
