import { Module } from '@nestjs/common';
import { AdminReviewsController, ReviewsController } from './reviews.controller';
import { ReviewsService } from './reviews.service';

/** Product reviews with moderation (increment 3.7). */
@Module({
  controllers: [ReviewsController, AdminReviewsController],
  providers: [ReviewsService],
  exports: [ReviewsService],
})
export class ReviewsModule {}
