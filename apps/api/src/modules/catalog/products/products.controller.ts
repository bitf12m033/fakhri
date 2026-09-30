import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ReplaceAttributeValuesDto } from '../dto/attribute-value.dto';
import { ProductsService } from './products.service';
import {
  CreateImageDto,
  CreateProductDto,
  ListProductsQueryDto,
  UpdateImageDto,
  UpdateProductDto,
  UpdateVariantDto,
  VariantInputDto,
} from './product.dto';

@Controller('admin/products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateProductDto) {
    return { data: await this.products.create(dto) };
  }

  @Get()
  async list(@Query() query: ListProductsQueryDto) {
    const result = await this.products.list(query);
    return { data: result.items, meta: result.meta };
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    return { data: await this.products.get(id) };
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateProductDto) {
    return { data: await this.products.update(id, dto) };
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    return { data: await this.products.remove(id) };
  }

  @Get(':id/variants')
  async listVariants(@Param('id') id: string) {
    return { data: await this.products.listVariants(id) };
  }

  @Post(':id/variants')
  @HttpCode(HttpStatus.CREATED)
  async createVariant(@Param('id') id: string, @Body() dto: VariantInputDto) {
    return { data: await this.products.createVariant(id, dto) };
  }

  @Patch(':id/variants/:variantId')
  async updateVariant(@Param('id') id: string, @Param('variantId') variantId: string, @Body() dto: UpdateVariantDto) {
    return { data: await this.products.updateVariant(id, variantId, dto) };
  }

  @Delete(':id/variants/:variantId')
  async removeVariant(@Param('id') id: string, @Param('variantId') variantId: string) {
    return { data: await this.products.removeVariant(id, variantId) };
  }

  @Put(':id/variants/:variantId/attribute-values')
  async replaceVariantValues(
    @Param('id') id: string,
    @Param('variantId') variantId: string,
    @Body() dto: ReplaceAttributeValuesDto,
  ) {
    return { data: await this.products.replaceVariantAttributeValues(id, variantId, dto.values) };
  }

  @Get(':id/images')
  async listImages(@Param('id') id: string) {
    return { data: await this.products.listImages(id) };
  }

  @Post(':id/images')
  @HttpCode(HttpStatus.CREATED)
  async createImage(@Param('id') id: string, @Body() dto: CreateImageDto) {
    return { data: await this.products.createImage(id, dto) };
  }

  @Patch(':id/images/:imageId')
  async updateImage(@Param('id') id: string, @Param('imageId') imageId: string, @Body() dto: UpdateImageDto) {
    return { data: await this.products.updateImage(id, imageId, dto) };
  }

  @Delete(':id/images/:imageId')
  async removeImage(@Param('id') id: string, @Param('imageId') imageId: string) {
    return { data: await this.products.removeImage(id, imageId) };
  }

  @Put(':id/attribute-values')
  async replaceValues(@Param('id') id: string, @Body() dto: ReplaceAttributeValuesDto) {
    return { data: await this.products.replaceAttributeValues(id, dto.values) };
  }
}
