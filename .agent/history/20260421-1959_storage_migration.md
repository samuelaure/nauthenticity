# naŭthenticity Refactoring Plan

## Objectives
Refactor `naŭthenticity` to align with the core naŭ Platform "Workspace -> Brand" Architecture. The UI and backend will transition from tracking loose "IG Accounts" to an organized hierarchy where Brands own "Content" (their own posts), "InspoBase", "Comments Suggester" capabilities (Monitored Profiles & Single Posts), and "Benchmark" profiles.

## Core Architectural Shift
- **Legacy Concept:** User adds a "Tracked Account" (`IgProfile`) which acts independently.
- **New Concept:** User selects a Workspace, selects a Brand, and accesses the Brand's operational modules. The legacy "Tracked Account" concept maps conceptually to the Brand itself (for its own "Content"), while other accounts act as Monitored or Benchmark targets.

## Backend Data Model Changes
1. **BrandIntelligence Entity:**
   - Add `mainIgUsername` to link the Brand directly to its own canonical Instagram profile (populating the "Content" section).
2. **BrandTarget Segregation:**
   - Add `targetType` String (`'main' | 'monitored' | 'benchmark' | 'single_post'`) to `BrandTarget` to distinguish its role, or introduce explicit fields/models.
   - For Benchmark profiles, we need properties for `initialDownloadCount` and `autoUpdate` flags.

## UI Module Architecture
The dashboard UI will be refactored similar to `flownaŭ`:
1. **Workspaces & Brands:**
   - Route: `/workspaces/[workspaceId] / brands`
2. **Brand Dashboard Sections:**
   - **Content:** The posts downloaded from the Brand's main IG profile. Reuses the current post list view.
   - **InspoBase:** Shows captured/downloaded posts in the InspoBase. Allow users to view, modify, and manually trigger Global and Recent syntheses.
   - **Comments Suggester:**
     - *Monitored Profiles:* Profiles set for continuous monitoring for new posts from the time of addition. Triggers comment suggestion generation. Can be active/inactive.
     - *Single Posts:* Manual comment suggestions for specific posts (without monitoring the whole profile). Displays all single-post downloads together, with a secondary view grouped by profile. Reuses Brands/profile listing structure.
   - **Benchmark:** Similar to monitored profiles but focused on content analysis. User specifies initial download count and auto-update toggle.

## Execution Phases
- **PHASE_1**: Backend & DB Schema Refactoring
- **PHASE_2**: Frontend Architecture & Workspace/Brand Navigation Routing
- **PHASE_3**: Brand Content & InspoBase UI Modules
- **PHASE_4**: Comments Suggester UI Modules (Monitored & Single)
- **PHASE_5**: Benchmark UI Module Implementation
- **PHASE_6**: Storage Migration (R2 & Optimization)
    - Update `docker-compose.yml` with R2 credentials.
    - Implement file optimization (ffmpeg/compression) in `download.worker.ts`.
    - Create and execute `src/scripts/migrate-to-r2.ts` to sync, optimize, and purge local storage.
- **PHASE_7**: Two-Stage Cloud-First Media Pipeline (Decoupled Optimization)
    - Architecture refactor to pull raw files directly to R2 `raw/` paths to secure against Apify link expiration.
    - Add `optimization.queue.ts` and `optimization.worker.ts` for isolated, single-concurrency ffmpeg processing.
    - Update lifecycle: `downloading` -> `optimizing` -> `visualizing`.

# PHASE_6: Storage Migration (R2 & Optimization)

## Context
Move media storage from local container filesystem to Cloudflare R2 (nau-storage) to align with platform standards. Includes file optimization (size reduction) and local storage purge.

## Tasks

### 1. Infrastructure Fix
- [ ] Update `docker-compose.yml` to pass R2 environment variables:
    - `R2_ACCESS_KEY_ID`
    - `R2_SECRET_ACCESS_KEY`
    - `R2_ENDPOINT`
    - `R2_BUCKET_NAME`
    - `R2_PUBLIC_URL`

