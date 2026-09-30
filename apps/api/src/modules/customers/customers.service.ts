import { Injectable } from '@nestjs/common';
import { Prisma } from '@fakhri/prisma';
import { conflict, notFound } from '@fakhri/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdateProfileDto } from './customer.dto';

export interface CustomerView {
  id: string;
  phone: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  isPhoneVerified: boolean;
  whatsappConsent: boolean;
  hasPassword: boolean;
  createdAt: string;
}

/** Customer's own profile (REQ-14). Credentials are never part of the view. */
@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  async me(customerId: string): Promise<CustomerView> {
    const row = await this.prisma.customer.findUnique({ where: { id: customerId } });
    if (!row) throw notFound('Customer');
    return serialize(row);
  }

  async update(customerId: string, dto: UpdateProfileDto): Promise<CustomerView> {
    await this.me(customerId);
    const updated = await this.prisma.customer
      .update({
        where: { id: customerId },
        data: {
          firstName: dto.firstName,
          lastName: dto.lastName,
          email: dto.email?.trim().toLowerCase(),
          whatsappConsent: dto.whatsappConsent,
        },
      })
      .catch((error: unknown) => {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          throw conflict('Email is already in use');
        }
        throw error;
      });
    return serialize(updated);
  }
}

function serialize(row: {
  id: string;
  phone: string;
  email: string | null;
  passwordHash: string | null;
  firstName: string | null;
  lastName: string | null;
  isPhoneVerified: boolean;
  whatsappConsent: boolean;
  createdAt: Date;
}): CustomerView {
  return {
    id: row.id,
    phone: row.phone,
    email: row.email,
    firstName: row.firstName,
    lastName: row.lastName,
    isPhoneVerified: row.isPhoneVerified,
    whatsappConsent: row.whatsappConsent,
    hasPassword: row.passwordHash !== null,
    createdAt: row.createdAt.toISOString(),
  };
}
