import { Module } from '@nestjs/common';
import { OrdersModule } from '../orders/orders.module';
import { MockPaymentGateway } from './gateway';
import { AdminPaymentsController, PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';

/**
 * Payment ledger and the gateway adapter (increment 3.6). A settled payment
 * advances its order through OrdersService inside the same transaction.
 */
@Module({
  imports: [OrdersModule],
  controllers: [PaymentsController, AdminPaymentsController],
  providers: [PaymentsService, MockPaymentGateway],
  exports: [PaymentsService, MockPaymentGateway],
})
export class PaymentsModule {}
