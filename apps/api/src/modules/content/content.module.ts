import { Module } from '@nestjs/common';
import {
  AdminContentController,
  PublicBannersController,
  PublicPagesController,
} from './content.controller';
import { ContentService } from './content.service';

/** Content pages and banners (increment 3.7). */
@Module({
  controllers: [PublicPagesController, PublicBannersController, AdminContentController],
  providers: [ContentService],
  exports: [ContentService],
})
export class ContentModule {}
