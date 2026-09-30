import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min, MinLength, NotEquals } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

export class CreateWarehouseDto {
  @IsString()
  @MinLength(2)
  @MaxLength(20)
  code!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsString()
  @MinLength(4)
  @MaxLength(300)
  address!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(60)
  city!: string;

  @IsOptional()
  @IsString()
  @MaxLength(24)
  phone?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CreateInventoryItemDto {
  @IsString()
  @IsNotEmpty()
  warehouseId!: string;

  @IsString()
  @IsNotEmpty()
  variantId!: string;

  /** Opening stock, recorded as a RECEIPT in the ledger. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  onHand?: number;
}

export class ListInventoryQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  variantId?: string;

  @IsOptional()
  @IsString()
  warehouseId?: string;

  @IsOptional()
  @IsString()
  sku?: string;

  /** Only rows whose sellable count is at or below this number. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  maxAvailable?: number;
}

export class CreateAdjustmentDto {
  @IsString()
  @IsNotEmpty()
  warehouseId!: string;

  @IsString()
  @IsNotEmpty()
  variantId!: string;

  /** Signed: positive receives stock, negative writes it off. */
  @Type(() => Number)
  @IsInt()
  @NotEquals(0)
  quantity!: number;

  @IsString()
  @MinLength(3)
  @MaxLength(200)
  reason!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class LedgerQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  variantId?: string;

  @IsOptional()
  @IsString()
  warehouseId?: string;
}
