import { Module } from '@nestjs/common';
import { AttributesController } from './attributes/attributes.controller';
import { AttributesService } from './attributes/attributes.service';
import { BrandsController } from './brands/brands.controller';
import { BrandsService } from './brands/brands.service';
import { CategoriesController } from './categories/categories.controller';
import { CategoriesService } from './categories/categories.service';
import { AttributeValuesService } from './products/attribute-values.service';
import { ProductsController } from './products/products.controller';
import { ProductsService } from './products/products.service';

/**
 * Catalog admin CRUD (increment 3.2). Authentication and RBAC are increment 3.4;
 * until then these routes are reachable without a token and every mutation is audited
 * as an admin action with no actor id. Public read/search APIs are increment 3.3.
 */
@Module({
  controllers: [CategoriesController, BrandsController, AttributesController, ProductsController],
  providers: [CategoriesService, BrandsService, AttributesService, AttributeValuesService, ProductsService],
})
export class CatalogModule {}
