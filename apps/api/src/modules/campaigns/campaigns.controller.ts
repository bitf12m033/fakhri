import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { UserRole } from '@fakhri/prisma';
import { Roles } from '../auth/auth.decorators';
import { AudienceDto, CreateTemplateDto, ListCampaignsQueryDto, SendCampaignDto } from './campaigns.dto';
import { CampaignsService } from './campaigns.service';

@Controller('admin/campaign-templates')
@Roles(UserRole.MARKETING)
export class CampaignTemplatesController {
  constructor(private readonly campaigns: CampaignsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateTemplateDto) {
    return { data: await this.campaigns.createTemplate(dto) };
  }

  @Get()
  async list(@Query() query: ListCampaignsQueryDto) {
    const result = await this.campaigns.listTemplates(query);
    return { data: result.items, meta: result.meta };
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  async approve(@Param('id') id: string) {
    return { data: await this.campaigns.approveTemplate(id) };
  }
}

@Controller('admin/campaigns')
@Roles(UserRole.MARKETING)
export class CampaignsController {
  constructor(private readonly campaigns: CampaignsService) {}

  @Post('preview')
  @HttpCode(HttpStatus.OK)
  async preview(@Body() dto: AudienceDto) {
    return { data: await this.campaigns.preview(dto) };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async send(@Body() dto: SendCampaignDto) {
    return { data: await this.campaigns.send(dto) };
  }

  @Get()
  async list(@Query() query: ListCampaignsQueryDto) {
    const result = await this.campaigns.list(query);
    return { data: result.items, meta: result.meta };
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    return { data: await this.campaigns.get(id) };
  }
}
