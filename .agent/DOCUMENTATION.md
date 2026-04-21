# nauthenticity Documentation

## Role
Central intelligence engine and **canonical Brand Registry** for the naŭ Platform. Specializes in Instagram data scraping, AI-driven context enrichment, vector-based semantic search, Brand DNA ownership (full + ultra-light tiers), and brand-aware comment suggestion generation. All services in the naŭ ecosystem reference brands by `Brand.id` (`brandId`).

## Tech Stack
Node.js, Fastify, Prisma, PostgreSQL (`pgvector`), OpenAI, Apify, node-cron, date-fns-tz.

## Core Capabilities
- **Workspace -> Brand Architecture**: Full alignment with `flownaŭ`. Resources are fully scoped under Workspaces, which contain Brands. Brands encompass their own Content (canonically linked via `mainIgUsername`), InspoBase, Comments Suggester suites (Monitored Profiles & Single Posts), and Benchmark tracking limits.
- **Brand Registry (Source of Truth)**: Canonical brand identity for the entire naŭ Platform. All apps create/read/update brands via nauthenticity API. Brands are isolated by `workspaceId` (pointing to 9naŭ Workspace).
- **Brand DNA Ownership**: `Brand.voicePrompt` is the canonical Brand DNA. Served in Full (high-token) and Ultra-Light (low-token) tiers.
- Submitting bulk scraping requests to Apify.
- Mapping extracted data against active configured Brand constraints based on `targetType` (Monitored, Benchmark, Single Post).
- **5-Level Prompt Comment Generation**: Generates brand-voice-consistent, language-aware Instagram comment suggestions using a structured multi-level prompt (Brand DNA → Comment Strategy → Profile Strategy → Recent Comments Context → Post).
- **Smart Fanout Scheduler**: Internal cron (every 15 min) evaluates each brand's delivery window to apply either a 15-min (in-window) or 60-min (out-of-window) scraping threshold per account — minimizing Apify API calls.
- **InspoBase & Synthesis Engine**: Mechanical rolling synthesis of inspiration items into Brand Digests for flownaŭ's ideation engine.
- **Soft Delete & Recovery**: Brands support soft delete (recoverable), review of deleted brands, and explicit permanent deletion.

## Active API Surface

### Brand Registry
- `GET /api/v1/brands?workspaceId=` — List brands for a workspace (excludes soft-deleted by default). Requires JWT or `NAU_SERVICE_KEY`.
- `POST /api/v1/brands` — Create a new brand. Requires JWT or `NAU_SERVICE_KEY`.
- `GET /api/v1/brands/:id` — Get single brand with targets. Requires JWT or `NAU_SERVICE_KEY`.
- `PUT /api/v1/brands/:id` — Update brand fields. Requires JWT or `NAU_SERVICE_KEY`.
- `DELETE /api/v1/brands/:id` — Soft delete brand. Requires JWT or `NAU_SERVICE_KEY`.
- `POST /api/v1/brands/:id/restore` — Restore soft-deleted brand. Requires JWT or `NAU_SERVICE_KEY`. *(Phase 13)*
- `DELETE /api/v1/brands/:id/permanent` — Hard delete with cascade. Requires JWT or `NAU_SERVICE_KEY`. *(Phase 13)*
- `GET /api/v1/brands/deleted?workspaceId=` — List soft-deleted brands for recovery. Requires JWT or `NAU_SERVICE_KEY`. *(Phase 13)*
- `GET /api/v1/brands/:id/persona` — Returns Brand DNA (voicePrompt) for ecosystem consumption. Requires JWT or `NAU_SERVICE_KEY`.
- `GET /api/v1/brands/:id/dna` — Returns full Brand DNA document. Requires `NAU_SERVICE_KEY`. *(Phase 13)*
- `GET /api/v1/brands/:id/dna-light` — Returns ultra-light Brand DNA for low-token tasks. Requires `NAU_SERVICE_KEY`. *(Phase 13)*

