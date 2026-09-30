import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import { UserRole } from '@fakhri/prisma';
import { CustomerRoute, Public, RateLimit, Roles } from '../auth/auth.decorators';
import { CurrentCustomer } from '../auth/principal';
import { AdminListReviewsQueryDto, CreateReviewDto, ListReviewsQueryDto, ModerateReviewDto } from './reviews.dto';
import { ReviewsService } from './reviews.service';

@Controller('reviews')
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  /** Approved reviews plus the rating summary (REQ-17). */
  @Public()
  @Get()
  async list(@Query() query: ListReviewsQueryDto) {
    const result = await this.reviews.listPublic(query);
    return { data: result.items, meta: result.meta };
  }

  @CustomerRoute()
  // Per account: a household or office shares one address, and one customer can
  // only review products they bought anyway.
  @RateLimit({ limit: 10, windowSeconds: 3600, byPrincipal: true })
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@CurrentCustomer() customerId: string, @Body() dto: CreateReviewDto) {
    return { data: await this.reviews.create(customerId, dto) };
  }
}

/** Moderation sits with the people who answer for published content and customers. */
@Controller('admin/reviews')
@Roles(UserRole.MARKETING, UserRole.SUPPORT)
export class AdminReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Get()
  async list(@Query() query: AdminListReviewsQueryDto) {
    const result = await this.reviews.listForAdmin(query);
    return { data: result.items, meta: result.meta };
  }

  @Patch(':id')
  async moderate(@Param('id') id: string, @Body() dto: ModerateReviewDto) {
    return { data: await this.reviews.moderate(id, dto) };
  }
}
