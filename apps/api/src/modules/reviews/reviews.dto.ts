import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsIn, IsInt, IsOptional, IsString, IsUrl, Max, MaxLength, Min } from 'class-validator';
import { ReviewStatus } from '@fakhri/prisma';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

export class CreateReviewDto {
  @IsString()
  @MaxLength(40)
  productId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  body?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(4)
  @IsUrl({}, { each: true })
  @MaxLength(500, { each: true })
  images?: string[];
}

export class ListReviewsQueryDto extends PaginationQueryDto {
  @IsString()
  @MaxLength(40)
  productId!: string;
}

export class AdminListReviewsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsIn(Object.values(ReviewStatus))
  status?: ReviewStatus;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  productId?: string;
}

export class ModerateReviewDto {
  @IsIn([ReviewStatus.APPROVED, ReviewStatus.REJECTED])
  status!: ReviewStatus;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}
