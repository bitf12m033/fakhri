import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query } from '@nestjs/common';
import { UserRole } from '@fakhri/prisma';
import { Roles } from '../auth/auth.decorators';
import { InventoryAdminService } from './inventory-admin.service';
import {
  CreateAdjustmentDto,
  CreateInventoryItemDto,
  CreateWarehouseDto,
  LedgerQueryDto,
  ListInventoryQueryDto,
} from './inventory.dto';

@Controller('admin/inventory')
@Roles(UserRole.INVENTORY)
export class InventoryAdminController {
  constructor(private readonly inventory: InventoryAdminService) {}

  @Get('warehouses')
  async listWarehouses() {
    return { data: await this.inventory.listWarehouses() };
  }

  @Post('warehouses')
  @HttpCode(HttpStatus.CREATED)
  async createWarehouse(@Body() dto: CreateWarehouseDto) {
    return { data: await this.inventory.createWarehouse(dto) };
  }

  @Get('items')
  async listItems(@Query() query: ListInventoryQueryDto) {
    const result = await this.inventory.listItems(query);
    return { data: result.items, meta: result.meta };
  }

  @Post('items')
  @HttpCode(HttpStatus.CREATED)
  async createItem(@Body() dto: CreateInventoryItemDto) {
    return { data: await this.inventory.createItem(dto) };
  }

  @Post('adjustments')
  @HttpCode(HttpStatus.CREATED)
  async adjust(@Body() dto: CreateAdjustmentDto) {
    return { data: await this.inventory.adjust(dto) };
  }

  @Get('ledger')
  async ledger(@Query() query: LedgerQueryDto) {
    const result = await this.inventory.ledger(query);
    return { data: result.items, meta: result.meta };
  }
}
