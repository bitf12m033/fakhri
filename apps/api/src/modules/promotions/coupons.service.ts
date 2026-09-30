import { Injectable } from '@nestjs/common';
import { CouponApplies, CouponType, Prisma } from '@fakhri/prisma';
import { AppError, buildMeta, conflict, invalidInput, normalizePagination, notFound } from '@fakhri/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { moneyString } from '../catalog/catalog.serialize';
import { CategoriesService } from '../catalog/categories/categories.service';
import {
  assertRedemptionAllowed,
  CouponLine,
  CouponOutcome,
  CouponTerms,
  evaluateCoupon,
  normalizeCouponCode,
} from './coupon-rules';
import { CreateCouponDto, ListCouponsQueryDto, UpdateCouponDto } from './coupons.dto';

export interface CouponView {
  id: string;
  code: string;
  type: CouponType;
  value: string | null;
  maxDiscount: string | null;
  minOrderValue: string | null;
  usageLimit: number | null;
  perCustomerLimit: number | null
  appliesTo: CouponApplies;
  appliesIds: string[];
  validFrom: string;
  validTo: string | null;
  isActive: boolean;
  timesUsed: number;
  totalDiscount: string | null;
}

/**
 * Coupons (REQ-22/32). One code per order, evaluated by the pure rules and
 * redeemed under a row lock so the usage caps hold under concurrency.
 */
