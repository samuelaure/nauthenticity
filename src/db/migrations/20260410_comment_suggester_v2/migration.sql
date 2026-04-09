-- Migration: comment_suggester_v2
-- Generated: 2026-04-10
-- Description: Expands BrandConfig with multi-level prompt fields and delivery window;
--              adds profileStrategy to BrandTarget;
--              replaces isEdited with isSelected in CommentFeedback.

-- 1. BrandConfig: rename tonePrompt → voicePrompt and add new columns
ALTER TABLE "BrandConfig" RENAME COLUMN "tonePrompt" TO "voicePrompt";

ALTER TABLE "BrandConfig"
  ADD COLUMN IF NOT EXISTS "commentStrategy"  TEXT,
  ADD COLUMN IF NOT EXISTS "suggestionsCount" INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS "windowStart"      TEXT,
  ADD COLUMN IF NOT EXISTS "windowEnd"        TEXT,
  ADD COLUMN IF NOT EXISTS "timezone"         TEXT NOT NULL DEFAULT 'UTC';

-- 2. BrandTarget: add profileStrategy
ALTER TABLE "BrandTarget"
  ADD COLUMN IF NOT EXISTS "profileStrategy" TEXT;

-- 3. CommentFeedback: replace isEdited with isSelected
ALTER TABLE "CommentFeedback" DROP COLUMN IF EXISTS "isEdited";
ALTER TABLE "CommentFeedback"
  ADD COLUMN IF NOT EXISTS "isSelected" BOOLEAN NOT NULL DEFAULT false;
