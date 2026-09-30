import { Type } from 'class-transformer';
import {
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { DeliveryType, PaymentMethod } from '@fakhri/prisma';

/** Online methods arrive with the gateway adapter in increment 3.6. */
export const SUPPORTED_PAYMENT_METHODS = [PaymentMethod.COD] as const;

export class CheckoutAddressDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  recipientName!: string;

  @IsString()
  @MaxLength(24)
  phone!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(60)
  province!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(60)
  city!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  area?: string;

  @IsString()
  @MinLength(5)
  @MaxLength(300)
  addressLine!: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  landmark?: string;
}

export class CheckoutDto {
  @IsIn(Object.values(DeliveryType))
  deliveryType!: DeliveryType;

  @IsIn(SUPPORTED_PAYMENT_METHODS)
  paymentMethod!: PaymentMethod;

  /** A signed-in customer may point at their address book instead of repeating it. */
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  addressId?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => CheckoutAddressDto)
  address?: CheckoutAddressDto;

  /** Required for guests, who have no account to read contact details from. */
  @IsOptional()
  @IsString()
  @MaxLength(24)
  guestPhone?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(200)
  guestEmail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  customerNote?: string;
}
