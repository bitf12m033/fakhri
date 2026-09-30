import { IsEmail, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { PaymentStatus } from '@fakhri/prisma';

/**
 * A guest has no account to authenticate with, so they prove ownership of the
 * order with its reference plus the phone number they placed it with.
 */
export class InitiatePaymentDto {
  @IsOptional()
  @IsString()
  @MaxLength(40)
  refNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(24)
  guestPhone?: string;
}

export class GatewayCallbackDto {
  @IsString()
  @MinLength(4)
  @MaxLength(80)
  ref!: string;

  @IsIn(['SUCCEEDED', 'FAILED', 'succeeded', 'failed'])
  status!: string;

  @IsString()
  @MaxLength(20)
  amount!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(200)
  payerEmail?: string;
}

/** Manual correction by an operator: a bank transfer landed, COD came in early. */
export class SetPaymentStatusDto {
  @IsIn([PaymentStatus.SUCCEEDED, PaymentStatus.COLLECTED, PaymentStatus.FAILED])
  status!: PaymentStatus;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  reference?: string;
}
