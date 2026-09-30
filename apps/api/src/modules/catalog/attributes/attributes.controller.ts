import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import { AttributesService } from './attributes.service';
import {
  CreateAttributeDto,
  CreateAttributeOptionDto,
  ListAttributesQueryDto,
  UpdateAttributeDto,
  UpdateAttributeOptionDto,
} from './attribute.dto';

@Controller('admin/attributes')
export class AttributesController {
  constructor(private readonly attributes: AttributesService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateAttributeDto) {
    return { data: await this.attributes.create(dto) };
  }

  @Get()
  async list(@Query() query: ListAttributesQueryDto) {
    const result = await this.attributes.list(query);
    return { data: result.items, meta: result.meta };
  }

  @Post(':id/options')
  @HttpCode(HttpStatus.CREATED)
  async createOption(@Param('id') id: string, @Body() dto: CreateAttributeOptionDto) {
    return { data: await this.attributes.createOption(id, dto) };
  }

  @Patch(':id/options/:optionId')
  async updateOption(
    @Param('id') id: string,
    @Param('optionId') optionId: string,
    @Body() dto: UpdateAttributeOptionDto,
  ) {
    return { data: await this.attributes.updateOption(id, optionId, dto) };
  }

  @Delete(':id/options/:optionId')
  async removeOption(@Param('id') id: string, @Param('optionId') optionId: string) {
    return { data: await this.attributes.removeOption(id, optionId) };
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    return { data: await this.attributes.get(id) };
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateAttributeDto) {
    return { data: await this.attributes.update(id, dto) };
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    return { data: await this.attributes.remove(id) };
  }
}
