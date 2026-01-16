# Eva - Personal AI Assistant Platform

Eva is a modular, local-first AI assistant designed to ingest, process, and act on your personal data streams (starting with Gmail).

## Core Philosophy
- **Local First**: Data lives in local SQLite (managed via Drizzle ORM).
- **Modular**: Capabilities are separated into Modules (e.g., `Jobs`, `Finance`).
- **Agentic**: Uses LLMs to parse unstructured data into structured records.
- **Interactive**: TUI-based interface (powered by `pi-tui`).

## Architecture

### 1. Data Layer (`src/db`)
- **ORM**: Drizzle ORM
- **Database**: `bun:sqlite`
- **Schema**: Defined in `src/db/schema.ts`

### 2. Service Layer (`src/services`)
- **GmailService**: Wrapper around `gog` CLI for email fetching.
- **LLMService**: Interface to Gemini/Local LLMs.

### 3. Modules (`src/modules`)
Self-contained business logic units.
- **Jobs Module**:
  - Ingests emails from LinkedIn/Indeed.
  - Parses content via Adapters.
  - Stores structured Job Opportunities.

### 4. UI Layer (`src/ui`)
- TUI built with `@mariozechner/pi-tui`.

## Dependencies
- **Runtime**: Bun
- **Libraries**:
  - `drizzle-orm`, `drizzle-kit`
  - `@mariozechner/pi-tui` (Local link)
  - `zod`
- **External Tools**: `gog` CLI (for Gmail)

## Setup
1. `bun install`
2. `bun run db:push` (Sync schema)
3. `bun run dev`
