import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { OrderStatus, PaymentStatus } from '@fakhri/prisma';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

export class ListOrdersQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsIn(Object.values(OrderStatus))
  status?: OrderStatus;
}

export class AdminListOrdersQueryDto extends ListOrdersQueryDto {
  @IsOptional()
  @IsIn(Object.values(PaymentStatus))
  paymentStatus?: PaymentStatus;

  /** Order reference, or a customer/guest phone number. */
  @IsOptional()
  @IsString()
  @MaxLength(40)
  q?: string;
}

/**
 * A guest has no account, so they prove ownership of an order the same way they
 * do to pay for it: the reference plus the phone number it was placed with.
 */
export class GuestOrderLookupDto {
  @IsString()
  @MaxLength(40)
  refNumber!: string;

  @IsString()
  @MaxLength(24)
  phone!: string;
}

export class TransitionOrderDto {
  @IsIn(Object.values(OrderStatus))
  status!: OrderStatus;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}
