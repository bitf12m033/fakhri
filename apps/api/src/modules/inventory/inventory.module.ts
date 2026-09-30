import { Module } from '@nestjs/common';
import { InventoryAdminController } from './inventory-admin.controller';
import { InventoryAdminService } from './inventory-admin.service';
import { InventoryService } from './inventory.service';

/**
 * Stock levels, reservations and the ledger (increment 3.5). InventoryService is
 * exported because checkout reserves inside its own transaction (no async race
 * on stock, per docs/aidlc/04-architecture-api.md §2).
 */
@Module({
  controllers: [InventoryAdminController],
  providers: [InventoryService, InventoryAdminService],
  exports: [InventoryService],
})
export class InventoryModule {}
