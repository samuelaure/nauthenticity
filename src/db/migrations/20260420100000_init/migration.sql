CREATE EXTENSION IF NOT EXISTS vector;

-- CreateTable
CREATE TABLE "Post" (
    "id" TEXT NOT NULL,
    "instagramId" TEXT,
    "instagramUrl" TEXT NOT NULL,
    "username" TEXT,
    "caption" TEXT,
    "originalCaption" TEXT,
    "postedAt" TIMESTAMP(3) NOT NULL,
    "likes" INTEGER NOT NULL DEFAULT 0,
    "comments" INTEGER NOT NULL DEFAULT 0,
    "views" INTEGER,
    "engagementScore" DOUBLE PRECISION,
    "collaborators" JSONB,
    "intelligence" JSONB,
    "runId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Post_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IgProfile" (
    "username" TEXT NOT NULL,
    "profileImageUrl" TEXT,
    "lastScrapedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IgProfile_pkey" PRIMARY KEY ("username")
);

-- CreateTable
CREATE TABLE "ScrapingRun" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "actorRunId" TEXT,
    "datasetId" TEXT,
    "rawData" JSONB,
    "status" TEXT NOT NULL DEFAULT 'completed',
    "phase" TEXT NOT NULL DEFAULT 'finished',
    "isPaused" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScrapingRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Media" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "url" TEXT,
    "storageUrl" TEXT NOT NULL,
    "thumbnailUrl" TEXT,
    "duration" DOUBLE PRECISION,
    "index" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transcript" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "mediaId" TEXT,
    "text" TEXT NOT NULL,
    "originalText" TEXT,
    "json" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Transcript_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Embedding" (
    "id" TEXT NOT NULL,
    "transcriptId" TEXT NOT NULL,
    "vector" vector(1536) NOT NULL,
    "model" TEXT NOT NULL DEFAULT 'text-embedding-3-small',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Embedding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BrandIntelligence" (
    "brandId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL DEFAULT '',
    "voicePrompt" TEXT NOT NULL,
    "commentStrategy" TEXT,
    "suggestionsCount" INTEGER NOT NULL DEFAULT 3,
    "windowStart" TEXT,
    "windowEnd" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "inspoRequestCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BrandIntelligence_pkey" PRIMARY KEY ("brandId")
);

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

-- CreateIndex
CREATE UNIQUE INDEX "Post_instagramId_key" ON "Post"("instagramId");

-- CreateIndex
CREATE UNIQUE INDEX "Post_instagramUrl_key" ON "Post"("instagramUrl");

-- CreateIndex
CREATE INDEX "Post_username_idx" ON "Post"("username");

-- CreateIndex
CREATE UNIQUE INDEX "ScrapingRun_actorRunId_key" ON "ScrapingRun"("actorRunId");

-- CreateIndex
CREATE UNIQUE INDEX "Transcript_mediaId_key" ON "Transcript"("mediaId");

-- CreateIndex
CREATE UNIQUE INDEX "Embedding_transcriptId_key" ON "Embedding"("transcriptId");

-- CreateIndex
CREATE INDEX "BrandSynthesis_brandId_type_idx" ON "BrandSynthesis"("brandId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "BrandTarget_brandId_username_key" ON "BrandTarget"("brandId", "username");

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_username_fkey" FOREIGN KEY ("username") REFERENCES "IgProfile"("username") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ScrapingRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Media" ADD CONSTRAINT "Media_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transcript" ADD CONSTRAINT "Transcript_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transcript" ADD CONSTRAINT "Transcript_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "Media"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Embedding" ADD CONSTRAINT "Embedding_transcriptId_fkey" FOREIGN KEY ("transcriptId") REFERENCES "Transcript"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrandSynthesis" ADD CONSTRAINT "BrandSynthesis_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "BrandIntelligence"("brandId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrandTarget" ADD CONSTRAINT "BrandTarget_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "BrandIntelligence"("brandId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrandTarget" ADD CONSTRAINT "BrandTarget_username_fkey" FOREIGN KEY ("username") REFERENCES "IgProfile"("username") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommentFeedback" ADD CONSTRAINT "CommentFeedback_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "BrandIntelligence"("brandId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommentFeedback" ADD CONSTRAINT "CommentFeedback_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InspoItem" ADD CONSTRAINT "InspoItem_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "BrandIntelligence"("brandId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InspoItem" ADD CONSTRAINT "InspoItem_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE SET NULL ON UPDATE CASCADE;


