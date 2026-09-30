import { Injectable } from '@nestjs/common';
import { buildMeta, conflict, normalizePagination, notFound } from '@fakhri/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { moneyString } from '../catalog/catalog.serialize';
import { PublicProductCard, StorefrontService } from '../catalog/public/storefront.service';

export const MAX_WISHLIST_ITEMS = 200;

export interface WishlistItemView {
  variantId: string;
  sku: string;
  price: string | null;
  addedAt: string;
  /** Null once the product stops being publicly visible, so the UI can say so. */
  product: PublicProductCard | null;
}

/** Wishlist (REQ-15). One row per variant: the unique index does the deduping. */
@Injectable()
export class WishlistService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storefront: StorefrontService,
  ) {}

  async list(customerId: string, query: PaginationQueryDto) {
    const { skip, take } = normalizePagination(query);
    const [total, rows] = await Promise.all([
      this.prisma.wishlistItem.count({ where: { customerId } }),
      this.prisma.wishlistItem.findMany({
        where: { customerId },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: { variant: { select: { id: true, sku: true, price: true, productId: true } } },
      }),
    ]);

    const cards = await this.storefront.cards([...new Set(rows.map((row) => row.variant.productId))]);
    const byProduct = new Map(cards.map((card) => [card.id, card]));
    const items: WishlistItemView[] = rows.map((row) => ({
      variantId: row.variant.id,
      sku: row.variant.sku,
      price: moneyString(row.variant.price),
      addedAt: row.createdAt.toISOString(),
      product: byProduct.get(row.variant.productId) ?? null,
    }));
    return { items, meta: buildMeta(total, skip, take) };
  }

  /** Idempotent: adding the same variant twice leaves one row. */
  async add(customerId: string, variantId: string): Promise<WishlistItemView> {
    const variant = await this.prisma.productVariant.findUnique({
      where: { id: variantId },
      select: { id: true, sku: true, price: true, productId: true },
    });
    if (!variant) throw notFound('Variant');

    const count = await this.prisma.wishlistItem.count({ where: { customerId } });
    const existing = await this.prisma.wishlistItem.findUnique({
      where: { customerId_variantId: { customerId, variantId } },
    });
    if (!existing && count >= MAX_WISHLIST_ITEMS) {
      throw conflict(`A wishlist holds at most ${MAX_WISHLIST_ITEMS} items`);
    }

    const item =
      existing ??
      (await this.prisma.wishlistItem.upsert({
        where: { customerId_variantId: { customerId, variantId } },
        create: { customerId, variantId },
        update: {},
      }));
    const [card] = await this.storefront.cards([variant.productId]);
    return {
      variantId: variant.id,
      sku: variant.sku,
      price: moneyString(variant.price),
      addedAt: item.createdAt.toISOString(),
      product: card ?? null,
    };
  }

  async remove(customerId: string, variantId: string): Promise<{ variantId: string }> {
    const deleted = await this.prisma.wishlistItem.deleteMany({ where: { customerId, variantId } });
    if (deleted.count === 0) throw notFound('Wishlist item');
    return { variantId };
  }
}