### Comment Suggestion & InspoBase
- `POST /api/v1/generate-comment` — Reactive comment generation. Requires `NAU_SERVICE_KEY`.
- `POST /api/v1/comment-feedback` — Log user's selected suggestion. Requires `NAU_SERVICE_KEY`.
- `POST /api/v1/trigger-fanout` — Manual fanout trigger (debug/emergency). Requires `NAU_SERVICE_KEY`.
- `POST /api/v1/inspo` — Create InspoItem for a brand. Requires `NAU_SERVICE_KEY`.
- `GET /api/v1/inspo?brandId=` — List InspoItems. Requires `NAU_SERVICE_KEY`.
- `GET /api/v1/inspo/digest?brandId=` — Get mechanical InspoBase Synthesis digest. Requires `NAU_SERVICE_KEY`.

### Targets (Monitored, Benchmark, Single Posts)
- `POST /api/v1/targets` — Upsert profiles with specific `targetType` ('monitored', 'benchmark', 'single_post'). Requires `NAU_SERVICE_KEY`.
- `PUT /api/v1/targets/:brandId/:username` — Update properties like `profileStrategy`, `isActive`, `initialDownloadCount`, `autoUpdate`. Requires `NAU_SERVICE_KEY`.
- `DELETE /api/v1/targets?brandId=&username=` — Remove a target. Requires `NAU_SERVICE_KEY`.

## Environment Variables
- `DATABASE_URL` — PostgreSQL connection string
- `REDIS_URL` — Redis connection string (BullMQ)
- `OPENAI_API_KEY` — OpenAI API key
- `APIFY_API_KEY` — Apify API key
- `NAU_SERVICE_KEY` — Inter-service authentication key
- `ZAZU_HOST` — Internal URL for Zazŭ service (default: `http://zazu:3000`)

## Key Decisions
- **[2026-04-18] Entity Naming Convention V1**: `BrandConfig` renamed to `Brand`, `Account` renamed to `IgProfile`. Cross-service references use `brandId`.
- **[2026-04-18] SSO via 9naŭ**: User-facing APIs authenticate using JWTs issued by 9naŭ.
- **[2026-04-18] Brand Registry SoT**: nauthenticity is the canonical source of truth for brand identity across the naŭ Platform.
- **[2026-04-18] Isolated by Workspace**: Brands belong to a `workspaceId` (which resolves to 9naŭ's Workspace). Removes `userId` from Brand.
- **[2026-04-18] Brand DNA Tiers**: Full DNA for ideation/composition + ultra-light for triage/comment suggestion (low-token).
- **[2026-04-18] Soft Delete**: Brand deletion is soft by default. Hard delete is explicit. Recovery, review, and permanent deletion supported.
- **[2026-04-18] Any-App Brand Creation**: All naŭ apps can create brands via `POST /api/v1/brands`. Each app injects its own linked data.
- **[2026-04-07] Deduplicated Proactive Scraping:** Apify orchestrates global targets. JSON payload is locally mapped and fanned out to generation jobs per interested brand.
- **[2026-04-10] 5-Level Prompt Architecture:** Comment generation uses a stratified system prompt: Level 0 (base + language), Level 1 (brand voice), Level 2 (comment strategy), Level 3 (profile strategy), Level 4 (last 9 selected comments for context).
- **[2026-04-10] Smart Scheduler (15m/60m):** Internal node-cron replaces external webhook trigger. Per-brand window awareness avoids redundant Apify calls.
- **[2026-04-10] `tonePrompt` → `voicePrompt`:** Field renamed to reflect the Brand DNA canonical role.
- **[2026-04-10] `isEdited` → `isSelected`:** CommentFeedback model simplified — user selects one of N suggestions via Telegram button; no text editing in the loop.
- **[2026-04-10] Brand DNA Source of Truth:** `nauthenticity` is the canonical owner of Brand Persona/DNA.
- **[2026-04-10] 4 posts per account per cycle:** Conservative limit while Apify actor is still maturing. Dedup by `instagramId` prevents reprocessing.

## naŭ Platform Dependencies
- `zazu` — Receives dispatched comment suggestions via `POST /api/internal/notify`. Brand CRUD from Zazŭ dashboard.
- `flownau` — Consumes Brand DNA via `/api/v1/brands/:id/dna`, InspoBase digest via `/api/v1/inspo/digest`. References brands by `brandId`.
- `9nau-api` *(Phase 14)* — Consumes ultra-light Brand DNA via `/api/v1/brands/:id/dna-light` for AI triage brand routing. 9naŭ is the SSO IdP providing JWTs.
