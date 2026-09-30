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

export class TransitionOrderDto {
  @IsIn(Object.values(OrderStatus))
  status!: OrderStatus;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}
