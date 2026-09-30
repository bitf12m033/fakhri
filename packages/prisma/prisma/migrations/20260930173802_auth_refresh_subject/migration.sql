-- AlterTable
ALTER TABLE "RefreshToken" ADD COLUMN     "customerId" TEXT,
ALTER COLUMN "userId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");

-- CreateIndex
CREATE INDEX "RefreshToken_customerId_idx" ON "RefreshToken"("customerId");

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- A refresh token belongs to exactly one subject: an admin user or a customer
-- (increment 3.4). Prisma does not express CHECK constraints.
ALTER TABLE "RefreshToken"
  ADD CONSTRAINT "RT_subject_admin_xor_customer" CHECK (
    (("userId" IS NOT NULL)::int + ("customerId" IS NOT NULL)::int) = 1
  );
