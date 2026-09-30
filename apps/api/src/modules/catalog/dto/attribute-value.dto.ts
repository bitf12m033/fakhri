import { Allow, IsArray, IsBoolean, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class AttributeValueDto {
  @IsString()
  attributeId!: string;

  @IsOptional()
  @IsString()
  optionValueId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  numberValue?: string;

  @IsOptional()
  @IsBoolean()
  booleanValue?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  textValue?: string;

  /** Typed again in attribute-rules; whitelist must keep the raw JSON. */
  @IsOptional()
  @Allow()
  jsonValue?: unknown;
}

export class ReplaceAttributeValuesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AttributeValueDto)
  values!: AttributeValueDto[];
}
