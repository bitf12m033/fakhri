import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { AttributeType } from '@fakhri/prisma';
import { ListQueryDto } from '../dto/list-query.dto';

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export class CreateAttributeDto {
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
  @MaxLength(2000)
  description?: string;

  @IsEnum(AttributeType)
  type!: AttributeType;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  unit?: string;

  @IsOptional()
  @IsObject()
  validation?: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  isSearchable?: boolean;

  @IsOptional()
  @IsBoolean()
  isComparable?: boolean;
}

export class UpdateAttributeDto {
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
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @IsOptional()
  @IsEnum(AttributeType)
  type?: AttributeType;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  unit?: string | null;

  @IsOptional()
  @IsObject()
  validation?: Record<string, unknown> | null;

  @IsOptional()
  @IsBoolean()
  isSearchable?: boolean;

  @IsOptional()
  @IsBoolean()
  isComparable?: boolean;
}

export class ListAttributesQueryDto extends ListQueryDto {
  @IsOptional()
  @IsEnum(AttributeType)
  type?: AttributeType;
}

export class CreateAttributeOptionDto {
  @Matches(SLUG, { message: 'value must be lowercase letters, numbers, and hyphens' })
  @MaxLength(80)
  value!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  label!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100_000)
  sortOrder?: number;
}

export class UpdateAttributeOptionDto {
  @IsOptional()
  @Matches(SLUG, { message: 'value must be lowercase letters, numbers, and hyphens' })
  @MaxLength(80)
  value?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  label?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100_000)
  sortOrder?: number;
}
