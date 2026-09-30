import { Transform } from 'class-transformer';
import { ArrayMaxSize, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { SEARCH_LIMITS, SORT_KEYS } from './search-query';

/** Express hands over a string for one occurrence and an array for several. */
const toArray = () =>
  Transform(({ value }: { value: unknown }) =>
    value === undefined ? undefined : Array.isArray(value) ? value.map(String) : [String(value)],
  );

export class SearchProductsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(SEARCH_LIMITS.termLength)
  q?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  category?: string;

  /** Repeatable: `brand=haier&brand=dawlance`, or comma-separated. */
  @IsOptional()
  @toArray()
  @ArrayMaxSize(SEARCH_LIMITS.brandFilters)
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  brand?: string[];

  /** Repeatable: `attr=energy:inverter,fixed&attr=cooling-btu:12000..18000`. */
  @IsOptional()
  @toArray()
  @ArrayMaxSize(SEARCH_LIMITS.attributeFilters)
  @IsString({ each: true })
  @MaxLength(400, { each: true })
  attr?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(20)
  minPrice?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  maxPrice?: string;

  /** One of SORT_KEYS; validated in the parser so the error lists the allowed values. */
  @IsOptional()
  @IsString()
  @MaxLength(20)
  sort?: (typeof SORT_KEYS)[number] | string;
}

export class SuggestQueryDto {
  @IsString()
  @MinLength(2)
  @MaxLength(SEARCH_LIMITS.termLength)
  q!: string;
}

export class CompareQueryDto {
  @IsString()
  @MaxLength(200)
  ids!: string;
}
