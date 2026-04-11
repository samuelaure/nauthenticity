-- CreateTable
CREATE TABLE "InspoItem" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "postId" TEXT,
    "type" TEXT NOT NULL,
    "note" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "extractedHook" TEXT,
    "extractedTheme" TEXT,
    "adaptedScript" TEXT,
    "injectedContext" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InspoItem_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "InspoItem" ADD CONSTRAINT "InspoItem_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "BrandConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InspoItem" ADD CONSTRAINT "InspoItem_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE SET NULL ON UPDATE CASCADE;
