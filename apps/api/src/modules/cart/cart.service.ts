import { randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, ProductStatus } from '@fakhri/prisma';
import { AppConfig } from '@fakhri/config';
import { AppError, conflict, notFound, sum } from '@fakhri/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { moneyString } from '../catalog/catalog.serialize';
import { InventoryService } from '../inventory/inventory.service';
import { AddCartItemDto, CART_LIMITS } from './cart.dto';

export const CART_TOKEN_HEADER = 'x-cart-token';

/** Who the cart belongs to. A guest brings a token; a signed-in customer brings both. */
export interface CartOwner {
  customerId?: string;
  token?: string;
}

export interface CartLineView {
  itemId: string;
  variantId: string;
  sku: string;
  productName: string;
  productSlug: string;
  variantName: string | null;
  quantity: number;
  /** Price captured when the item was added. */
  unitPrice: string | null;
  /** Live catalog price, so the storefront can show a change before checkout. */
  currentPrice: string | null;
  priceChanged: boolean;
  subtotal: string | null;
  available: number | null;
  isAvailableOnOrder: boolean;
  inStock: boolean;
}

export interface CartView {
  id: string | null;
  /** Guests must send this back as X-Cart-Token. Null for a customer cart. */
  token: string | null;
  itemCount: number;
  itemsTotal: string;
  /** Delivery and tax need an address, so they are quoted at checkout. */
  lines: CartLineView[];
  hasPriceChanges: boolean;
  hasUnavailableLines: boolean;
}

const lineInclude = {
  variant: {
    select: {
      id: true,
      sku: true,
      name: true,
      price: true,
      isActive: true,
      isAvailableOnOrder: true,
      product: { select: { name: true, slug: true, status: true } },
    },
  },
} satisfies Prisma.CartItemInclude;

type CartWithLines = Prisma.CartGetPayload<{ include: { items: { include: typeof lineInclude } } }>;

/**
 * Server-side cart (REQ-18). Prices are snapshotted when an item is added and
 * revalidated at checkout, so a catalog change never silently re-prices a cart.
 */
