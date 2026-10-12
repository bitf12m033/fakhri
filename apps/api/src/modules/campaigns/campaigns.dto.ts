import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { CAMPAIGN_LIMITS } from './template';

export class CreateTemplateDto {
  @IsString()
  @MinLength(1)
  @MaxLength(CAMPAIGN_LIMITS.maxName)
  name!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(CAMPAIGN_LIMITS.maxBody)
  body!: string;

  /** Meta template name. Required only when delivery uses the Cloud API. */
  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9_]{1,512}$/)
  providerTemplateName?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[a-z]{2}(_[A-Z]{2})?$/)
  language?: string;
}

export class AudienceDto {
  @IsString()
  @MinLength(1)
  templateId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  productInterest?: string;
}

export class SendCampaignDto extends AudienceDto {
  @IsString()
  @MinLength(1)
  @MaxLength(CAMPAIGN_LIMITS.maxName)
  name!: string;
}

export class ListCampaignsQueryDto extends PaginationQueryDto {}
