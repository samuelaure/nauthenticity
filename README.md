# naŭthenticity — AI Content Intelligence

**naŭthenticity** is an AI-powered content intelligence engine that turns Instagram profiles into structured, searchable knowledge.

## Quick Start

1.  **Install Dependencies**

    ```bash
    npm install
    cd dashboard && npm install && cd ..
    ```

2.  **Environment Setup**

    Create a `.env` file in the root directory:

    ```env
    NODE_ENV=development
    PORT=3000
    DATABASE_URL="postgresql://nauthenticity:nauthenticity@localhost:5432/nauthenticity"
    REDIS_HOST=localhost
    REDIS_PORT=6379
    APIFY_TOKEN="your_apify_token"
    OPENAI_API_KEY="your_openai_key"
    ```

3.  **Start Infrastructure**

    ```bash
    docker-compose up -d
    ```

4.  **Database & Infrastructure Setup**

    The project uses a **standalone** Docker environment. PostgreSQL and Redis start locally by default.

    ```bash
    docker-compose up -d
    npm run prisma:generate
    npm run prisma:migrate
    ```

5.  **Run Application**
    - **Backend API**: `npm run dev` (Runs on http://localhost:3000)
    - **Dashboard**: `cd dashboard && npm run dev` (Runs on http://localhost:5173 / http://localhost:5174)

    Open the dashboard to track accounts and view ingested content.

## 🚀 Development Workflow

### Standalone Environment

We follow a **standalone-first** approach. Every project runs its own isolated infrastructure.

- **Local Routing**: Reachable via `http://nauthenticity.localhost` (requires Traefik).
- **Production**: Reachable via `https://nauthenticity.9nau.com`.

### Quality & Verification

Before committing, always run the standardized verification suite:

```bash
npm run verify
```

This command executes:

1. **Format**: `prettier` check and fix.
2. **Lint**: `eslint` for code quality.
3. **Type Check**: `tsc` for strong typing.
4. **Test**: `jest` for functional verification.

### Running the Application

- **Development Mode:**

  ```bash
  npm run dev
  ```

- **Production Build:**

  ```bash
  npm run build
  npm start
  ```

### Quality & Testing

- **Standardized Verification:**

  Run all checks in one command:

  ```bash
  npm run verify
  ```

- **Type Check:**

  ```bash
  npm run type-check
  ```

- **Lint:**

  ```bash
  npm run lint
  ```

- **Format:**

  ```bash
  npm run format
  ```

- **Test:**

  ```bash
  npm test
  npm run test:watch
  ```

## 🏗 System Architecture

### 1. System Purpose

Build a scalable system that:

- Extracts all content from an Instagram account.
- Processes media into structured text data.
- Analyzes content strategy and performance patterns.
- Stores everything in a searchable knowledge base.
- Enables AI to generate new content based on extracted intelligence.

### 2. Tech Stack

- **Backend**: Node.js (TypeScript), Fastify.
- **Queue System**: BullMQ with Redis.
- **Scraping**: Apify Instagram Scraper Actor.
- **Media Processing**: FFmpeg (audio), Whisper (transcription), Tesseract (OCR).
- **AI**: OpenAI / LLM, Embeddings (text-embedding-3-large).
- **Storage**: Cloudflare R2 (Object Storage), PostgreSQL (Metadata), Vector DB (pgvector).
- **Infrastructure**: Docker.

### 3. System Phases

#### Phase 1 — Content Ingestion

- **Goal**: Collect post data and media.
- **Process**: Trigger Apify -> Receive Metadata -> Queue Media Download.

#### Phase 2 — Media Processing

- **Goal**: Convert media into text.
- **Video**: Download -> Extract Audio (FFmpeg) -> Transcribe (Whisper).
- **Image**: Download -> OCR.

#### Phase 3 — AI Content Enrichment

- **Goal**: Transform raw text into strategic intelligence.
- **Analysis**: Identify Content Pillar, Hook Type, Tone, Audience Level using LLM.

#### Phase 4 — Engagement Intelligence

- **Goal**: Identify performance patterns.
- **Metrics**: Engagement scoring, Top Pillars, Best Hook analysis.

#### Phase 5 — Knowledge Base Creation

- **Goal**: Make content AI-searchable.
- **Process**: Chunk text -> Generate Embeddings -> Store in Vector DB.

#### Phase 6 — AI Generation Layer

- **Goal**: Create new content.
- **Capabilities**: Style replication, Script generation, Repurposing.

## 🗄 Database Schema Overview

- **Posts**: `id`, `url`, `engagement`, `metadata`.
- **Media**: `storage_url`, `type`, `duration`.
- **Transcripts**: `text`, `timestamps`.
- **Enrichment**: `pillar`, `hook`, `tone`, `topics`.
- **Analytics**: `metrics`, `scores`.

## 🔮 Future Improvements & Roadmap

- **Bulk Ingestion API**: Endpoint to ingest multiple profiles in a single request (`POST /ingest/bulk`).
- **Parallel Processing Scaling**: Optimize BullMQ concurrency based on hardware limits.
- **Image OCR**: Implement Phase 2 image processing with Tesseract.
- **Advanced Sentiment Analysis**: Detect emotional resonance in comments.
- **Auto-Repurposing**: Generate Reels scripts from existing long-form captions.
- **Vector Search UI**: A dashboard to query the "creator brain".
