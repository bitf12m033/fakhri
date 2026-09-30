import { Module } from '@nestjs/common';
import { OrdersModule } from '../orders/orders.module';
import { AdminShippingController } from './shipping.controller';
import { ShippingService } from './shipping.service';

/** Shipments, manual tracking and label data (increment 3.6). */
@Module({
  imports: [OrdersModule],
  controllers: [AdminShippingController],
  providers: [ShippingService],
  exports: [ShippingService],
})
export class ShippingModule {}
