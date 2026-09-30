import { Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { UserRole } from '@fakhri/prisma';
import { Roles } from '../modules/auth/auth.decorators';
import { OutboxDispatcher } from './outbox.dispatcher';
import { OutboxService } from './outbox.service';

/**
 * Operator control over event delivery. The poller normally handles this; these
 * routes exist for draining on demand and for seeing what is stuck.
 */
@Controller('admin/outbox')
@Roles(UserRole.SUPER_ADMIN)
export class OutboxController {
  constructor(
    private readonly dispatcher: OutboxDispatcher,
    private readonly outbox: OutboxService,
  ) {}

  @Get()
  async status() {
    return { data: await this.outbox.summary() };
  }

  @Post('dispatch')
  @HttpCode(HttpStatus.OK)
  async dispatch() {
    return { data: await this.dispatcher.drain() };
  }
}
