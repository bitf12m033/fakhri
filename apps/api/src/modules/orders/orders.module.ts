import { Module } from '@nestjs/common';
import { InventoryModule } from '../inventory/inventory.module';
import { DocumentsService } from './documents.service';
import { AdminOrdersController, CustomerOrdersController, GuestOrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

/** Order lifecycle (increment 3.5). Stock effects run through InventoryService. */
@Module({
  imports: [InventoryModule],
  controllers: [GuestOrdersController, CustomerOrdersController, AdminOrdersController],
  providers: [OrdersService, DocumentsService],
  exports: [OrdersService, DocumentsService],
})
export class OrdersModule {}
