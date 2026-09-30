import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
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
import { ActiveFilterQueryDto } from '../dto/list-query.dto';
import { SeoDto } from '../dto/seo.dto';

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export class CreateCategoryDto {
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  name!: string;

  @IsOptional()
  @Matches(SLUG, { message: 'slug must be lowercase letters, numbers, and hyphens' })
  @MaxLength(80)
  slug?: string;

  @IsOptional()
  @IsString()
  parentId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @IsOptional()
  @IsUrl({ require_protocol: true, require_tld: false })
  @MaxLength(2000)
  iconUrl?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100_000)
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @ValidateNested()
  @Type(() => SeoDto)
  seo?: SeoDto;
}

export class UpdateCategoryDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  name?: string;

  @IsOptional()
  @Matches(SLUG, { message: 'slug must be lowercase letters, numbers, and hyphens' })
  @MaxLength(80)
  slug?: string;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  parentId?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(5000)
  description?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUrl({ require_protocol: true, require_tld: false })
  @MaxLength(2000)
  iconUrl?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100_000)
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @ValidateNested()
  @Type(() => SeoDto)
  seo?: SeoDto | null;
}

export class ListCategoriesQueryDto extends ActiveFilterQueryDto {
  @IsOptional()
  @IsString()
  parentId?: string;

  @IsOptional()
  @IsIn(['true', 'false'])
  root?: 'true' | 'false';
}

export class CategoryAttributeBindingDto {
  @IsString()
  attributeId!: string;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(80)
  group?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100_000)
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isRequired?: boolean;

  @IsOptional()
  @IsBoolean()
  isFilterable?: boolean;

  @IsOptional()
  @IsBoolean()
  isComparable?: boolean;
}

export class ReplaceCategoryAttributesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CategoryAttributeBindingDto)
  bindings!: CategoryAttributeBindingDto[];
}
