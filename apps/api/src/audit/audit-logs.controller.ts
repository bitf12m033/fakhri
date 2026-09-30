import { Controller, Get, Query } from '@nestjs/common';
import { UserRole } from '@fakhri/prisma';
import { Roles } from '../modules/auth/auth.decorators';
import { AuditLogQueryDto } from './audit.dto';
import { AuditService } from './audit.service';

/**
 * Audit search (REQ-34). SUPER_ADMIN only, read-only: the log is append-only and
 * there is no route that edits or deletes a row.
 */
@Controller('admin/audit-logs')
@Roles(UserRole.SUPER_ADMIN)
export class AuditLogsController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  async search(@Query() query: AuditLogQueryDto) {
    const result = await this.audit.search(query);
    return { data: result.items, meta: result.meta };
  }
}
