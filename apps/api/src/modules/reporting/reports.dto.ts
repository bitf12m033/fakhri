import { Type } from 'class-transformer';
import { IsDateString, IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { OrderStatus } from '@fakhri/prisma';

export class ReportRangeDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  /** `csv` returns a downloadable file instead of JSON. */
  @IsOptional()
  @IsIn(['json', 'csv'])
  format?: 'json' | 'csv';
}

export class SalesReportDto extends ReportRangeDto {
  @IsOptional()
  @IsIn(Object.values(OrderStatus))
  status?: OrderStatus;
}

export class TopProductsDto extends ReportRangeDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class LowStockDto {
  /** Rows at or below this sellable count. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10_000)
  threshold?: number;

  @IsOptional()
  @IsIn(['json', 'csv'])
  format?: 'json' | 'csv';
}
