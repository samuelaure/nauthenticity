-- Migration: add_target_type_and_main_ig_username
-- Adds mainIgUsername to BrandIntelligence and targetType/isActive/initialDownloadCount/autoUpdate to BrandTarget

-- BrandIntelligence: add mainIgUsername (nullable)
ALTER TABLE "BrandIntelligence" ADD COLUMN "mainIgUsername" TEXT;

-- BrandTarget: add targetType with default 'monitored'
ALTER TABLE "BrandTarget" ADD COLUMN "targetType" TEXT NOT NULL DEFAULT 'monitored';

-- BrandTarget: add isActive with default true
ALTER TABLE "BrandTarget" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;

-- BrandTarget: add initialDownloadCount with default 20 (nullable for non-benchmark targets)
ALTER TABLE "BrandTarget" ADD COLUMN "initialDownloadCount" INTEGER DEFAULT 20;

-- BrandTarget: add autoUpdate with default false (nullable)
ALTER TABLE "BrandTarget" ADD COLUMN "autoUpdate" BOOLEAN DEFAULT false;

-- Add composite index for efficient per-type queries
CREATE INDEX "BrandTarget_brandId_targetType_idx" ON "BrandTarget"("brandId", "targetType");
