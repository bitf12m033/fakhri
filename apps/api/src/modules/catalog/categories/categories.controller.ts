import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { CategoriesService } from './categories.service';
import {
  CreateCategoryDto,
  ListCategoriesQueryDto,
  ReplaceCategoryAttributesDto,
  UpdateCategoryDto,
} from './category.dto';

@Controller('admin/categories')
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateCategoryDto) {
    return { data: await this.categories.create(dto) };
  }

  @Get()
  async list(@Query() query: ListCategoriesQueryDto) {
    const result = await this.categories.list(query);
    return { data: result.items, meta: result.meta };
  }

  @Get('tree')
  async tree() {
    return { data: await this.categories.tree() };
  }

  @Get(':id/attribute-template')
  async template(@Param('id') id: string) {
    return { data: await this.categories.effectiveTemplate(id) };
  }

  @Get(':id/attributes')
  async bindings(@Param('id') id: string) {
    return { data: await this.categories.listBindings(id) };
  }

  @Put(':id/attributes')
  async replaceBindings(@Param('id') id: string, @Body() dto: ReplaceCategoryAttributesDto) {
    return { data: await this.categories.replaceBindings(id, dto.bindings) };
  }

  @Delete(':id/attributes/:attributeId')
  async removeBinding(@Param('id') id: string, @Param('attributeId') attributeId: string) {
    return { data: await this.categories.removeBinding(id, attributeId) };
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    return { data: await this.categories.get(id) };
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateCategoryDto) {
    return { data: await this.categories.update(id, dto) };
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    return { data: await this.categories.remove(id) };
  }
}
