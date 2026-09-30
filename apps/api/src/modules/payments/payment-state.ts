import { PaymentMethod, PaymentStatus } from '@fakhri/prisma';
import { AppError } from '@fakhri/shared';

/**
 * Payment state machine (REQ-24, docs/aidlc/02-requirements.md §2).
 * Online: PENDING -> SUCCEEDED | FAILED. COD: PENDING_COLLECTION -> COLLECTED | FAILED.
 * REFUNDED is reachable only from a settled payment, and refunds themselves are
 * out of MVP scope, so nothing transitions into it yet.
 */
export const PAYMENT_TRANSITIONS: Readonly<Record<PaymentStatus, readonly PaymentStatus[]>> = {
  [PaymentStatus.PENDING]: [PaymentStatus.SUCCEEDED, PaymentStatus.FAILED],
  [PaymentStatus.PENDING_COLLECTION]: [PaymentStatus.COLLECTED, PaymentStatus.FAILED],
  [PaymentStatus.SUCCEEDED]: [PaymentStatus.REFUNDED],
  [PaymentStatus.COLLECTED]: [PaymentStatus.REFUNDED],
  [PaymentStatus.FAILED]: [],
  [PaymentStatus.REFUNDED]: [],
};

export function canTransitionPayment(from: PaymentStatus, to: PaymentStatus): boolean {
  return PAYMENT_TRANSITIONS[from].includes(to);
}

export function assertPaymentTransition(from: PaymentStatus, to: PaymentStatus): void {
  if (from === to) throw new AppError('CONFLICT', `Payment is already ${from}`, { from, to });
  if (!canTransitionPayment(from, to)) {
    throw new AppError('CONFLICT', `A payment cannot go from ${from} to ${to}`, {
      from,
      to,
      allowed: PAYMENT_TRANSITIONS[from],
    });
  }
}

export function isSettled(status: PaymentStatus): boolean {
  return status === PaymentStatus.SUCCEEDED || status === PaymentStatus.COLLECTED;
}

export function isOpen(status: PaymentStatus): boolean {
  return status === PaymentStatus.PENDING || status === PaymentStatus.PENDING_COLLECTION;
}

/** COD settles on delivery; everything else settles through a gateway. */
export function settledStatusFor(method: PaymentMethod): PaymentStatus {
  return method === PaymentMethod.COD ? PaymentStatus.COLLECTED : PaymentStatus.SUCCEEDED;
}

export const ONLINE_METHODS: readonly PaymentMethod[] = [
  PaymentMethod.CARD,
  PaymentMethod.JAZZCASH,
  PaymentMethod.EASYPAISA,
];
