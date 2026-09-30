import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Put } from '@nestjs/common';
import { UserRole } from '@fakhri/prisma';
import { Roles } from '../auth/auth.decorators';
import { ShipmentEventDto, UpsertShipmentDto } from './shipping.dto';
import { ShippingService } from './shipping.service';

@Controller('admin/orders')
@Roles(UserRole.ORDERS)
export class AdminShippingController {
  constructor(private readonly shipping: ShippingService) {}

  @Get(':id/shipment')
  async get(@Param('id') id: string) {
    return { data: await this.shipping.view(id) };
  }

  @Put(':id/shipment')
  async upsert(@Param('id') id: string, @Body() dto: UpsertShipmentDto) {
    return { data: await this.shipping.upsert(id, dto) };
  }

  @Post(':id/shipment/events')
  @HttpCode(HttpStatus.CREATED)
  async addEvent(@Param('id') id: string, @Body() dto: ShipmentEventDto) {
    return { data: await this.shipping.addEvent(id, dto) };
  }

  @Get(':id/shipment/label')
  async label(@Param('id') id: string) {
    return { data: await this.shipping.label(id) };
  }
}
