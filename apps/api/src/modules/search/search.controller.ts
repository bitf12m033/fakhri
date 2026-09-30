import { Controller, Get, Param, Query } from '@nestjs/common';
import { StorefrontService } from '../catalog/public/storefront.service';
import { ProductSearchService } from './product-search.service';
import { CompareQueryDto, SearchProductsQueryDto, SuggestQueryDto } from './search.dto';
import {
  parseAttributeFilters,
  parseCompareIds,
  parsePrice,
  parseSlugList,
  parseSort,
  parseTerm,
  SEARCH_LIMITS,
} from './search-query';

/**
 * Public product reads (increment 3.3). `suggest` is declared before `:slug` so the
 * literal route wins; keep it that way when adding routes here.
 */
@Controller('products')
export class PublicProductsController {
  constructor(
    private readonly search: ProductSearchService,
    private readonly storefront: StorefrontService,
  ) {}

  @Get()
  async list(@Query() query: SearchProductsQueryDto) {
    const term = parseTerm(query.q);
    const result = await this.search.search({
      term,
      categorySlug: query.category,
      brandSlugs: parseSlugList(query.brand, 'brand', SEARCH_LIMITS.brandFilters),
      attributes: parseAttributeFilters(query.attr),
      price: parsePrice(query.minPrice, query.maxPrice),
      sort: parseSort(query.sort, term !== undefined),
      page: query.page,
      pageSize: query.pageSize,
    });
    return { data: result.items, meta: result.meta };
  }

  @Get('suggest')
  async suggest(@Query() query: SuggestQueryDto) {
    return { data: await this.search.suggest(query.q.trim()) };
  }

  @Get(':slug')
  async detail(@Param('slug') slug: string) {
    return { data: await this.storefront.product(slug) };
  }
}

@Controller('compare')
export class PublicCompareController {
  constructor(private readonly storefront: StorefrontService) {}

  @Get()
  async compare(@Query() query: CompareQueryDto) {
    return { data: await this.storefront.compare(parseCompareIds(query.ids)) };
  }
}
