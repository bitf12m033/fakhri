/**
 * Event taxonomy (docs/aidlc/04-architecture-api.md §3). One place for the names
 * so producers and handlers cannot drift apart on a string literal.
 */
export const OUTBOX_EVENTS = {
  ORDER_CREATED: 'ORDER_CREATED',
  ORDER_STATUS_CHANGED: 'ORDER_STATUS_CHANGED',
  PAYMENT_SUCCEEDED: 'PAYMENT_SUCCEEDED',
  STOCK_MUTATED: 'STOCK_MUTATED',
  PRODUCT_PUBLISHED: 'PRODUCT_PUBLISHED',
  CONTENT_UPDATED: 'CONTENT_UPDATED',
} as const;

export type OutboxEventType = (typeof OUTBOX_EVENTS)[keyof typeof OUTBOX_EVENTS];
