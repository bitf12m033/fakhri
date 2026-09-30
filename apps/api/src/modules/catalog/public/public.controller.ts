import { Controller, Get, Param, Query } from '@nestjs/common';
import { Public } from '../../auth/auth.decorators';
import { ListQueryDto } from '../dto/list-query.dto';
import { StorefrontService } from './storefront.service';

@Controller('categories')
@Public()
export class PublicCategoriesController {
  constructor(private readonly storefront: StorefrontService) {}

  /** Active nav tree (REQ-01). Bounded by the category tree itself, so not paginated. */
  @Get()
  async tree() {
    return { data: await this.storefront.categoryTree() };
  }

  @Get(':slug/tree')
  async subtree(@Param('slug') slug: string) {
    return { data: await this.storefront.categoryWithTree(slug) };
  }
}

@Controller('brands')
@Public()
export class PublicBrandsController {
  constructor(private readonly storefront: StorefrontService) {}

  @Get()
  async list(@Query() query: ListQueryDto) {
    const result = await this.storefront.brands(query);
    return { data: result.items, meta: result.meta };
  }

  @Get(':slug')
  async get(@Param('slug') slug: string) {
    return { data: await this.storefront.brand(slug) };
  }
}
