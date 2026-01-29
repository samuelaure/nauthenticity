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
    "runId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Post_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "username" TEXT NOT NULL,
    "profileImageUrl" TEXT,
    "lastScrapedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("username")
);

-- CreateTable
CREATE TABLE "ScrapingRun" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "actorRunId" TEXT,
    "datasetId" TEXT,
    "rawData" JSONB,
    "status" TEXT NOT NULL DEFAULT 'completed',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScrapingRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Media" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "storageUrl" TEXT NOT NULL,
    "duration" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transcript" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "originalText" TEXT,
    "json" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Transcript_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Post_instagramId_key" ON "Post"("instagramId");

-- CreateIndex
CREATE UNIQUE INDEX "Post_instagramUrl_key" ON "Post"("instagramUrl");

-- CreateIndex
CREATE INDEX "Post_username_idx" ON "Post"("username");

-- CreateIndex
CREATE UNIQUE INDEX "ScrapingRun_actorRunId_key" ON "ScrapingRun"("actorRunId");

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_username_fkey" FOREIGN KEY ("username") REFERENCES "Account"("username") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ScrapingRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Media" ADD CONSTRAINT "Media_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transcript" ADD CONSTRAINT "Transcript_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
