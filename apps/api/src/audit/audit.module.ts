import { Global, Module } from '@nestjs/common';
import { AuditLogsController } from './audit-logs.controller';
import { AuditService } from './audit.service';

/**
 * Append-only audit trail (REQ-34). Global so any module can write to it inside
 * its own transaction; the search route is SUPER_ADMIN only.
 */
@Global()
@Module({
  controllers: [AuditLogsController],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
