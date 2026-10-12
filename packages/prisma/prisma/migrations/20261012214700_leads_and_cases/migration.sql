-- CreateEnum
CREATE TYPE "LeadConsent" AS ENUM ('UNKNOWN', 'OPTED_IN', 'OPTED_OUT');

-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "contactName" TEXT,
    "accountName" TEXT,
    "city" TEXT,
    "locality" TEXT,
    "zipCode" TEXT,
    "country" TEXT,
    "productInterest" TEXT,
    "consent" "LeadConsent" NOT NULL DEFAULT 'UNKNOWN',
    "customerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadCase" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "caseNumber" TEXT,
    "status" TEXT,
    "comment" TEXT,
    "product" TEXT,
    "priority" TEXT,
    "owner" TEXT,
    "occurredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadImport" (
    "id" TEXT NOT NULL,
    "fileName" TEXT,
    "rowCount" INTEGER NOT NULL,
    "validRows" INTEGER NOT NULL,
    "invalidRows" INTEGER NOT NULL,
    "createdLeads" INTEGER NOT NULL,
    "updatedLeads" INTEGER NOT NULL,
    "linkedCustomers" INTEGER NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadImport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Lead_phone_key" ON "Lead"("phone");

-- CreateIndex
CREATE INDEX "Lead_city_idx" ON "Lead"("city");

-- CreateIndex
CREATE INDEX "Lead_consent_idx" ON "Lead"("consent");

-- CreateIndex
CREATE INDEX "Lead_customerId_idx" ON "Lead"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "LeadCase_caseNumber_key" ON "LeadCase"("caseNumber");

-- CreateIndex
CREATE INDEX "LeadCase_leadId_idx" ON "LeadCase"("leadId");

-- CreateIndex
CREATE INDEX "LeadImport_createdAt_idx" ON "LeadImport"("createdAt");

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadCase" ADD CONSTRAINT "LeadCase_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
