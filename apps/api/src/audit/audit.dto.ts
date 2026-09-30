import { IsDateString, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../common/dto/pagination.dto';

export class AuditLogQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsIn(['ADMIN', 'CUSTOMER', 'SYSTEM'])
  actorType?: 'ADMIN' | 'CUSTOMER' | 'SYSTEM';

  @IsOptional()
  @IsString()
  @MaxLength(40)
  actorId?: string;

  /** Matched as a prefix, so `catalog.` returns everything in the catalog. */
  @IsOptional()
  @IsString()
  @MaxLength(80)
  action?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  entityType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  entityId?: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}
