import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { ShipmentStatus } from '@fakhri/prisma';

export class UpsertShipmentDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  carrier?: string;

  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(80)
  trackingCode?: string;
}

export class ShipmentEventDto {
  @IsIn(Object.values(ShipmentStatus))
  status!: ShipmentStatus;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  location?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}
