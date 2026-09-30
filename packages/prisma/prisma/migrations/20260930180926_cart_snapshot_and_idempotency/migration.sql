-- CartItem gains the price snapshot taken at add time (REQ-18).
-- Written as a backfill rather than a bare NOT NULL column so it also applies
-- to an environment that already has carts: existing rows take the current
-- variant price, which is what those carts were showing anyway.
ALTER TABLE "CartItem"
  ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "unitPrice" DECIMAL(12,2);

UPDATE "CartItem" ci
   SET "unitPrice" = v.price
  FROM "ProductVariant" v
 WHERE v.id = ci."variantId" AND ci."unitPrice" IS NULL;

ALTER TABLE "CartItem" ALTER COLUMN "unitPrice" SET NOT NULL;
-- Prisma sets updatedAt from the client, so the schema carries no default.
ALTER TABLE "CartItem" ALTER COLUMN "updatedAt" DROP DEFAULT;

ALTER TABLE "CartItem"
  ADD CONSTRAINT "CartItem_unitPrice_non_negative" CHECK ("unitPrice" >= 0);

-- CreateTable
CREATE TABLE "IdempotencyKey" (
    "id" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'IN_PROGRESS',
    "response" JSONB,
    "entityId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IdempotencyKey_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IdempotencyKey_createdAt_idx" ON "IdempotencyKey"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "IdempotencyKey_scope_key_key" ON "IdempotencyKey"("scope", "key");

-- AddForeignKey
ALTER TABLE "Cart" ADD CONSTRAINT "Cart_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
