import { Injectable } from '@nestjs/common';
import { conflict, invalidInput, notFound } from '@fakhri/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateAddressDto, UpdateAddressDto } from './customer.dto';
import { normalizePhone } from './phone';

export const MAX_ADDRESSES = 20;

export interface AddressView {
  id: string;
  label: string | null;
  recipientName: string;
  phone: string;
  province: string;
  city: string;
  area: string | null;
  addressLine: string;
  landmark: string | null;
  isDefault: boolean;
}

/**
 * Address book (REQ-14). Exactly one address is the default: the first one is
 * promoted automatically, and deleting the default promotes the next oldest.
 */
@Injectable()
export class AddressesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(customerId: string): Promise<AddressView[]> {
    const rows = await this.prisma.customerAddress.findMany({
      where: { customerId },
      orderBy: [{ isDefault: 'desc' }, { id: 'asc' }],
    });
    return rows.map(serialize);
  }

  async create(customerId: string, dto: CreateAddressDto): Promise<AddressView> {
    const count = await this.prisma.customerAddress.count({ where: { customerId } });
    if (count >= MAX_ADDRESSES) throw conflict(`You can save at most ${MAX_ADDRESSES} addresses`);
    // The first address is the default whatever the request says: exactly one default, always.
    const isDefault = count === 0 || (dto.isDefault ?? false);

    const created = await this.prisma.$transaction(async (tx) => {
      if (isDefault) {
        await tx.customerAddress.updateMany({ where: { customerId, isDefault: true }, data: { isDefault: false } });
      }
      return tx.customerAddress.create({
        data: {
          customerId,
          label: dto.label,
          recipientName: dto.recipientName,
          phone: normalizePhone(dto.phone),
          province: dto.province,
          city: dto.city,
          area: dto.area,
          addressLine: dto.addressLine,
          landmark: dto.landmark,
          isDefault,
        },
      });
    });
    return serialize(created);
  }

  async update(customerId: string, id: string, dto: UpdateAddressDto): Promise<AddressView> {
    const existing = await this.require(customerId, id);
    if (dto.isDefault === false && existing.isDefault) {
      throw invalidInput('Set another address as default instead of unsetting this one');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      if (dto.isDefault === true) {
        await tx.customerAddress.updateMany({
          where: { customerId, isDefault: true, NOT: { id } },
          data: { isDefault: false },
        });
      }
      return tx.customerAddress.update({
        where: { id },
        data: {
          label: dto.label,
          recipientName: dto.recipientName,
          phone: dto.phone === undefined ? undefined : normalizePhone(dto.phone),
          province: dto.province,
          city: dto.city,
          area: dto.area,
          addressLine: dto.addressLine,
          landmark: dto.landmark,
          isDefault: dto.isDefault,
        },
      });
    });
    return serialize(updated);
  }

  async remove(customerId: string, id: string): Promise<{ id: string }> {
    const existing = await this.require(customerId, id);
    await this.prisma.$transaction(async (tx) => {
      await tx.customerAddress.delete({ where: { id } });
      if (existing.isDefault) {
        const next = await tx.customerAddress.findFirst({ where: { customerId }, orderBy: { id: 'asc' } });
        if (next) await tx.customerAddress.update({ where: { id: next.id }, data: { isDefault: true } });
      }
    });
    return { id };
  }

  private async require(customerId: string, id: string) {
    const row = await this.prisma.customerAddress.findFirst({ where: { id, customerId } });
    if (!row) throw notFound('Address');
    return row;
  }
}

function serialize(row: {
  id: string;
  label: string | null;
  recipientName: string;
  phone: string;
  province: string;
  city: string;
  area: string | null;
  addressLine: string;
  landmark: string | null;
  isDefault: boolean;
}): AddressView {
  return {
    id: row.id,
    label: row.label,
    recipientName: row.recipientName,
    phone: row.phone,
    province: row.province,
    city: row.city,
    area: row.area,
    addressLine: row.addressLine,
    landmark: row.landmark,
    isDefault: row.isDefault,
  };
}
