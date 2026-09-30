import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { OptionalAuth } from '../auth/auth.decorators';
import { CartContext } from './cart-identity';
import { AddCartItemDto, UpdateCartItemDto } from './cart.dto';
import { CartOwner, CartService } from './cart.service';

/**
 * Cart (REQ-18). Open to guests and customers alike: a guest keeps the token
 * returned in `token` and sends it back as `X-Cart-Token`.
 */
@Controller('cart')
@OptionalAuth()
export class CartController {
  constructor(private readonly cart: CartService) {}

  @Get()
  async view(@CartContext() owner: CartOwner) {
    return { data: await this.cart.view(owner) };
  }

  @Post('items')
  async add(@CartContext() owner: CartOwner, @Body() dto: AddCartItemDto) {
    return { data: await this.cart.addItem(owner, dto) };
  }

  @Patch('items/:itemId')
  async update(
    @CartContext() owner: CartOwner,
    @Param('itemId') itemId: string,
    @Body() dto: UpdateCartItemDto,
  ) {
    return { data: await this.cart.updateItem(owner, itemId, dto.quantity) };
  }

  @Delete('items/:itemId')
  async remove(@CartContext() owner: CartOwner, @Param('itemId') itemId: string) {
    return { data: await this.cart.removeItem(owner, itemId) };
  }
}
