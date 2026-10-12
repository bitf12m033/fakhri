import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { CampaignsController, CampaignTemplatesController } from './campaigns.controller';
import { CampaignsService } from './campaigns.service';

/** WhatsApp campaign templates and sends (increment 3.10). Marketing role only. */
@Module({
  imports: [NotificationsModule],
  controllers: [CampaignTemplatesController, CampaignsController],
  providers: [CampaignsService],
})
export class CampaignsModule {}
