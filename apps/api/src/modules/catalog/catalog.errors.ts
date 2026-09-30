import { AppError, invalidInput } from '@fakhri/shared';
import { Prisma } from '@fakhri/prisma';
import { PrismaService } from '../../prisma/prisma.service';

export const invalid = invalidInput;

/** Map Prisma failures onto the API error contract. AppError passes through. */
export function rethrowPrisma(error: unknown, entity: string): never {
  if (error instanceof AppError) throw error;

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') {
      const target = uniqueTarget(error);
      if (target.includes('slug')) throw new AppError('CONFLICT', 'Slug is already in use', { target });
      if (target.includes('sku')) throw new AppError('CONFLICT', 'SKU is already in use', { target });
      if (target.includes('barcode')) throw new AppError('CONFLICT', 'Barcode is already in use', { target });
      if (target.includes('value')) throw new AppError('CONFLICT', 'Option value is already in use', { target });
      throw new AppError('CONFLICT', `${entity} already exists`, { target });
    }
    if (error.code === 'P2003') {
      throw new AppError('CONFLICT', `${entity} is still referenced`, { field: error.meta?.field_name });
    }
    if (error.code === 'P2025') throw new AppError('NOT_FOUND', `${entity} not found`);
    if (error.code === 'P2004') throw invalid('Value failed a database check constraint');
  }

  const message = error instanceof Error ? error.message : '';
  if (message.includes('PAV_exactly_one_value_kind') || message.includes('PAV_scope_product_xor_variant')) {
    throw invalid('Attribute value does not match its type');
  }
  if (message.includes('PV_price_non_negative')) throw invalid('Price must not be negative');

  throw error;
}

export async function inTx<T>(
  prisma: PrismaService,
  entity: string,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  try {
    return await prisma.$transaction(fn);
  } catch (error) {
    rethrowPrisma(error, entity);
  }
}

function uniqueTarget(error: Prisma.PrismaClientKnownRequestError): string {
  const target = error.meta?.target;
  if (Array.isArray(target)) return target.join(', ');
  return typeof target === 'string' ? target : 'unique field';
}
