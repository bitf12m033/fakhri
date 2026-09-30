import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsString, Max, MaxLength, Min } from 'class-validator';

export const CART_LIMITS = {
  lines: 50,
  quantityPerLine: 50,
} as const;

export class AddCartItemDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  variantId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(CART_LIMITS.quantityPerLine)
  quantity!: number;
}

export class UpdateCartItemDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(CART_LIMITS.quantityPerLine)
  quantity!: number;
}
