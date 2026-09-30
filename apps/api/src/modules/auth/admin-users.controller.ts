import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import { UserRole } from '@fakhri/prisma';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { AdminUsersService } from './admin-users.service';
import { Roles } from './auth.decorators';
import { CreateAdminUserDto, UpdateAdminUserDto } from './auth.dto';
import { CurrentPrincipal, Principal } from './principal';

@Controller('admin/users')
@Roles(UserRole.SUPER_ADMIN)
export class AdminUsersController {
  constructor(private readonly users: AdminUsersService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateAdminUserDto) {
    return { data: await this.users.create(dto) };
  }

  @Get()
  async list(@Query() query: PaginationQueryDto) {
    const result = await this.users.list(query);
    return { data: result.items, meta: result.meta };
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    return { data: await this.users.get(id) };
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateAdminUserDto,
    @CurrentPrincipal() actor: Principal,
  ) {
    return { data: await this.users.update(id, dto, actor) };
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @CurrentPrincipal() actor: Principal) {
    return { data: await this.users.remove(id, actor) };
  }
}
