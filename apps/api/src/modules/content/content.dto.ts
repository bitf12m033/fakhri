import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { SeoDto } from '../catalog/dto/seo.dto';

/** Positions are storefront-defined names, e.g. `home-hero`, `plp-sidebar`. */
const POSITION = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
/** Same rule as catalog images: an absolute URL, and a TLD-less host is fine (MinIO, localhost). */
const IMAGE_URL = { require_protocol: true, require_tld: false };

export class CreatePageDto {
  @IsString()
  @MaxLength(80)
  @Matches(POSITION, { message: 'slug must be lowercase letters, numbers and hyphens' })
  slug!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(160)
  title!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100_000)
  body!: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => SeoDto)
  seo?: SeoDto;

  @IsOptional()
  @IsBoolean()
  isPublished?: boolean;
}

export class UpdatePageDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  title?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100_000)
  body?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => SeoDto)
  seo?: SeoDto;

  @IsOptional()
  @IsBoolean()
  isPublished?: boolean;
}

export class ListPagesQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  q?: string;
}

export class CreateBannerDto {
  @IsOptional()
  @IsString()
  @MaxLength(160)
  title?: string;

  @IsUrl(IMAGE_URL)
  @MaxLength(500)
  imageUrl!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  linkUrl?: string;

  @IsString()
  @MaxLength(40)
  @Matches(POSITION, { message: 'position must be lowercase letters, numbers and hyphens' })
  position!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @IsOptional()
  @IsDateString()
  endsAt?: string;
}

export class UpdateBannerDto {
  @IsOptional()
  @IsString()
  @MaxLength(160)
  title?: string;

  @IsOptional()
  @IsUrl(IMAGE_URL)
  @MaxLength(500)
  imageUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  linkUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  @Matches(POSITION, { message: 'position must be lowercase letters, numbers and hyphens' })
  position?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @IsOptional()
  @IsDateString()
  endsAt?: string;
}

export class BannerQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(40)
  position?: string;
}
