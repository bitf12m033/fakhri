import { Module } from '@nestjs/common';
import { InventoryModule } from '../inventory/inventory.module';
import { CartController } from './cart.controller';
import { CartService } from './cart.service';

/** Server-side cart (increment 3.5). Exported for checkout, which consumes it. */
@Module({
  imports: [InventoryModule],
  controllers: [CartController],
  providers: [CartService],
  exports: [CartService],
})
export class CartModule {}