### 2. Implementation: Optimization Logic
- [ ] Update `src/queues/download.worker.ts` to implement file optimization BEFORE uploading to R2:
    - Use `ffmpeg` for video compression (targeting standard resolution/bitrate).
    - Use `ffmpeg` for image optimization (JPEG compression).
    - Ensure temp files are cleaned up.

### 3. Implementation: Migration Script
- [ ] Create `src/scripts/migrate-to-r2.ts`:
    - Recursive scan of `storage/`.
    - For each file:
        1. Identify corresponding DB record (`Media` or `IgProfile`).
        2. Optimize file (ffmpeg).
        3. Upload to R2.
        4. Update DB `storageUrl`.
        5. Delete local file on success.

### 4. Verification
- [ ] Restart service and verify environment is loaded.
- [ ] Run migration script and verify R2 bucket contents.
- [ ] Verify Dashboard still renders media from new URLs.
- [ ] Confirm `./storage` is empty (except for base folders).
# PHASE 7: Two-Stage Cloud-First Media Pipeline

## Context
Currently, downloading large profiles from Apify runs the risk of URL expiry because CPU-heavy video optimization bottlenecks the process (IO starvation). Storing raw high-res files directly on the local server SSD is unsafe due to `Disk Full` risks.

This phase refactors the pipeline into a **Two-Stage Cloud-First** architecture:
1. **Secure Stage (High Speed, IO Bound):** Download raw files from Apify directly to a `raw/` directory in Cloudflare R2.
2. **Optimize Stage (Slow, CPU Bound):** Once all files are secured in R2, transition the run state and pull jobs into a low-concurrency queue to process `ffmpeg` optimizations. Update the final R2 path and DB, then purge the raw.

## Sub-Phases & Implementation Details

### Step 1: Queue Architecture 
- [ ] Create `src/queues/optimization.queue.ts`.
- [ ] Create `src/queues/optimization.worker.ts` configured with `concurrency: 1`.
- [ ] Update `src/app.ts` to register and start the new worker and include its stats in the `/health` endpoint.

### Step 2: Phase 1 Refactor — Secure (Fast Download)
- [ ] Modify `src/queues/download.worker.ts`:
  - **Remove** inline `ffmpeg` optimization for Posts.
  - Stream directly from the Apify fetch Response into a `PutObjectCommand` targeting the `raw/{username}/posts/{id}.{ext}` folder in R2.
  - Set `Media.storageUrl` to the `raw/` public URL.
  - *(Profile pictures can still be optimized on the fly since they are lightweight images and typically occur once per profile)*.

### Step 3: Phase 2 Bridge — The Transition Gate
- [ ] Modify `download.worker.ts` completion check:
  - When `pendingCount === 0` (meaning all files for a `ScrapingRun` are physically in R2 under the `raw/` prefix), transition `ScrapingRun.phase` to `optimizing`.
  - Dispatch a batch of jobs to `optimization-queue` containing all media elements for that `runId` that need optimization.

### Step 4: Phase 3 Refactor — Process (Low-Concurrency Optimization)
- [ ] Implement processing logic in `optimization.worker.ts`:
  - Receive `{ runId, mediaId, username, rawR2Url, finalStorageKey, type, fileExt }`.
  - Stream the file from `rawR2Url` to a temporary local file in `storage/temp`.
  - Execute `optimizeVideo` or `optimizeImage`.
  - Upload the optimized file via `PutObjectCommand` to the final `content/{username}/posts/...` key.
  - Delete temporary local file.
  - Delete the raw file from R2 using `@aws-sdk/client-s3` `DeleteObjectCommand` to prevent bucket bloat.
  - Update `Media.storageUrl` to the final public URL.
- [ ] Implement completion check in `optimization.worker.ts`:
  - Verify if all media for the `runId` have transitioned to the `content/` prefix.
  - If yes, transition `ScrapingRun.phase` from `optimizing` to `visualizing` and trigger the `computeQueue` for AI synthesis logic.

### Step 5: Verification & Safety
- [ ] Test the pipeline on a small 10-post profile run.
- [ ] Ensure `ScrapingRun` passes through: `scraping` -> `downloading` -> `optimizing` -> `visualizing` -> `finished`.
- [ ] Verify R2 `raw/` folder does not accumulate ghost files after optimization.
