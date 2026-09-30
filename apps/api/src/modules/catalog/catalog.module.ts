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
import { PublicBrandsController, PublicCategoriesController } from './public/public.controller';
import { StorefrontService } from './public/storefront.service';
import { SearchDocumentService } from './search-document.service';
import { SearchIndexController } from './search-index.controller';

/**
 * Catalog admin CRUD (increment 3.2) plus storefront category and brand reads
 * (increment 3.3). Authentication and RBAC are increment 3.4; until then the /admin
 * routes are reachable without a token and every mutation is audited as an admin
 * action with no actor id.
 *
 * StorefrontService and CategoriesService are exported for the search module.
 */
@Module({
  controllers: [
    CategoriesController,
    BrandsController,
    AttributesController,
    ProductsController,
    SearchIndexController,
    PublicCategoriesController,
    PublicBrandsController,
  ],
  providers: [
    CategoriesService,
    BrandsService,
    AttributesService,
    AttributeValuesService,
    ProductsService,
    SearchDocumentService,
    StorefrontService,
  ],
  exports: [StorefrontService, CategoriesService],
})
export class CatalogModule {}
