import { Injectable } from '@nestjs/common';
import { Prisma, StockMovementType } from '@fakhri/prisma';
import { AppError, notFound, outOfStock } from '@fakhri/shared';
import { PrismaService } from '../../prisma/prisma.service';

export interface ReservationLine {
  variantId: string;
  sku: string;
  quantity: number;
  /** A flagged variant sells with no stock and takes no reservation (REQ-28). */
  isAvailableOnOrder: boolean;
}

export interface Reservation {
  variantId: string;
  quantity: number;
  /** Null when the line sold on back-order and reserved nothing. */
  warehouseId: string | null;
}

/**
 * Stock reservation and the ledger (REQ-23/26/27/28).
 *
 * Ledger convention: `quantity` is always a positive count of units, and `type`
 * says what moved and in which direction. RESERVATION and RESERVATION_RELEASE
 * move `reserved`; RECEIPT, SALE and the ADJUSTMENT types move `onHand`.
 *
 * The ledger is also how the service remembers *where* an order's stock is held,
 * so releasing or shipping reverses the exact warehouse rows that were reserved.
 */
@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Reserve every line inside the caller's transaction (REQ-23). Oversell is
   * impossible because the availability test lives in the UPDATE's own WHERE:
   * a concurrent transaction that wins the row lock first leaves the predicate
   * false, so the second UPDATE matches no rows instead of overwriting a stale read.
   */
  async reserveForOrder(
    tx: Prisma.TransactionClient,
    orderId: string,
    lines: readonly ReservationLine[],
    actorId?: string,
  ): Promise<Reservation[]> {
    const reservations: Reservation[] = [];
    for (const line of lines) {
      const warehouseId = await this.reserveLine(tx, line);
      if (warehouseId === null && !line.isAvailableOnOrder) throw outOfStock(line.sku);
      if (warehouseId !== null) {
        await this.writeLedger(tx, {
          variantId: line.variantId,
          warehouseId,
          quantity: line.quantity,
          type: StockMovementType.RESERVATION,
          refType: 'Order',
          refId: orderId,
          actorId,
        });
      }
      reservations.push({ variantId: line.variantId, quantity: line.quantity, warehouseId });
    }
    return reservations;
  }

  /** Give the stock back (REQ-24: a cancelled order releases its reservation). */
  async releaseForOrder(tx: Prisma.TransactionClient, orderId: string, actorId?: string): Promise<void> {
    const held = await this.outstandingReservations(tx, orderId);
    for (const row of held) {
      const released = await tx.$executeRaw(Prisma.sql`
        UPDATE "InventoryItem"
           SET "reserved" = "reserved" - ${row.quantity}
         WHERE "variantId" = ${row.variantId}
           AND "warehouseId" = ${row.warehouseId}
           AND "reserved" >= ${row.quantity}
      `);
      if (released !== 1) {
        throw new AppError('INTERNAL', 'Reserved stock no longer matches the ledger', {
          variantId: row.variantId,
        });
      }
      await this.writeLedger(tx, {
        variantId: row.variantId,
        warehouseId: row.warehouseId,
        quantity: row.quantity,
        type: StockMovementType.RESERVATION_RELEASE,
        refType: 'Order',
        refId: orderId,
        actorId,
      });
    }
  }

  /** Stock physically leaves: reserved and onHand both drop by the same amount. */
  async consumeForOrder(tx: Prisma.TransactionClient, orderId: string, actorId?: string): Promise<void> {
    const held = await this.outstandingReservations(tx, orderId);
    for (const row of held) {
      const sold = await tx.$executeRaw(Prisma.sql`
        UPDATE "InventoryItem"
           SET "reserved" = "reserved" - ${row.quantity},
               "onHand" = "onHand" - ${row.quantity}
         WHERE "variantId" = ${row.variantId}
           AND "warehouseId" = ${row.warehouseId}
           AND "reserved" >= ${row.quantity}
           AND "onHand" >= ${row.quantity}
      `);
      if (sold !== 1) {
        throw new AppError('INTERNAL', 'Reserved stock no longer matches the ledger', {
          variantId: row.variantId,
        });
      }
      await this.writeLedger(tx, {
        variantId: row.variantId,
        warehouseId: row.warehouseId,
        quantity: row.quantity,
        type: StockMovementType.SALE,
        refType: 'Order',
        refId: orderId,
        actorId,
      });
    }
  }

  /**
   * What the order still holds: reservations minus anything already released or
   * sold. Derived from the ledger, so releasing or shipping twice is a no-op
   * rather than a double movement.
   */
  private async outstandingReservations(
    tx: Prisma.TransactionClient,
    orderId: string,
  ): Promise<{ variantId: string; warehouseId: string; quantity: number }[]> {
    const rows = await tx.$queryRaw<{ variantId: string; warehouseId: string; quantity: number }[]>(Prisma.sql`
      SELECT "variantId", "warehouseId",
             SUM(CASE WHEN "type" = 'RESERVATION' THEN "quantity" ELSE -"quantity" END)::int AS quantity
        FROM "StockLedger"
       WHERE "refType" = 'Order' AND "refId" = ${orderId}
         AND "type" IN ('RESERVATION', 'RESERVATION_RELEASE', 'SALE')
       GROUP BY "variantId", "warehouseId"
      HAVING SUM(CASE WHEN "type" = 'RESERVATION' THEN "quantity" ELSE -"quantity" END) > 0
    `);
    return rows;
  }

  /**
   * One conditional UPDATE per candidate warehouse, highest availability first.
   * Returns the warehouse that took the line, or null if none could.
   * A line is never split across warehouses at MVP (ASM-06: one hub).
   */
  private async reserveLine(tx: Prisma.TransactionClient, line: ReservationLine): Promise<string | null> {
    const candidates = await tx.$queryRaw<{ warehouseId: string }[]>(Prisma.sql`
      SELECT ii."warehouseId"
        FROM "InventoryItem" ii
        JOIN "Warehouse" w ON w.id = ii."warehouseId"
       WHERE ii."variantId" = ${line.variantId}
         AND w."isActive"
         AND ii."onHand" - ii."reserved" >= ${line.quantity}
       ORDER BY (ii."onHand" - ii."reserved") DESC, ii."warehouseId" ASC
    `);

    for (const candidate of candidates) {
      const reserved = await tx.$executeRaw(Prisma.sql`
        UPDATE "InventoryItem"
           SET "reserved" = "reserved" + ${line.quantity}
         WHERE "variantId" = ${line.variantId}
           AND "warehouseId" = ${candidate.warehouseId}
           AND "onHand" - "reserved" >= ${line.quantity}
      `);
      if (reserved === 1) return candidate.warehouseId;
    }
    return null;
  }

  async writeLedger(
    tx: Prisma.TransactionClient,
    entry: {
      variantId: string;
      warehouseId: string;
      quantity: number;
      type: StockMovementType;
      refType?: string;
      refId?: string;
      note?: string;
      actorId?: string;
    },
  ): Promise<void> {
    await tx.stockLedger.create({ data: entry });
  }

  /** Sellable units per variant, summed across active warehouses. */
  async availability(variantIds: string[]): Promise<Map<string, number>> {
    if (variantIds.length === 0) return new Map();
    const rows = await this.prisma.$queryRaw<{ variantId: string; available: number }[]>(Prisma.sql`
      SELECT ii."variantId", SUM(ii."onHand" - ii."reserved")::int AS available
        FROM "InventoryItem" ii
        JOIN "Warehouse" w ON w.id = ii."warehouseId" AND w."isActive"
       WHERE ii."variantId" IN (${Prisma.join(variantIds)})
       GROUP BY ii."variantId"
    `);
    return new Map(rows.map((row) => [row.variantId, row.available]));
  }

  async requireVariant(variantId: string) {
    const variant = await this.prisma.productVariant.findUnique({
      where: { id: variantId },
      select: { id: true, sku: true, isAvailableOnOrder: true },
    });
    if (!variant) throw notFound('Variant');
    return variant;
  }
}
