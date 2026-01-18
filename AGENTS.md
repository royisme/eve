# AGENTS.md

This document helps AI agents work effectively in the Eve codebase.

## Project Overview

**Eve** is a modular, local-first personal AI assistant built with Bun and TypeScript. It currently specializes in **Job Hunting Intelligence** by scanning Gmail for job applications, parsing them with AI, and presenting them in a TUI dashboard.

- **Runtime**: Bun (v1.0+) - used for package management, testing, building, and runtime
- **Database**: SQLite via Drizzle ORM (`eve.db`)
- **Primary Language**: TypeScript (strict mode)
- **External Dependencies**: Gmail via `gog` CLI, Firecrawl for web scraping, `@mariozechner/pi-agent` for LLM orchestration
- **TUI Framework**: `@mariozechner/pi-tui`
- **Agent Framework**: `@mariozechner/pi-agent-core` for multi-agent LLM management

## Essential Commands

### Development
```bash
# Install dependencies
bun install

# Type check and lint (pre-commit hook)
bun run check
# Or separately:
oxlint .
tsc --noEmit

# Run unit tests
bun test

# Run specific test
bun test tests/core/config.test.ts
```

### Application Commands
```bash
# Run main entry point
bun run src/index.ts

# Sync/ingest data from Gmail (searches for job-related emails)
bun run src/index.ts ingest
# or
bun run src/index.ts sync

# Generate daily briefing from all modules
bun run src/index.ts morning

# Check system status
bun run src/index.ts status

# Configuration management
bun run src/index.ts config:set <key> <value>
bun run src/index.ts config:get <key>

# Clear database (debug)
bun run src/index.ts clean
```

### Build
```bash
# Build binary to release/eve
bun run build

# After building, run the binary directly
./release/eve ingest
./release/eve jobs:status
```

### Database Migrations (Drizzle)
```bash
# Generate migrations (when schema changes)
bunx drizzle-kit generate

# Apply migrations
bunx drizzle-kit migrate

# Push schema to DB (for development)
bunx drizzle-kit push
```

### Module-Specific Commands (Jobs Module)
```bash
# Show job hunting status
bun run src/index.ts jobs:status

# Enrich jobs with Firecrawl (scrape job descriptions)
bun run src/index.ts jobs:enrich

# Analyze jobs with LLM (get AI fit reports)
bun run src/index.ts jobs:analyze

# List all jobs
bun run src/index.ts jobs:list

# Import resume for analysis (MD or PDF)
bun run src/index.ts jobs:resume <path>
```

## Code Organization

```
src/
├── index.ts              # Main entry point, CLI setup, module registration
├── core/
│   ├── config.ts         # ConfigManager for DB-backed configuration
│   ├── db.ts             # Database export
│   ├── db/               # Database schema (migrated to src/db/)
│   │   └── schema.ts     #    - jobs, sysConfig tables
│   ├── dispatcher.ts     # Routes emails to appropriate modules
│   └── gmail.ts          # GmailSource - fetches emails via gog CLI
├── db/
│   ├── index.ts          # Database instance (bun:sqlite + drizzle)
│   └── schema.ts         # Table definitions (jobs, sysConfig)
├── modules/
│   └── jobs/
│       ├── index.ts      # JobModule - handles job ingestion, enrichment, analysis
│       └── extractors/   # Email parsing adapters (LinkedIn, Indeed, AI fallback)
├── services/
│   ├── llm.ts            # LLMService - Anthropic/compatible API wrapper
│   └── firecrawl.ts      # FirecrawlService - web scraping wrapper
├── ui/
│   └── app.tsx           # TUI dashboard (React + pi-tui)
└── types/
    └── module.ts         # EveModule interface definition
```

### Key Patterns

**Module System**:
- All modules implement `EveModule` interface from `src/types/module.ts`
- Modules must have: `name`, `registerCommands(cli)`, optional `getDailyBriefing()`, `onIngest()`
- Modules are registered in `src/index.ts` and added to the `modules` array
- The `Dispatcher` in `src/core/dispatcher.ts` routes emails to modules based on heuristics

**Configuration**:
- Stored in SQLite (`sysConfig` table) via `ConfigManager`
- Supports both string and JSON values
- Grouped by namespace (e.g., `services.google`, `jobs`, `core`)
- Required config for Gmail: `services.google.accounts` (array of email strings)
- Required config for LLM: `services.llm.api_key`, `services.llm.base_url`, `services.llm.model`
- Required config for Firecrawl: `services.firecrawl.api_key`

**Database Access**:
- Use `db` export from `src/db/index.ts`
- Import schema tables from `src/db/schema.ts`
- Use Drizzle ORM query builders (`select`, `insert`, `update`, `where`, etc.)
- Common queries use `.get()` for single result, `.all()` for multiple