@Injectable()
export class CouponsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly categories: CategoriesService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Load a code's terms. Category coupons are expanded to the whole subtree, so
   * a coupon on "Appliances" covers the categories beneath it.
   */
  async termsFor(code: string): Promise<{ id: string; terms: CouponTerms; usageLimit: number | null; perCustomerLimit: number | null }> {
    const normalized = normalizeCouponCode(code);
    const coupon = await this.prisma.coupon.findUnique({ where: { code: normalized } });
    if (!coupon) throw new AppError('COUPON_INVALID', 'That coupon code is not valid', { code: normalized });

    let appliesIds: string[] = coupon.appliesIds;
    if (coupon.appliesTo === CouponApplies.CATEGORY && appliesIds.length > 0) {
      const subtrees = await Promise.all(appliesIds.map((id) => this.categories.subtreeIds(id)));
      appliesIds = [...new Set(subtrees.flat())];
    }

    return {
      id: coupon.id,
      usageLimit: coupon.usageLimit,
      perCustomerLimit: coupon.perCustomerLimit,
      terms: {
        code: coupon.code,
        type: coupon.type,
        value: coupon.value.toFixed(2),
        maxDiscount: coupon.maxDiscount?.toFixed(2) ?? null,
        minOrderValue: coupon.minOrderValue?.toFixed(2) ?? null,
        validFrom: coupon.validFrom,
        validTo: coupon.validTo,
        isActive: coupon.isActive,
        appliesTo: coupon.appliesTo,
        appliesIds,
      },
    };
  }

  /**
   * What the code is worth for this cart right now, including the redemption
   * caps so a shopper is told before checkout rather than at it.
   */
  async preview(
    code: string,
    lines: readonly CouponLine[],
    customerId?: string,
  ): Promise<CouponOutcome & { couponId: string }> {
    const { id, terms, usageLimit, perCustomerLimit } = await this.termsFor(code);
    const outcome = evaluateCoupon(terms, lines);
    const counts = await this.counts(this.prisma, id, customerId);
    assertRedemptionAllowed({ code: terms.code, usageLimit, perCustomerLimit }, counts);
    return { ...outcome, couponId: id };
  }

  /**
   * Record the redemption inside the caller's transaction. The coupon row is
   * locked first, so two checkouts cannot both take the last redemption, and
   * CouponUsage.orderId is unique, so a replayed checkout cannot double-count.
   */
  async redeem(
    tx: Prisma.TransactionClient,
    input: { couponId: string; orderId: string; customerId?: string; discount: string },
  ): Promise<void> {
    await tx.$executeRaw(Prisma.sql`SELECT id FROM "Coupon" WHERE id = ${input.couponId} FOR UPDATE`);
    const coupon = await tx.coupon.findUniqueOrThrow({ where: { id: input.couponId } });
    const counts = await this.counts(tx, input.couponId, input.customerId);
    assertRedemptionAllowed(
      { code: coupon.code, usageLimit: coupon.usageLimit, perCustomerLimit: coupon.perCustomerLimit },
      counts,
    );

    await tx.couponUsage.create({
      data: {
        couponId: input.couponId,
        orderId: input.orderId,
        customerId: input.customerId,
        discount: input.discount,
      },
    });
    await this.audit.log(
      {
        action: 'promotions.coupon.redeem',
        entityType: 'Coupon',
        entityId: input.couponId,
        after: { code: coupon.code, orderId: input.orderId, discount: input.discount },
      },
      tx,
    );
  }

  // ---------------------------------------------------------------- admin

  async create(dto: CreateCouponDto): Promise<CouponView> {
    const code = normalizeCouponCode(dto.code);
    this.assertTerms(dto);
    const existing = await this.prisma.coupon.findUnique({ where: { code }, select: { id: true } });
    if (existing) throw conflict('That coupon code already exists', { code });

    const created = await this.prisma.coupon.create({
      data: {
        code,
        type: dto.type,
        value: dto.type === CouponType.FREE_SHIPPING ? '0' : dto.value,
        maxDiscount: dto.maxDiscount,
        minOrderValue: dto.minOrderValue,
        usageLimit: dto.usageLimit,
        perCustomerLimit: dto.perCustomerLimit,
        appliesTo: dto.appliesTo ?? CouponApplies.ALL,
        appliesIds: dto.appliesIds ?? [],
        validFrom: new Date(dto.validFrom),
        validTo: dto.validTo ? new Date(dto.validTo) : null,
        isActive: dto.isActive ?? true,
      },
    });
    await this.audit.log({
      action: 'promotions.coupon.create',
      entityType: 'Coupon',
      entityId: created.id,
      after: { code, type: dto.type, value: dto.value },
    });
    return this.get(created.id);
  }

  async list(query: ListCouponsQueryDto) {
    const { skip, take } = normalizePagination(query);
    const where: Prisma.CouponWhereInput = {};
    if (query.isActive) where.isActive = query.isActive === 'true';
    if (query.q) where.code = { contains: normalizeCouponCode(query.q), mode: 'insensitive' };

    const [total, rows] = await Promise.all([
      this.prisma.coupon.count({ where }),
      this.prisma.coupon.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: { _count: { select: { usages: true } } },
      }),
    ]);
    return {
      items: rows.map((row) => serialize(row, row._count.usages, null)),
      meta: buildMeta(total, skip, take),
    };
  }

  /** Includes usage stats, which is what "toggle + usage stats" in REQ-32 asks for. */
  async get(id: string): Promise<CouponView> {
    const coupon = await this.prisma.coupon.findUnique({ where: { id } });
    if (!coupon) throw notFound('Coupon');
    const stats = await this.prisma.couponUsage.aggregate({
      where: { couponId: id },
      _count: { _all: true },
      _sum: { discount: true },
    });
    return serialize(coupon, stats._count._all, stats._sum.discount);
  }

  async update(id: string, dto: UpdateCouponDto): Promise<CouponView> {
    const existing = await this.prisma.coupon.findUnique({ where: { id } });
    if (!existing) throw notFound('Coupon');
    this.assertTerms({ type: existing.type, ...dto });

    await this.prisma.coupon.update({
      where: { id },
      data: {
        value: dto.value,
        maxDiscount: dto.maxDiscount,
        minOrderValue: dto.minOrderValue,
        usageLimit: dto.usageLimit,
        perCustomerLimit: dto.perCustomerLimit,
        appliesTo: dto.appliesTo,
        appliesIds: dto.appliesIds,
        validFrom: dto.validFrom ? new Date(dto.validFrom) : undefined,
        validTo: dto.validTo === undefined ? undefined : dto.validTo ? new Date(dto.validTo) : null,
        isActive: dto.isActive,
      },
    });
    await this.audit.log({
      action: 'promotions.coupon.update',
      entityType: 'Coupon',
      entityId: id,
      before: { isActive: existing.isActive, value: existing.value.toFixed(2) },
      after: dto,
    });
    return this.get(id);
  }

  /** Redeemed coupons are kept: their usage rows are part of the order record. */
  async remove(id: string): Promise<{ id: string }> {
    const coupon = await this.prisma.coupon.findUnique({
      where: { id },
      include: { _count: { select: { usages: true } } },
    });
    if (!coupon) throw notFound('Coupon');
    if (coupon._count.usages > 0) {
      throw conflict('This coupon has been redeemed; deactivate it instead', {
        timesUsed: coupon._count.usages,
      });
    }
    await this.prisma.coupon.delete({ where: { id } });
    await this.audit.log({
      action: 'promotions.coupon.delete',
      entityType: 'Coupon',
      entityId: id,
      before: { code: coupon.code },
    });
    return { id };
  }

  private assertTerms(dto: {
    type: CouponType;
    value?: string;
    validFrom?: string;
    validTo?: string;
    appliesTo?: CouponApplies;
    appliesIds?: string[];
  }): void {
    if (dto.type === CouponType.PERCENT && dto.value !== undefined && Number(dto.value) > 100) {
      throw invalidInput('A percentage coupon cannot exceed 100');
    }
    if (dto.validFrom && dto.validTo && new Date(dto.validFrom) > new Date(dto.validTo)) {
      throw invalidInput('validFrom must not be after validTo');
    }
    const appliesTo = dto.appliesTo;
    if (appliesTo && appliesTo !== CouponApplies.ALL && (dto.appliesIds ?? []).length === 0) {
      throw invalidInput(`appliesIds is required when appliesTo is ${appliesTo}`);
    }
  }

  private async counts(
    db: Prisma.TransactionClient | PrismaService,
    couponId: string,
    customerId?: string,
  ): Promise<{ total: number; forCustomer: number }> {
    const [total, forCustomer] = await Promise.all([
      db.couponUsage.count({ where: { couponId } }),
      customerId ? db.couponUsage.count({ where: { couponId, customerId } }) : Promise.resolve(0),
    ]);
    return { total, forCustomer };
  }
}

function serialize(
  row: {
    id: string;
    code: string;
    type: CouponType;
    value: Prisma.Decimal;
    maxDiscount: Prisma.Decimal | null;
    minOrderValue: Prisma.Decimal | null;
    usageLimit: number | null;
    perCustomerLimit: number | null;
    appliesTo: CouponApplies;
    appliesIds: string[];
    validFrom: Date;
    validTo: Date | null;
    isActive: boolean;
  },
  timesUsed: number,
  totalDiscount: Prisma.Decimal | null,
): CouponView {
  return {
    id: row.id,
    code: row.code,
    type: row.type,
    value: moneyString(row.value),
    maxDiscount: moneyString(row.maxDiscount),
    minOrderValue: moneyString(row.minOrderValue),
    usageLimit: row.usageLimit,
    perCustomerLimit: row.perCustomerLimit,
    appliesTo: row.appliesTo,
    appliesIds: row.appliesIds,
    validFrom: row.validFrom.toISOString(),
    validTo: row.validTo?.toISOString() ?? null,
    isActive: row.isActive,
    timesUsed,
    totalDiscount: moneyString(totalDiscount),
  };
}
