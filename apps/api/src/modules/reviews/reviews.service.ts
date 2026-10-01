import { Injectable } from '@nestjs/common';
import { OrderStatus, Prisma, ReviewStatus } from '@fakhri/prisma';
import { AppError, buildMeta, conflict, normalizePagination, notFound } from '@fakhri/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { currentActor } from '../../common/actor-context';
import { OUTBOX_EVENTS } from '../../outbox/event-types';
import { OutboxService } from '../../outbox/outbox.service';
import { AdminListReviewsQueryDto, CreateReviewDto, ListReviewsQueryDto, ModerateReviewDto } from './reviews.dto';

export interface RatingSummary {
  average: string | null;
  count: number;
  /** Counts per star, 1..5. */
  histogram: Record<string, number>;
}

/**
 * Product reviews (REQ-17). Only a customer who bought the product may review it,
 * only once, and nothing is publicly visible until an admin approves it. The
 * verified badge is stricter still: it needs an order that actually arrived.
 */
@Injectable()
export class ReviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
  ) {}

  async create(customerId: string, dto: CreateReviewDto) {
    const product = await this.prisma.product.findUnique({
      where: { id: dto.productId },
      select: { id: true },
    });
    if (!product) throw notFound('Product');

    const orders = await this.prisma.order.findMany({
      where: { customerId, items: { some: { variant: { productId: dto.productId } } } },
      select: { status: true },
    });
    if (orders.length === 0) {
      throw new AppError('FORBIDDEN', 'You can review a product after you have ordered it');
    }
    // Verified means delivered, not merely ordered.
    const isVerifiedPurchase = orders.some((order) => order.status === OrderStatus.DELIVERED);

    const existing = await this.prisma.review.findUnique({
      where: { customerId_productId: { customerId, productId: dto.productId } },
      select: { id: true },
    });
    if (existing) throw conflict('You have already reviewed this product');

    const created = await this.prisma.review.create({
      data: {
        customerId,
        productId: dto.productId,
        rating: dto.rating,
        title: dto.title,
        body: dto.body,
        images: dto.images ? (dto.images as unknown as Prisma.InputJsonValue) : undefined,
        isVerifiedPurchase,
        status: ReviewStatus.PENDING,
      },
    });
    await this.audit.log({
      actorType: 'CUSTOMER',
      actorId: customerId,
      action: 'reviews.review.create',
      entityType: 'Review',
      entityId: created.id,
      after: { productId: dto.productId, rating: dto.rating },
    });

    return {
      id: created.id,
      status: created.status,
      isVerifiedPurchase,
      /** Moderation happens before display, so say so rather than implying it is live. */
      message: 'Thank you. Your review will appear once it has been checked.',
    };
  }

  /** Approved reviews only, with the rating summary the PDP shows (REQ-17). */
  async listPublic(query: ListReviewsQueryDto) {
    const { skip, take } = normalizePagination(query);
    const where: Prisma.ReviewWhereInput = { productId: query.productId, status: ReviewStatus.APPROVED };
    const [total, rows, summary] = await Promise.all([
      this.prisma.review.count({ where }),
      this.prisma.review.findMany({
        where,
        orderBy: [{ isVerifiedPurchase: 'desc' }, { createdAt: 'desc' }],
        skip,
        take,
        include: { customer: { select: { firstName: true } } },
      }),
      this.summaryFor(query.productId),
    ]);

    return {
      items: rows.map((row) => ({
        rating: row.rating,
        title: row.title,
        body: row.body,
        images: row.images,
        isVerifiedPurchase: row.isVerifiedPurchase,
        // First name only: a review is public, the account is not.
        author: row.customer.firstName ?? 'Customer',
        createdAt: row.createdAt.toISOString(),
      })),
      meta: { ...buildMeta(total, skip, take), summary },
    };
  }

  /** Average and distribution over approved reviews. */
  async summaryFor(productId: string): Promise<RatingSummary> {
    const rows = await this.prisma.review.groupBy({
      by: ['rating'],
      where: { productId, status: ReviewStatus.APPROVED },
      _count: { _all: true },
    });
    const histogram: Record<string, number> = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 };
    let count = 0;
    let weighted = 0;
    for (const row of rows) {
      histogram[String(row.rating)] = row._count._all;
      count += row._count._all;
      weighted += row.rating * row._count._all;
    }
    return {
      average: count === 0 ? null : (weighted / count).toFixed(2),
      count,
      histogram,
    };
  }

  async listForAdmin(query: AdminListReviewsQueryDto) {
    const { skip, take } = normalizePagination(query);
    const where: Prisma.ReviewWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.productId) where.productId = query.productId;

    const [total, rows] = await Promise.all([
      this.prisma.review.count({ where }),
      this.prisma.review.findMany({
        where,
        orderBy: { createdAt: 'asc' },
        skip,
        take,
        include: {
          product: { select: { slug: true, name: true } },
          customer: { select: { id: true, phone: true } },
        },
      }),
    ]);
    return {
      items: rows.map((row) => ({
        id: row.id,
        status: row.status,
        rating: row.rating,
        title: row.title,
        body: row.body,
        isVerifiedPurchase: row.isVerifiedPurchase,
        product: row.product,
        customerId: row.customer.id,
        createdAt: row.createdAt.toISOString(),
      })),
      meta: buildMeta(total, skip, take),
    };
  }

  /** Approve or reject (REQ-17: moderation before display). */
  async moderate(id: string, dto: ModerateReviewDto) {
    const existing = await this.prisma.review.findUnique({ where: { id } });
    if (!existing) throw notFound('Review');
    if (existing.status === dto.status) {
      throw conflict(`This review is already ${dto.status.toLowerCase()}`);
    }

    // Only a change into or out of APPROVED alters what shoppers see.
    const visibilityChanged = existing.status === ReviewStatus.APPROVED || dto.status === ReviewStatus.APPROVED;
    const updated = await this.prisma.$transaction(async (tx) => {
      const review = await tx.review.update({
        where: { id },
        data: { status: dto.status },
        include: { product: { select: { slug: true } } },
      });
      await this.audit.log(
        {
          actorType: 'ADMIN',
          actorId: currentActor()?.principal?.id,
          action: 'reviews.review.moderate',
          entityType: 'Review',
          entityId: id,
          before: { status: existing.status },
          after: { status: dto.status, note: dto.note },
        },
        tx,
      );
      if (visibilityChanged) {
        await this.outbox.enqueue(
          {
            type: OUTBOX_EVENTS.REVIEW_MODERATED,
            aggregateType: 'Review',
            aggregateId: id,
            payload: { reviewId: id, productId: review.productId, slug: review.product.slug, status: dto.status },
          },
          tx,
        );
      }
      return review;
    });
    return { id: updated.id, status: updated.status };
  }
}
