import { Injectable } from '@nestjs/common';
import { Prisma, StockMovementType } from '@fakhri/prisma';
import { buildMeta, conflict, invalidInput, normalizePagination, notFound } from '@fakhri/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { currentActor } from '../../common/actor-context';
import { InventoryService } from './inventory.service';
import {
  CreateAdjustmentDto,
  CreateInventoryItemDto,
  CreateWarehouseDto,
  LedgerQueryDto,
  ListInventoryQueryDto,
} from './inventory.dto';

/** Stock operations for the INVENTORY role (REQ-26/27). Every change is audited and ledgered. */
@Injectable()
export class InventoryAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
    private readonly audit: AuditService,
  ) {}

  async listWarehouses() {
    const rows = await this.prisma.warehouse.findMany({ orderBy: { code: 'asc' } });
    return rows.map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      address: row.address,
      city: row.city,
      phone: row.phone,
      isActive: row.isActive,
    }));
  }

  async createWarehouse(dto: CreateWarehouseDto) {
    const code = dto.code.trim().toUpperCase();
    const existing = await this.prisma.warehouse.findUnique({ where: { code }, select: { id: true } });
    if (existing) throw conflict('Warehouse code is already in use');
    const created = await this.prisma.warehouse.create({
      data: {
        code,
        name: dto.name,
        address: dto.address,
        city: dto.city,
        phone: dto.phone,
        isActive: dto.isActive ?? true,
      },
    });
    await this.audit.log({
      action: 'inventory.warehouse.create',
      entityType: 'Warehouse',
      entityId: created.id,
      after: { code, name: dto.name },
    });
    return { id: created.id, code: created.code, name: created.name, isActive: created.isActive };
  }

  async listItems(query: ListInventoryQueryDto) {
    const { skip, take } = normalizePagination(query);
    const where: Prisma.InventoryItemWhereInput = {};
    if (query.variantId) where.variantId = query.variantId;
    if (query.warehouseId) where.warehouseId = query.warehouseId;
    if (query.sku) where.variant = { sku: { contains: query.sku, mode: 'insensitive' } };

    const [total, rows] = await Promise.all([
      this.prisma.inventoryItem.count({ where }),
      this.prisma.inventoryItem.findMany({
        where,
        orderBy: [{ variant: { sku: 'asc' } }, { warehouseId: 'asc' }],
        skip,
        take,
        include: {
          variant: { select: { id: true, sku: true, isAvailableOnOrder: true, product: { select: { name: true } } } },
          warehouse: { select: { id: true, code: true, isActive: true } },
        },
      }),
    ]);

    const items = rows
      .map((row) => ({
        variantId: row.variantId,
        sku: row.variant.sku,
        productName: row.variant.product.name,
        warehouse: row.warehouse,
        onHand: row.onHand,
        reserved: row.reserved,
        available: row.onHand - row.reserved,
        isAvailableOnOrder: row.variant.isAvailableOnOrder,
      }))
      .filter((item) => query.maxAvailable === undefined || item.available <= query.maxAvailable);
    return { items, meta: buildMeta(total, skip, take) };
  }

  /** Create the stock row for a variant in a warehouse, optionally with opening stock. */
  async createItem(dto: CreateInventoryItemDto) {
    const variant = await this.inventory.requireVariant(dto.variantId);
    const warehouse = await this.prisma.warehouse.findUnique({ where: { id: dto.warehouseId } });
    if (!warehouse) throw notFound('Warehouse');
    const existing = await this.prisma.inventoryItem.findUnique({
      where: { warehouseId_variantId: { warehouseId: dto.warehouseId, variantId: dto.variantId } },
    });
    if (existing) throw conflict('This variant already has stock in that warehouse');

    const onHand = dto.onHand ?? 0;
    const item = await this.prisma.$transaction(async (tx) => {
      const created = await tx.inventoryItem.create({
        data: { warehouseId: dto.warehouseId, variantId: dto.variantId, onHand },
      });
      if (onHand > 0) {
        await this.inventory.writeLedger(tx, {
          variantId: dto.variantId,
          warehouseId: dto.warehouseId,
          quantity: onHand,
          type: StockMovementType.RECEIPT,
          refType: 'InventoryItem',
          refId: created.id,
          note: 'Opening stock',
          actorId: currentActor()?.principal?.id,
        });
      }
      await this.audit.log(
        {
          action: 'inventory.item.create',
          entityType: 'InventoryItem',
          entityId: created.id,
          after: { sku: variant.sku, warehouseId: dto.warehouseId, onHand },
        },
        tx,
      );
      return created;
    });

    return {
      variantId: item.variantId,
      sku: variant.sku,
      warehouseId: item.warehouseId,
      onHand: item.onHand,
      reserved: item.reserved,
      available: item.onHand - item.reserved,
    };
  }

  /**
   * Signed stock correction (REQ-27). The guard lives in the UPDATE's WHERE, so a
   * write-off can never drive onHand below zero or below what is already reserved.
   */
  async adjust(dto: CreateAdjustmentDto) {
    const variant = await this.inventory.requireVariant(dto.variantId);
    const item = await this.prisma.inventoryItem.findUnique({
      where: { warehouseId_variantId: { warehouseId: dto.warehouseId, variantId: dto.variantId } },
    });
    if (!item) throw notFound('Inventory item');

    const actorId = currentActor()?.principal?.id;
    const result = await this.prisma.$transaction(async (tx) => {
      const changed = await tx.$executeRaw(Prisma.sql`
        UPDATE "InventoryItem"
           SET "onHand" = "onHand" + ${dto.quantity}
         WHERE "id" = ${item.id}
           AND "onHand" + ${dto.quantity} >= 0
           AND "onHand" + ${dto.quantity} >= "reserved"
      `);
      if (changed !== 1) {
        throw conflict('That adjustment would leave less stock than is already reserved', {
          onHand: item.onHand,
          reserved: item.reserved,
          quantity: dto.quantity,
        });
      }

      const adjustment = await tx.stockAdjustment.create({
        data: {
          warehouseId: dto.warehouseId,
          variantId: dto.variantId,
          quantity: dto.quantity,
          reason: dto.reason,
          note: dto.note,
          approvedBy: actorId,
        },
      });
      await this.inventory.writeLedger(tx, {
        variantId: dto.variantId,
        warehouseId: dto.warehouseId,
        quantity: Math.abs(dto.quantity),
        type: dto.quantity > 0 ? StockMovementType.ADJUSTMENT_IN : StockMovementType.ADJUSTMENT_OUT,
        refType: 'StockAdjustment',
        refId: adjustment.id,
        note: dto.reason,
        actorId,
      });
      await this.audit.log(
        {
          action: 'inventory.adjustment.create',
          entityType: 'InventoryItem',
          entityId: item.id,
          before: { onHand: item.onHand, reserved: item.reserved },
          after: { quantity: dto.quantity, reason: dto.reason },
        },
        tx,
      );
      return tx.inventoryItem.findUniqueOrThrow({ where: { id: item.id } });
    });

    return {
      variantId: result.variantId,
      sku: variant.sku,
      warehouseId: result.warehouseId,
      onHand: result.onHand,
      reserved: result.reserved,
      available: result.onHand - result.reserved,
    };
  }

  /** Append-only movement history (REQ-27). */
  async ledger(query: LedgerQueryDto) {
    if (!query.variantId && !query.warehouseId) {
      throw invalidInput('Filter the ledger by variantId or warehouseId');
    }
    const { skip, take } = normalizePagination(query);
    const where: Prisma.StockLedgerWhereInput = {};
    if (query.variantId) where.variantId = query.variantId;
    if (query.warehouseId) where.warehouseId = query.warehouseId;

    const [total, rows] = await Promise.all([
      this.prisma.stockLedger.count({ where }),
      this.prisma.stockLedger.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }),
    ]);
    return {
      items: rows.map((row) => ({
        id: row.id,
        variantId: row.variantId,
        warehouseId: row.warehouseId,
        quantity: row.quantity,
        type: row.type,
        refType: row.refType,
        refId: row.refId,
        note: row.note,
        actorId: row.actorId,
        createdAt: row.createdAt.toISOString(),
      })),
      meta: buildMeta(total, skip, take),
    };
  }
}
