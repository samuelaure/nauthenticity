-- Migration: comment_suggester_v2
-- Generated: 2026-04-10
-- Description: Expands BrandConfig with multi-level prompt fields and delivery window;
--              adds profileStrategy to BrandTarget;
--              replaces isEdited with isSelected in CommentFeedback.

-- CreateTable
CREATE TABLE "BrandConfig" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "brandName" TEXT NOT NULL,
    "voicePrompt" TEXT NOT NULL,
    "commentStrategy" TEXT,
    "suggestionsCount" INTEGER NOT NULL DEFAULT 3,
    "windowStart" TEXT,
    "windowEnd" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BrandConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BrandTarget" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "profileStrategy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BrandTarget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommentFeedback" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "commentText" TEXT NOT NULL,
    "isSelected" BOOLEAN NOT NULL DEFAULT false,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommentFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BrandTarget_brandId_username_key" ON "BrandTarget"("brandId", "username");

-- AddForeignKey
ALTER TABLE "BrandTarget" ADD CONSTRAINT "BrandTarget_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "BrandConfig"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrandTarget" ADD CONSTRAINT "BrandTarget_username_fkey" FOREIGN KEY ("username") REFERENCES "Account"("username") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommentFeedback" ADD CONSTRAINT "CommentFeedback_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "BrandConfig"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommentFeedback" ADD CONSTRAINT "CommentFeedback_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
