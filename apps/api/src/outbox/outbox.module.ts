import { Global, Module } from '@nestjs/common';
import { OutboxController } from './outbox.controller';
import { OutboxDispatcher } from './outbox.dispatcher';
import { OutboxService } from './outbox.service';

/**
 * Transactional outbox: producers enqueue inside their business transaction and
 * the dispatcher delivers afterwards (DEC-04). Global so any module can enqueue,
 * and so handlers can register with the dispatcher wherever they live.
 */
@Global()
@Module({
  controllers: [OutboxController],
  providers: [OutboxService, OutboxDispatcher],
  exports: [OutboxService, OutboxDispatcher],
})
export class OutboxModule {}
