import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import { CouponApplies, CouponType } from '@fakhri/prisma';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

const MONEY = /^\d+(\.\d{1,2})?$/;

export class CreateCouponDto {
  @IsString()
  @MaxLength(32)
  code!: string;

  @IsIn(Object.values(CouponType))
  type!: CouponType;

  /** Amount for FIXED, percentage for PERCENT, ignored for FREE_SHIPPING. */
  @IsString()
  @Matches(MONEY, { message: 'value must be a non-negative amount' })
  value!: string;

  @IsOptional()
  @IsString()
  @Matches(MONEY, { message: 'maxDiscount must be a non-negative amount' })
  maxDiscount?: string;

  @IsOptional()
  @IsString()
  @Matches(MONEY, { message: 'minOrderValue must be a non-negative amount' })
  minOrderValue?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  usageLimit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  perCustomerLimit?: number;

  @IsOptional()
  @IsIn(Object.values(CouponApplies))
  appliesTo?: CouponApplies;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  appliesIds?: string[];

  @IsDateString()
  validFrom!: string;

  @IsOptional()
  @IsDateString()
  validTo?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateCouponDto {
  @IsOptional()
  @IsString()
  @Matches(MONEY, { message: 'value must be a non-negative amount' })
  value?: string;

  @IsOptional()
  @IsString()
  @Matches(MONEY, { message: 'maxDiscount must be a non-negative amount' })
  maxDiscount?: string;

  @IsOptional()
  @IsString()
  @Matches(MONEY, { message: 'minOrderValue must be a non-negative amount' })
  minOrderValue?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  usageLimit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  perCustomerLimit?: number;

  @IsOptional()
  @IsIn(Object.values(CouponApplies))
  appliesTo?: CouponApplies;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  appliesIds?: string[];

  @IsOptional()
  @IsDateString()
  validFrom?: string;

  @IsOptional()
  @IsDateString()
  validTo?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class ApplyCouponDto {
  @IsString()
  @MaxLength(32)
  code!: string;
}

export class ListCouponsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsIn(['true', 'false'])
  isActive?: 'true' | 'false';

  @IsOptional()
  @IsString()
  @MaxLength(32)
  q?: string;
}
