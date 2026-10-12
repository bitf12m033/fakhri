import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import { UserRole } from '@fakhri/prisma';
import { Roles } from '../auth/auth.decorators';
import { ImportLeadsDto, ListLeadsQueryDto, OptOutLeadDto, SetConsentDto } from './leads.dto';
import { LeadsService } from './leads.service';

@Controller('admin/leads')
@Roles(UserRole.MARKETING)
export class LeadsController {
  constructor(private readonly leads: LeadsService) {}

  @Get()
  async list(@Query() query: ListLeadsQueryDto) {
    const result = await this.leads.list(query);
    return { data: result.items, meta: result.meta };
  }

  @Post('imports/preview')
  @HttpCode(HttpStatus.OK)
  async preview(@Body() dto: ImportLeadsDto) {
    return { data: await this.leads.preview(dto) };
  }

  @Post('imports')
  @HttpCode(HttpStatus.CREATED)
  async commit(@Body() dto: ImportLeadsDto) {
    return { data: await this.leads.commit(dto) };
  }

  @Post('opt-out')
  @HttpCode(HttpStatus.OK)
  async optOut(@Body() dto: OptOutLeadDto) {
    return { data: await this.leads.optOut(dto) };
  }

  @Patch(':id/consent')
  async setConsent(@Param('id') id: string, @Body() dto: SetConsentDto) {
    return { data: await this.leads.setConsent(id, dto) };
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    return { data: await this.leads.get(id) };
  }
}