**External CLI Dependencies**:
- `gog` - Gmail CLI tool for fetching emails (must be installed separately)
- `pdftotext` - For PDF resume extraction (if needed)

## Naming Conventions and Style

- **Classes**: PascalCase (e.g., `JobModule`, `ConfigManager`, `LLMService`)
- **Interfaces**: PascalCase (e.g., `EveModule`, `EmailExtractor`)
- **Type exports**: PascalCase (e.g., `Job`, `NewJob`)
- **Functions/Methods**: camelCase
- **Constants/Variables**: camelCase
- **File names**: lowercase with dashes for components, PascalCase for class files (when exported)
- **Database tables**: lowercase (e.g., `jobs`, `sys_config`)
- **Config keys**: dot notation lowercase (e.g., `services.llm.api_key`)

### Code Style
- **Strict TypeScript**: No `any` types - define explicit types
- **Async/await**: Used throughout for async operations
- **Error handling**: Try/catch with console.error for debugging
- **Comments**: Minimal - code should be self-documenting
- **Imports**: Use ES modules (`import/export`)

## Testing

- **Framework**: `bun:test`
- **Location**: `tests/` directory mirrors `src/` structure
- **Test files**: `*.test.ts` suffix
- **Setup**: Use `beforeEach`/`afterEach` for database cleanup
- **Examples**:
  - `tests/core/config.test.ts` - ConfigManager tests
  - `tests/core/dispatcher.test.ts` - Dispatcher routing tests
  - `tests/modules/jobs/extractors.test.ts` - Email extractor tests

**Running tests**:
```bash
bun test                    # Run all tests
bun test tests/core/        # Run specific directory
bun test tests/modules/jobs/extractors.test.ts  # Specific file
```

## Important Gotchas

### Database Paths
- Database file is `eve.db` in the project root
- When building binary, the database path is relative to where the binary runs
- TUI uses a readonly database instance (`Database("eve.db", { readonly: true })`)

### Gmail Integration
- Requires external `gog` CLI tool installed and configured
- Uses `gog gmail search` and `gog gmail thread get` commands
- Thread ID is used for deduplication in the database
- Email body decoding is recursive to handle Gmail's multipart structure (base64url)

### External Services
- **LLM Service**: Lazy initialization - `init()` called on first use if not ready
- **Firecrawl**: Supports both v0 and v1 SDK methods - checks for `scrapeUrl` or `scrape`
- **Rate Limiting**: `jobs:enrich` command includes 2-second delays between requests

### Module Dispatching
- Dispatcher uses heuristic keyword matching and platform detection
- Current modules: `JobModule` only
- Dispatcher is currently tightly coupled to JobModule (TODO: make generic)

### Import Paths
- `src/db/` is the actual schema location (not `src/core/db/`)
- Some files in `src/core/` still reference old paths - check before editing

### PDF Extraction
- Uses system `pdftotext` command via `Bun.spawn()`
- May fail silently for scanned images (warns if extracted text is empty)

### Adapter Pattern
- Email extractors follow the `EmailExtractor` interface
- Priority-based: platform-specific adapters first, then AI fallback
- Each adapter implements `canHandle(sender, subject)` and `extract(email)`

### CLI Command Registration
- Modules register their own commands via `registerCommands(cli)` in `src/index.ts`
- Commands are added to the `cac` CLI instance
- Pattern: `module:action` (e.g., `jobs:enrich`, `jobs:analyze`)

### Configuration JSON Parsing
- `config:set` command auto-parses JSON if value starts with `[` or `{`
- `ConfigManager.get()` auto-parses JSON values, falls back to string if parsing fails

### File Structure Notes
- `.husky/_/` contains git hooks (configured for pre-commit linting)
- `release/` directory contains built binary (gitignored)
- `eve.db.bak` is a database backup (gitignored)

## Creating a New Module

1. Create module directory: `src/modules/<module-name>/`
2. Implement `EvaModule` interface in `index.ts`:
   ```typescript
   export class MyModule implements EvaModule {
       name = "my-module";
       registerCommands(cli: CAC) { /* ... */ }
       async onIngest(event: any) { /* ... */ }
       async getDailyBriefing(): Promise<string> { /* ... */ }
   }
   ```
3. Add module to `src/index.ts` modules array
4. Add database schema to `src/db/schema.ts` if needed
5. Update `src/core/dispatcher.ts` to route relevant events
6. Write tests in `tests/modules/<module-name>/`

## Pre-commit Hooks

- `husky` is configured via `package.json` `"prepare"` script
- Runs `lint-staged` on commit
- `lint-staged` config: `oxlint` and `tsc --noEmit` on `*.ts` files
