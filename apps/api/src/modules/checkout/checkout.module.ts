import { Module } from '@nestjs/common';
import { CartModule } from '../cart/cart.module';
import { InventoryModule } from '../inventory/inventory.module';
import { PromotionsModule } from '../promotions/promotions.module';
import { CheckoutController } from './checkout.controller';
import { CheckoutService } from './checkout.service';
import { IdempotencyService } from './idempotency.service';

/** Checkout (increment 3.5): one transaction for the order, its stock and its events. */
@Module({
  imports: [CartModule, InventoryModule, PromotionsModule],
  controllers: [CheckoutController],
  providers: [CheckoutService, IdempotencyService],
  exports: [IdempotencyService],
})
export class CheckoutModule {}
