-- AlterTable
ALTER TABLE "BrandConfig" ADD COLUMN     "inspoRequestCount" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "BrandSynthesis" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "attachedUrls" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BrandSynthesis_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BrandSynthesis_brandId_type_idx" ON "BrandSynthesis"("brandId", "type");

-- AddForeignKey
ALTER TABLE "BrandSynthesis" ADD CONSTRAINT "BrandSynthesis_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "BrandConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;
