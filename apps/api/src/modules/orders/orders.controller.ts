import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import { UserRole } from '@fakhri/prisma';
import { CustomerRoute, Roles } from '../auth/auth.decorators';
import { CurrentCustomer } from '../auth/principal';
import { DocumentsService } from './documents.service';
import { AdminListOrdersQueryDto, ListOrdersQueryDto, TransitionOrderDto } from './orders.dto';
import { OrdersService } from './orders.service';

/** A customer's own order history and cancellation (REQ-16/24). */
@Controller('customers/me/orders')
@CustomerRoute()
export class CustomerOrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  async list(@CurrentCustomer() customerId: string, @Query() query: ListOrdersQueryDto) {
    const result = await this.orders.listForCustomer(customerId, query);
    return { data: result.items, meta: result.meta };
  }

  @Get(':ref')
  async get(@CurrentCustomer() customerId: string, @Param('ref') ref: string) {
    return { data: await this.orders.getForCustomer(customerId, ref) };
  }

  /**
   * Cancel while the order is still PENDING. Guest orders have no credential to
   * authenticate with, so those cancellations go through an admin.
   */
  @Post(':ref/cancel')
  @HttpCode(HttpStatus.OK)
  async cancel(
    @CurrentCustomer() customerId: string,
    @Param('ref') ref: string,
    @Body() dto: TransitionOrderDto | Record<string, never>,
  ) {
    const note = typeof (dto as { note?: unknown }).note === 'string' ? (dto as { note: string }).note : undefined;
    return { data: await this.orders.cancelByCustomer(customerId, ref, note) };
  }
}

@Controller('admin/orders')
@Roles(UserRole.ORDERS)
export class AdminOrdersController {
  constructor(
    private readonly orders: OrdersService,
    private readonly documents: DocumentsService,
  ) {}

  @Get()
  async list(@Query() query: AdminListOrdersQueryDto) {
    const result = await this.orders.listForAdmin(query);
    return { data: result.items, meta: result.meta };
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    return { data: await this.orders.getForAdmin(id) };
  }

  @Patch(':id/status')
  async transition(@Param('id') id: string, @Body() dto: TransitionOrderDto) {
    return { data: await this.orders.transitionByAdmin(id, dto) };
  }

  @Get(':id/invoice')
  async invoice(@Param('id') id: string) {
    return { data: await this.documents.invoice(id) };
  }

  @Get(':id/packing-list')
  async packingList(@Param('id') id: string) {
    return { data: await this.documents.packingList(id) };
  }
}
