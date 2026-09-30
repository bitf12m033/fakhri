import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { AdminCouponsController } from './coupons.controller';
import { CouponsService } from './coupons.service';

/**
 * Coupons (increment 3.7). Exported for the cart, which previews a code, and
 * checkout, which redeems it inside the order transaction.
 */
@Module({
  imports: [CatalogModule],
  controllers: [AdminCouponsController],
  providers: [CouponsService],
  exports: [CouponsService],
})
export class PromotionsModule {}