@Injectable()
export class CartService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  /** Read-only view. Never creates a row, so a bare GET costs nothing. */
  async view(owner: CartOwner): Promise<CartView> {
    const cart = await this.find(owner);
    return cart ? this.serialize(cart) : emptyCart();
  }

  async addItem(owner: CartOwner, dto: AddCartItemDto): Promise<CartView> {
    const variant = await this.requireSellableVariant(dto.variantId);
    const cart = await this.findOrCreate(owner);

    const existing = await this.prisma.cartItem.findUnique({
      where: { cartId_variantId: { cartId: cart.id, variantId: dto.variantId } },
    });
    if (!existing) {
      const lines = await this.prisma.cartItem.count({ where: { cartId: cart.id } });
      if (lines >= CART_LIMITS.lines) throw conflict(`A cart holds at most ${CART_LIMITS.lines} lines`);
    }

    const quantity = (existing?.quantity ?? 0) + dto.quantity;
    if (quantity > CART_LIMITS.quantityPerLine) {
      throw conflict(`At most ${CART_LIMITS.quantityPerLine} of one item per cart`, {
        sku: variant.sku,
        quantity,
      });
    }

    await this.prisma.cartItem.upsert({
      where: { cartId_variantId: { cartId: cart.id, variantId: dto.variantId } },
      // Re-snapshot on add: the customer just saw this price.
      create: { cartId: cart.id, variantId: dto.variantId, quantity, unitPrice: variant.price },
      update: { quantity, unitPrice: variant.price },
    });
    return this.touch(cart.id, owner);
  }

  async updateItem(owner: CartOwner, itemId: string, quantity: number): Promise<CartView> {
    const cart = await this.require(owner);
    const item = await this.prisma.cartItem.findFirst({ where: { id: itemId, cartId: cart.id } });
    if (!item) throw notFound('Cart item');
    await this.prisma.cartItem.update({ where: { id: itemId }, data: { quantity } });
    return this.touch(cart.id, owner);
  }

  async removeItem(owner: CartOwner, itemId: string): Promise<CartView> {
    const cart = await this.require(owner);
    const deleted = await this.prisma.cartItem.deleteMany({ where: { id: itemId, cartId: cart.id } });
    if (deleted.count === 0) throw notFound('Cart item');
    return this.touch(cart.id, owner);
  }

  /**
   * Resolve the cart for this request, merging a guest cart into the customer's
   * when someone signs in while holding one.
   */
  async find(owner: CartOwner): Promise<CartWithLines | null> {
    if (owner.customerId) {
      const customerCart = await this.prisma.cart.findFirst({
        where: { customerId: owner.customerId, status: 'OPEN' },
        include: { items: { include: lineInclude, orderBy: { createdAt: 'asc' } } },
      });
      const guestCart = owner.token
        ? await this.prisma.cart.findFirst({
            where: { token: owner.token, status: 'OPEN', customerId: null },
            include: { items: { include: lineInclude } },
          })
        : null;
      if (guestCart) return this.adopt(guestCart, owner.customerId, customerCart?.id);
      return customerCart;
    }
    if (!owner.token) return null;
    return this.prisma.cart.findFirst({
      where: { token: owner.token, status: 'OPEN', customerId: null },
      include: { items: { include: lineInclude, orderBy: { createdAt: 'asc' } } },
    });
  }

  async findOrCreate(owner: CartOwner): Promise<{ id: string; token: string | null }> {
    const existing = await this.find(owner);
    if (existing) return { id: existing.id, token: existing.token };
    const created = await this.prisma.cart.create({
      data: {
        customerId: owner.customerId,
        token: owner.customerId ? null : (owner.token ?? newCartToken()),
        expiresAt: this.expiry(),
      },
      select: { id: true, token: true },
    });
    return created;
  }

  /** Checkout consumes the cart: items go, the cart is closed. */
  async close(tx: Prisma.TransactionClient, cartId: string): Promise<void> {
    await tx.cartItem.deleteMany({ where: { cartId } });
    await tx.cart.update({ where: { id: cartId }, data: { status: 'CONVERTED' } });
  }

  async require(owner: CartOwner): Promise<CartWithLines> {
    const cart = await this.find(owner);
    if (!cart) throw notFound('Cart');
    return cart;
  }

  async serialize(cart: CartWithLines): Promise<CartView> {
    const availability = await this.inventory.availability(cart.items.map((item) => item.variantId));
    const lines = cart.items.map((item) => {
      const available = availability.get(item.variantId) ?? 0;
      const currentPrice = item.variant.price;
      const sellable = item.variant.isActive && item.variant.product.status === ProductStatus.ACTIVE;
      return {
        itemId: item.id,
        variantId: item.variantId,
        sku: item.variant.sku,
        productName: item.variant.product.name,
        productSlug: item.variant.product.slug,
        variantName: item.variant.name,
        quantity: item.quantity,
        unitPrice: moneyString(item.unitPrice),
        currentPrice: moneyString(currentPrice),
        priceChanged: !item.unitPrice.equals(currentPrice),
        subtotal: moneyString(item.unitPrice.mul(item.quantity)),
        available: sellable ? available : null,
        isAvailableOnOrder: item.variant.isAvailableOnOrder,
        inStock: sellable && (available >= item.quantity || item.variant.isAvailableOnOrder),
      };
    });

    return {
      id: cart.id,
      token: cart.token,
      itemCount: lines.reduce((total, line) => total + line.quantity, 0),
      itemsTotal: sum(lines.map((line) => line.subtotal ?? '0')).toFixed(2),
      lines,
      hasPriceChanges: lines.some((line) => line.priceChanged),
      hasUnavailableLines: lines.some((line) => !line.inStock),
    };
  }

  private async touch(cartId: string, owner: CartOwner): Promise<CartView> {
    await this.prisma.cart.update({ where: { id: cartId }, data: { expiresAt: this.expiry() } });
    return this.view(owner);
  }

  /** Move guest lines onto the customer's cart, summing quantities. */
  private async adopt(
    guestCart: CartWithLines,
    customerId: string,
    customerCartId?: string,
  ): Promise<CartWithLines> {
    const targetId = customerCartId ?? guestCart.id;
    await this.prisma.$transaction(async (tx) => {
      if (customerCartId) {
        for (const item of guestCart.items) {
          const existing = await tx.cartItem.findUnique({
            where: { cartId_variantId: { cartId: customerCartId, variantId: item.variantId } },
          });
          const quantity = Math.min(CART_LIMITS.quantityPerLine, (existing?.quantity ?? 0) + item.quantity);
          await tx.cartItem.upsert({
            where: { cartId_variantId: { cartId: customerCartId, variantId: item.variantId } },
            create: { cartId: customerCartId, variantId: item.variantId, quantity, unitPrice: item.unitPrice },
            update: { quantity },
          });
        }
        await tx.cart.update({ where: { id: guestCart.id }, data: { status: 'MERGED', token: null } });
      } else {
        // No customer cart yet: claim the guest cart outright.
        await tx.cart.update({
          where: { id: guestCart.id },
          data: { customerId, token: null, expiresAt: this.expiry() },
        });
      }
    });

    return this.prisma.cart.findFirstOrThrow({
      where: { id: targetId },
      include: { items: { include: lineInclude, orderBy: { createdAt: 'asc' } } },
    });
  }

  private async requireSellableVariant(variantId: string) {
    const variant = await this.prisma.productVariant.findFirst({
      where: {
        id: variantId,
        isActive: true,
        product: { status: ProductStatus.ACTIVE, brand: { isActive: true }, category: { isActive: true } },
      },
      select: { id: true, sku: true, price: true },
    });
    if (!variant) throw notFound('Variant');
    return variant;
  }

  private expiry(): Date {
    const days = this.config.get('CART_TTL_DAYS', { infer: true });
    return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  }
}

export function newCartToken(): string {
  return randomBytes(24).toString('base64url');
}

function emptyCart(): CartView {
  return {
    id: null,
    token: null,
    itemCount: 0,
    itemsTotal: '0.00',
    lines: [],
    hasPriceChanges: false,
    hasUnavailableLines: false,
  };
}

/** Exported for the checkout service, which validates the same way. */
export function assertCartUsable(cart: CartView): void {
  if (cart.lines.length === 0) throw new AppError('CART_EMPTY', 'Your cart is empty');
}
