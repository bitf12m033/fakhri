-- AlterTable
ALTER TABLE "CampaignTemplate" ADD COLUMN "providerTemplateName" TEXT,
ADD COLUMN "language" TEXT NOT NULL DEFAULT 'en';
