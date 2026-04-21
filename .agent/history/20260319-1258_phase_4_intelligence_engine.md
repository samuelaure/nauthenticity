# nauthenticity Master Plan

**Intelligence Engine for Instagram Content Strategy Transformation.**

## 1. System Vision
nauthenticity turns raw Instagram data into a "Vectorized Brain" that allows creators to analyze their performance pillars and generate high-fidelity content in their own voice.

## 2. Core Architecture
- **Backend**: Fastify (TypeScript) + BullMQ (Redis) + Prisma (Postgres)
- **Pipeline**: Apify (Universal Scraper) → Download → Visual Feedback → Optimize → Transcribe → Embed
- **Frontend**: Vite/React Dashboard
- **AI Stack**: Local Whisper + OpenAI (Embeddings/Extraction) + PGVector

## 3. Revised Roadmap

### Phase 1: Foundation (COMPLETED)
- Basic monorepo structure.
- Ingestion pipeline (Raw Fetch → Download).
- Dashboard v1 (Accounts/Posts view).

### Phase 2: Reliability & UX Acceleration (COMPLETED)
- Decoupled media pipeline.
- Local fallback for AI services.
- Universal Scraper integration.

### Phase 3: Audit Remediation & Hardening (COMPLETED)
- Resolved all critical audit findings.
- Pino logger refactor.
- Strict typing for Apify boundaries.
- Graceful shutdown for BullMQ.
- De-Sentinel environment isolation.

### Phase 4: Intelligence Engine (COMPLETED)
- Vector database integration (PGVector).
- Embedding pipeline for transcripts (OpenAI text-embedding-3-small).
- Strategic extraction (Hooks, Pillars, CTA).
- Semantic Search API via vector similarity.

### Phase 5: Persona Mirroring & Content Gen (CURRENT)
- Style transfer / Persona extraction.
- Script generation logic based on high-performing pillars.
- Release & Production hardening.

## 4. Technical Constraints
- **Windows PowerShell**: Adhere to PSCmdlet syntax.
- **Strict Isolation**: No connection to production DBs/Redis in dev.
- **Linear History**: Rebase & fast-forward integration.
- **Zero-Failure Pipeline**: Every job must be resumable and isolatable.
- **No .agent leakage**: Never commit transient agent files.
# Phase 4: Intelligence Engine

**Trigger**: Successful completion of Phase 3 Audit Remediation (v1.0.1).
**Core Objective**: Transform transcribed text and captions into a searchable, structured "Vectorized Brain" using embeddings.

## 1. Objectives
- Implement vector storage for high-speed similarity search.
- Generate embeddings for all historic and new content automatically.
- Extract structured strategies (Hooks, Pillars, CTA) using LLMs.
- Build a query interface to find relevant content by "vibe" or "topic".

## 2. Tasks

### A. Vector Infrastructure
- [ ] **[A1] Select & Configure Vector DB**:
    - Evaluate `pgvector` (local) vs `Pinecone` (managed).
    - Recommendation: `pgvector` for local-first De-Sentinel alignment.
- [ ] **[A2] Schema Extension**:
    - Update `schema.prisma` to include an `embeddings` table or `vector` column.
    - Run migrations and generate types.

### B. Embedding Pipeline
- [ ] **[B1] Embedding Worker**:
    - Add a new `embed-batch` step to the compute pipeline in `compute.worker.ts`.
    - Integrates with OpenAI `text-embedding-3-small`.
- [ ] **[B2] Backfill Logic**:
    - Implement a script to embed all existing transcripts/captions.

### C. Intelligence Extraction
- [ ] **[C1] Strategy Analysis Prompting**:
    - Define and optimize prompts for hook/pillar extraction.
- [ ] **[C2] Structured Storage**:
    - Store extracted intelligence in a searchable format (JSONB in Postgres).

### D. Semantic Search API
- [ ] **[D1] Vector Query Interface**:
    - Add `POST /api/search` to perform similarity searches.
- [ ] **[D2] Filtering Integration**:
    - Allow combining vector search with metadata filters (date range, media type).

## 3. Verification Criteria
- Semantic search returns relevant results for natural language queries.
- 100% of video transcripts have associated vectors.
- Strategy extraction correctly identifies at least 3 content pillars per account.
