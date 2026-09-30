import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import { UserRole } from '@fakhri/prisma';
import { Public, Roles } from '../auth/auth.decorators';
import { ContentService } from './content.service';
import {
  BannerQueryDto,
  CreateBannerDto,
  CreatePageDto,
  ListPagesQueryDto,
  UpdateBannerDto,
  UpdatePageDto,
} from './content.dto';

@Controller('pages')
@Public()
export class PublicPagesController {
  constructor(private readonly content: ContentService) {}

  @Get(':slug')
  async get(@Param('slug') slug: string) {
    return { data: await this.content.publicPage(slug) };
  }
}

@Controller('banners')
@Public()
export class PublicBannersController {
  constructor(private readonly content: ContentService) {}

  @Get()
  async list(@Query() query: BannerQueryDto) {
    return { data: await this.content.publicBanners(query) };
  }
}

@Controller('admin/content')
@Roles(UserRole.MARKETING)
export class AdminContentController {
  constructor(private readonly content: ContentService) {}

  @Post('pages')
  @HttpCode(HttpStatus.CREATED)
  async createPage(@Body() dto: CreatePageDto) {
    return { data: await this.content.createPage(dto) };
  }

  @Get('pages')
  async listPages(@Query() query: ListPagesQueryDto) {
    const result = await this.content.listPages(query);
    return { data: result.items, meta: result.meta };
  }

  @Patch('pages/:id')
  async updatePage(@Param('id') id: string, @Body() dto: UpdatePageDto) {
    return { data: await this.content.updatePage(id, dto) };
  }

  @Delete('pages/:id')
  async removePage(@Param('id') id: string) {
    return { data: await this.content.removePage(id) };
  }

  @Post('banners')
  @HttpCode(HttpStatus.CREATED)
  async createBanner(@Body() dto: CreateBannerDto) {
    return { data: await this.content.createBanner(dto) };
  }

  @Get('banners')
  async listBanners() {
    return { data: await this.content.listBannersForAdmin() };
  }

  @Patch('banners/:id')
  async updateBanner(@Param('id') id: string, @Body() dto: UpdateBannerDto) {
    return { data: await this.content.updateBanner(id, dto) };
  }

  @Delete('banners/:id')
  async removeBanner(@Param('id') id: string) {
    return { data: await this.content.removeBanner(id) };
  }
}
