import { OrderStatus } from '@fakhri/prisma';
import { AppError } from '@fakhri/shared';

/**
 * Order state machine (REQ-24, docs/aidlc/02-requirements.md §2). RETURNED is
 * recorded in the enum but not reachable yet, so it has no outgoing transitions
 * and nothing transitions into it.
 */
export const ORDER_TRANSITIONS: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = {
  [OrderStatus.PENDING]: [OrderStatus.CONFIRMED, OrderStatus.CANCELLED],
  [OrderStatus.CONFIRMED]: [OrderStatus.PACKED, OrderStatus.CANCELLED],
  [OrderStatus.PACKED]: [OrderStatus.SHIPPED, OrderStatus.CANCELLED],
  [OrderStatus.SHIPPED]: [OrderStatus.DELIVERED, OrderStatus.CANCELLED],
  [OrderStatus.DELIVERED]: [],
  [OrderStatus.CANCELLED]: [],
  [OrderStatus.RETURNED]: [],
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_TRANSITIONS[from].includes(to);
}

export function assertTransition(from: OrderStatus, to: OrderStatus): void {
  if (from === to) {
    throw new AppError('ORDER_STATUS_INVALID', `Order is already ${from}`, { from, to });
  }
  if (!canTransition(from, to)) {
    throw new AppError('ORDER_STATUS_INVALID', `An order cannot go from ${from} to ${to}`, {
      from,
      to,
      allowed: ORDER_TRANSITIONS[from],
    });
  }
}

/** Customers may cancel only before the order is confirmed. */
export function canCustomerCancel(status: OrderStatus): boolean {
  return status === OrderStatus.PENDING;
}

/** Stock leaves the warehouse when the order ships; before that it is only reserved. */
export function consumesStock(to: OrderStatus): boolean {
  return to === OrderStatus.SHIPPED || to === OrderStatus.DELIVERED;
}

export function releasesStock(to: OrderStatus): boolean {
  return to === OrderStatus.CANCELLED;
}
