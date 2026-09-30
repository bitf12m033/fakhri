import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import { UserRole } from '@fakhri/prisma';
import { Roles } from '../auth/auth.decorators';
import { CouponsService } from './coupons.service';
import { CreateCouponDto, ListCouponsQueryDto, UpdateCouponDto } from './coupons.dto';

@Controller('admin/coupons')
@Roles(UserRole.MARKETING)
export class AdminCouponsController {
  constructor(private readonly coupons: CouponsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateCouponDto) {
    return { data: await this.coupons.create(dto) };
  }

  @Get()
  async list(@Query() query: ListCouponsQueryDto) {
    const result = await this.coupons.list(query);
    return { data: result.items, meta: result.meta };
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    return { data: await this.coupons.get(id) };
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateCouponDto) {
    return { data: await this.coupons.update(id, dto) };
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    return { data: await this.coupons.remove(id) };
  }
}
