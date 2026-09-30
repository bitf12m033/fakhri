import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { ProductSearchService } from './product-search.service';
import { PublicCompareController, PublicProductsController } from './search.controller';

/**
 * Public search and product reads (increment 3.3). Consumes the catalog module's
 * storefront projections and category template; nothing in catalog depends on search.
 */
@Module({
  imports: [CatalogModule],
  controllers: [PublicProductsController, PublicCompareController],
  providers: [ProductSearchService],
})
export class SearchModule {}
