import { ShipmentStatus } from '@fakhri/prisma';
import { AppError } from '@fakhri/shared';

/**
 * Shipment tracking states. Entered manually by staff at MVP (REQ-31: "manual
 * shipment/tracking entry"), so the matrix allows a failed delivery to be retried.
 */
export const SHIPMENT_TRANSITIONS: Readonly<Record<ShipmentStatus, readonly ShipmentStatus[]>> = {
  [ShipmentStatus.PENDING]: [ShipmentStatus.PICKUP_SCHEDULED, ShipmentStatus.IN_TRANSIT, ShipmentStatus.FAILED],
  [ShipmentStatus.PICKUP_SCHEDULED]: [ShipmentStatus.IN_TRANSIT, ShipmentStatus.FAILED],
  [ShipmentStatus.IN_TRANSIT]: [ShipmentStatus.DELIVERED, ShipmentStatus.FAILED, ShipmentStatus.RETURNED],
  [ShipmentStatus.FAILED]: [ShipmentStatus.IN_TRANSIT, ShipmentStatus.RETURNED],
  [ShipmentStatus.DELIVERED]: [ShipmentStatus.RETURNED],
  [ShipmentStatus.RETURNED]: [],
};

export function assertShipmentTransition(from: ShipmentStatus, to: ShipmentStatus): void {
  if (from === to) throw new AppError('CONFLICT', `Shipment is already ${from}`, { from, to });
  if (!SHIPMENT_TRANSITIONS[from].includes(to)) {
    throw new AppError('CONFLICT', `A shipment cannot go from ${from} to ${to}`, {
      from,
      to,
      allowed: SHIPMENT_TRANSITIONS[from],
    });
  }
}

/** Handing the parcel over means the order has shipped. */
export function shipsOrder(to: ShipmentStatus): boolean {
  return to === ShipmentStatus.IN_TRANSIT;
}

export function deliversOrder(to: ShipmentStatus): boolean {
  return to === ShipmentStatus.DELIVERED;
}
