import { IsBoolean, IsEmail, IsOptional, IsString, Length, MaxLength, MinLength } from 'class-validator';

export class CustomerRegisterDto {
  @IsString()
  @MaxLength(24)
  phone!: string;

  @IsString()
  @MaxLength(200)
  password!: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(200)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  lastName?: string;

  @IsOptional()
  @IsBoolean()
  whatsappConsent?: boolean;
}

export class CustomerLoginDto {
  @IsString()
  @MaxLength(24)
  phone!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  password!: string;
}

export class OtpRequestDto {
  @IsString()
  @MaxLength(24)
  phone!: string;
}

export class OtpVerifyDto {
  @IsString()
  @MaxLength(24)
  phone!: string;

  @IsString()
  @Length(6, 6)
  code!: string;
}

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  lastName?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(200)
  email?: string;

  @IsOptional()
  @IsBoolean()
  whatsappConsent?: boolean;
}

export class CreateAddressDto {
  @IsOptional()
  @IsString()
  @MaxLength(40)
  label?: string;

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

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

export class UpdateAddressDto {
  @IsOptional()
  @IsString()
  @MaxLength(40)
  label?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  recipientName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(24)
  phone?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  province?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  area?: string;

  @IsOptional()
  @IsString()
  @MinLength(5)
  @MaxLength(300)
  addressLine?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  landmark?: string;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

export class SetPasswordDto {
  /** Required only when the account already has a password. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  currentPassword?: string;

  @IsString()
  @MaxLength(200)
  newPassword!: string;
}

export class AddWishlistItemDto {
  @IsString()
  @MaxLength(40)
  variantId!: string;
}
