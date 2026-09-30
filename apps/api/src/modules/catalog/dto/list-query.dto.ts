import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';

export class ListQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  q?: string;
}

export class ActiveFilterQueryDto extends ListQueryDto {
  @IsOptional()
  @IsIn(['true', 'false'])
  isActive?: 'true' | 'false';
}
