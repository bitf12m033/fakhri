import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { ProductStatus } from '@fakhri/prisma';
import { AttributeValueDto } from '../dto/attribute-value.dto';
import { ListQueryDto } from '../dto/list-query.dto';
import { SeoDto } from '../dto/seo.dto';

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MONEY = /^\d+(\.\d{1,2})?$/;
const DECIMAL_3 = /^\d+(\.\d{1,3})?$/;
const SKU = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

export class VariantInputDto {
  @Matches(SKU, { message: 'sku must be 1-64 letters, numbers, dots, underscores, or hyphens' })
  sku!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @Matches(/^[A-Za-z0-9-]{1,32}$/)
  barcode?: string;

  @Matches(MONEY, { message: 'price must be a non-negative amount with up to 2 decimal places' })
  price!: string;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Matches(MONEY, { message: 'compareAtPrice must be a non-negative amount with up to 2 decimal places' })
  compareAtPrice?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Matches(MONEY, { message: 'costPrice must be a non-negative amount with up to 2 decimal places' })
  costPrice?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Matches(DECIMAL_3)
  weightKg?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Matches(MONEY)
  heightCm?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Matches(MONEY)
  widthCm?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Matches(MONEY)
  depthCm?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsBoolean()
  isAvailableOnOrder?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AttributeValueDto)
  attributeValues?: AttributeValueDto[];
}

export class UpdateVariantDto {
  @IsOptional()
  @Matches(SKU, { message: 'sku must be 1-64 letters, numbers, dots, underscores, or hyphens' })
  sku?: string;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(120)
  name?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Matches(/^[A-Za-z0-9-]{1,32}$/)
  barcode?: string | null;

  @IsOptional()
  @Matches(MONEY, { message: 'price must be a non-negative amount with up to 2 decimal places' })
  price?: string;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Matches(MONEY, { message: 'compareAtPrice must be a non-negative amount with up to 2 decimal places' })
  compareAtPrice?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Matches(MONEY, { message: 'costPrice must be a non-negative amount with up to 2 decimal places' })
  costPrice?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Matches(DECIMAL_3)
  weightKg?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Matches(MONEY)
  heightCm?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Matches(MONEY)
  widthCm?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Matches(MONEY)
  depthCm?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsBoolean()
  isAvailableOnOrder?: boolean;
}

export class NewImageDto {
  @IsUrl({ require_protocol: true, require_tld: false })
  @MaxLength(2000)
  url!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  alt?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1000)
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;
}

export class CreateImageDto extends NewImageDto {
  @IsOptional()
  @IsString()
  variantId?: string;
}

export class UpdateImageDto {
  @IsOptional()
  @IsUrl({ require_protocol: true, require_tld: false })
  @MaxLength(2000)
  url?: string;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(200)
  alt?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1000)
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  variantId?: string | null;
}

export class CreateProductDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @Matches(SLUG, { message: 'slug must be lowercase letters, numbers, and hyphens' })
  @MaxLength(80)
  slug?: string;

  @IsString()
  brandId!: string;

  @IsString()
  categoryId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  shortDescription?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20_000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  warrantyInfo?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  tags?: string[];

  @IsOptional()
  @IsEnum(ProductStatus)
  status?: ProductStatus;

  @IsOptional()
  @IsBoolean()
  isFeatured?: boolean;

  @IsOptional()
  @ValidateNested()
  @Type(() => SeoDto)
  seo?: SeoDto;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => VariantInputDto)
  variants?: VariantInputDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => NewImageDto)
  images?: NewImageDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AttributeValueDto)
  attributeValues?: AttributeValueDto[];
}

export class UpdateProductDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @Matches(SLUG, { message: 'slug must be lowercase letters, numbers, and hyphens' })
  @MaxLength(80)
  slug?: string;

  @IsOptional()
  @IsString()
  brandId?: string;

  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(500)
  shortDescription?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(20_000)
  description?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(2000)
  warrantyInfo?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  tags?: string[];

  @IsOptional()
  @IsEnum(ProductStatus)
  status?: ProductStatus;

  @IsOptional()
  @IsBoolean()
  isFeatured?: boolean;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @ValidateNested()
  @Type(() => SeoDto)
  seo?: SeoDto | null;
}

export class ListProductsQueryDto extends ListQueryDto {
  @IsOptional()
  @IsEnum(ProductStatus)
  status?: ProductStatus;

  @IsOptional()
  @IsString()
  brandId?: string;

  @IsOptional()
  @IsString()
  categoryId?: string;
}
