import { Type } from 'class-transformer';
import { IsIn, IsObject, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { LeadConsent } from '@fakhri/prisma';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { IMPORT_LIMITS } from './lead-import';

export class ImportLeadsDto {
  @IsString()
  @MinLength(1)
  @MaxLength(IMPORT_LIMITS.maxBytes)
  csv!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  fileName?: string;

  /** Header → lead field. When set, aliases are not used. */
  @IsOptional()
  @IsObject()
  columns?: Record<string, string>;
}

export class SetConsentDto {
  @IsIn([LeadConsent.OPTED_IN, LeadConsent.OPTED_OUT])
  consent!: LeadConsent;
}

export class OptOutLeadDto {
  @IsString()
  @MinLength(1)
  @MaxLength(20)
  phone!: string;
}

export class ListLeadsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  q?: string;

  @IsOptional()
  @IsIn([LeadConsent.UNKNOWN, LeadConsent.OPTED_IN, LeadConsent.OPTED_OUT])
  consent?: LeadConsent;

  @IsOptional()
  @Type(() => String)
  @IsString()
  @MaxLength(80)
  city?: string;
}
