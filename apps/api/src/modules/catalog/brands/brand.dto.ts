import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { ActiveFilterQueryDto } from '../dto/list-query.dto';
import { SeoDto } from '../dto/seo.dto';

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export class CreateBrandDto {
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
  @MaxLength(5000)
  description?: string;

  @IsOptional()
  @IsUrl({ require_protocol: true, require_tld: false })
  @MaxLength(2000)
  logoUrl?: string;

  @IsOptional()
  @IsUrl({ require_protocol: true, require_tld: false })
  @MaxLength(2000)
  coverUrl?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @ValidateNested()
  @Type(() => SeoDto)
  seo?: SeoDto;
}

export class UpdateBrandDto {
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
  @MaxLength(5000)
  description?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUrl({ require_protocol: true, require_tld: false })
  @MaxLength(2000)
  logoUrl?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUrl({ require_protocol: true, require_tld: false })
  @MaxLength(2000)
  coverUrl?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @ValidateNested()
  @Type(() => SeoDto)
  seo?: SeoDto | null;
}

export class ListBrandsQueryDto extends ActiveFilterQueryDto {}
