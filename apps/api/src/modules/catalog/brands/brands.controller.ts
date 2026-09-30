import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import { UserRole } from '@fakhri/prisma';
import { Roles } from '../../auth/auth.decorators';
import { BrandsService } from './brands.service';
import { CreateBrandDto, ListBrandsQueryDto, UpdateBrandDto } from './brand.dto';

@Controller('admin/brands')
@Roles(UserRole.CATALOG)
export class BrandsController {
  constructor(private readonly brands: BrandsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateBrandDto) {
    return { data: await this.brands.create(dto) };
  }

  @Get()
  async list(@Query() query: ListBrandsQueryDto) {
    const result = await this.brands.list(query);
    return { data: result.items, meta: result.meta };
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    return { data: await this.brands.get(id) };
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateBrandDto) {
    return { data: await this.brands.update(id, dto) };
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    return { data: await this.brands.remove(id) };
  }
}
