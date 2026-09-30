import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { CustomerRoute, RateLimit } from '../auth/auth.decorators';
import { CurrentCustomer, ReqContext, RequestContext } from '../auth/principal';
import { AddressesService } from './addresses.service';
import { CustomerAuthService } from './customer-auth.service';
import { CustomersService } from './customers.service';
import {
  AddWishlistItemDto,
  CreateAddressDto,
  SetPasswordDto,
  UpdateAddressDto,
  UpdateProfileDto,
} from './customer.dto';
import { WishlistService } from './wishlist.service';

/** Everything a signed-in customer can do to their own account (REQ-14/15). */
@Controller('customers/me')
@CustomerRoute()
export class CustomersController {
  constructor(
    private readonly customers: CustomersService,
    private readonly addresses: AddressesService,
    private readonly wishlist: WishlistService,
    private readonly auth: CustomerAuthService,
  ) {}

  @Get()
  async me(@CurrentCustomer() customerId: string) {
    return { data: await this.customers.me(customerId) };
  }

  @Patch()
  async update(@CurrentCustomer() customerId: string, @Body() dto: UpdateProfileDto) {
    return { data: await this.customers.update(customerId, dto) };
  }

  /**
   * Set or change the password. Dropping every other session is the point:
   * a change is also how a customer recovers after an OTP-only login.
   */
  @RateLimit({ limit: 5, windowSeconds: 300 })
  @Post('password')
  @HttpCode(HttpStatus.OK)
  async setPassword(
    @CurrentCustomer() customerId: string,
    @Body() dto: SetPasswordDto,
    @ReqContext() context: RequestContext,
  ) {
    return { data: await this.auth.setPassword(customerId, dto, context) };
  }

  @Get('addresses')
  async listAddresses(@CurrentCustomer() customerId: string) {
    return { data: await this.addresses.list(customerId) };
  }

  @Post('addresses')
  @HttpCode(HttpStatus.CREATED)
  async createAddress(@CurrentCustomer() customerId: string, @Body() dto: CreateAddressDto) {
    return { data: await this.addresses.create(customerId, dto) };
  }

  @Patch('addresses/:id')
  async updateAddress(
    @CurrentCustomer() customerId: string,
    @Param('id') id: string,
    @Body() dto: UpdateAddressDto,
  ) {
    return { data: await this.addresses.update(customerId, id, dto) };
  }

  @Delete('addresses/:id')
  async removeAddress(@CurrentCustomer() customerId: string, @Param('id') id: string) {
    return { data: await this.addresses.remove(customerId, id) };
  }

  @Get('wishlist')
  async listWishlist(@CurrentCustomer() customerId: string, @Query() query: PaginationQueryDto) {
    const result = await this.wishlist.list(customerId, query);
    return { data: result.items, meta: result.meta };
  }

  @Post('wishlist')
  @HttpCode(HttpStatus.CREATED)
  async addWishlist(@CurrentCustomer() customerId: string, @Body() dto: AddWishlistItemDto) {
    return { data: await this.wishlist.add(customerId, dto.variantId) };
  }

  @Delete('wishlist/:variantId')
  async removeWishlist(@CurrentCustomer() customerId: string, @Param('variantId') variantId: string) {
    return { data: await this.wishlist.remove(customerId, variantId) };
  }
}
