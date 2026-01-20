# Eve Technical Specification

> **Last Updated**: 2026-01-20
> **Version**: 0.3.0

## Architecture Overview

Eve follows a **"Kernel + Capabilities"** architecture, running on the `@mariozechner/pi-agent-core` runtime.

```
┌─────────────────────────────────────────────────────────────────┐
│                        Wall-E (Chrome Extension)                │
│                    React + Tailwind + Milkdown                  │
└───────────────────────────────┬─────────────────────────────────┘
                                │ HTTP/SSE
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                         Eve Backend                             │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                    Hono HTTP Server                      │  │
│  │            (Auth Middleware, CORS, Body Limit)           │  │
│  └────────────────────────┬─────────────────────────────────┘  │
│                           │                                     │
│  ┌────────────────────────▼─────────────────────────────────┐  │
│  │                    Eve Agent Core                         │  │
│  │               (pi-agent-core runtime)                     │  │
│  └────────────────────────┬─────────────────────────────────┘  │
│                           │                                     │
│  ┌────────────────────────▼─────────────────────────────────┐  │
│  │                    Capabilities                           │  │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────────────┐ │  │
│  │  │  Jobs   │ │ Resume  │ │  Email  │ │    Analytics    │ │  │
│  │  │ 8 tools │ │ 6 tools │ │ 3 tools │ │    (services)   │ │  │
│  │  └─────────┘ └─────────┘ └─────────┘ └─────────────────┘ │  │
│  └──────────────────────────────────────────────────────────┘  │
│                           │                                     │
│  ┌────────────────────────▼─────────────────────────────────┐  │
│  │                  Shared Services                          │  │
│  │           LLM | Firecrawl | Gmail | Config               │  │
│  └──────────────────────────────────────────────────────────┘  │
│                           │                                     │
│  ┌────────────────────────▼─────────────────────────────────┐  │
│  │                   SQLite (Drizzle ORM)                    │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Core Components

### 1. Eve Agent (`src/core/agent.ts`)

Central orchestrator built on pi-agent-core.

```typescript
interface EveAgentConfig {
  systemPrompt?: string;
  provider?: string;  // anthropic, openai, google
  model?: string;
}

// Factory function
async function createEveAgent(config?: EveAgentConfig): Promise<Agent>
```

**Responsibilities**:
- Initialize all capabilities
- Collect AgentTools from registered capabilities
- Handle LLM provider configuration
- Manage agent lifecycle

### 2. Capability System (`src/capabilities/`)

Each capability is a self-contained domain module.

```typescript
interface Capability {
  name: string;
  description: string;
  tools: AgentTool[];
  init?: (ctx: CapabilityContext) => Promise<void>;
  dispose?: () => Promise<void>;
}

interface CapabilityContext {
  db: typeof db;
  config: typeof ConfigManager;
}
```

**Registration** (`src/capabilities/index.ts`):
```typescript
// Capabilities auto-register on import
const [{ jobsCapability }, { emailCapability }, { resumeCapability }] = 
  await Promise.all([
    import("./jobs"),
    import("./email"),
    import("./resume"),
  ]);
```

### 3. AgentTool Definition

Tools use TypeBox for parameter validation:

```typescript
import { Type } from "@sinclair/typebox";
import type { AgentTool } from "@mariozechner/pi-agent-core";

const exampleTool: AgentTool = {
  name: "capability_action",
  label: "Human-Readable Label",
  description: "What this tool does (for LLM context)",
  parameters: Type.Object({
    param1: Type.String({ description: "Parameter description" }),
    param2: Type.Optional(Type.Number()),
  }),
  execute: async (toolCallId, params, signal, onUpdate) => {
    // Implementation
    return {
      content: [{ type: "text", text: JSON.stringify(result) }]
    };
  }
};
```

---

## Data Flow

### Job Analysis Flow

```
1. User: "Analyze job #123"
           │
           ▼
2. Agent receives prompt
           │
           ▼
3. LLM decides to call `jobs_analyze_single` tool
           │
           ▼
4. Tool execution:
   - Fetch job from DB
   - Check analysis cache
   - If not cached: call LLM for analysis
   - Store in `job_analysis` table
   - Update job status history
           │
           ▼
5. Return structured result to Agent
           │
           ▼
6. LLM formats response for user
```

### Resume Tailoring Flow

```
1. Wall-E: POST /tailor/:jobId { resumeId }
           │
           ▼
2. TailorService:
   - Fetch job description
   - Fetch resume content
   - Check existing tailored versions
           │
           ▼
3. If no version or forceNew:
   - LLM generates tailored resume
   - Store in `tailored_resumes` table
           │
           ▼
4. Return { tailoredResume, version, isNew }
```

---

## HTTP API Design

### Authentication

Bearer token authentication via `auth_tokens` table:

```typescript
// Middleware: src/core/auth.ts
Authorization: Bearer <token>

// Token validation
const isValid = await validateToken(token);
```

### SSE Streaming

Used for long-running operations:

```typescript
// Jobs sync with real-time progress
GET /jobs/sync?token=<token>

// SSE events
data: {"status":"syncing","fetched":5,"total":20}
data: {"status":"complete","newJobs":3}
```

---

## Database Schema

### Key Tables

| Table | Primary Key | Foreign Keys |
|-------|-------------|--------------|
| `jobs` | `id` (auto) | - |
| `resumes` | `id` (auto) | - |
| `tailored_resumes` | `id` (auto) | `job_id`, `resume_id` |
| `job_analysis` | `id` (auto) | `job_id`, `resume_id` |
| `job_status_history` | `id` (auto) | `job_id` |
| `auth_tokens` | `id` (auto) | - |
| `sys_config` | `key` | - |

### Deduplication

Jobs use `url_hash` for deduplication:
```typescript
urlHash: text('url_hash').unique()
```

---

## Technology Stack

### Backend (Eve)

| Layer | Technology |
|-------|------------|
| Runtime | Bun |
| HTTP | Hono |
| Database | SQLite + Drizzle ORM |
| AI | pi-agent-core + Anthropic/OpenAI/Google |
| Scraping | Firecrawl |
| Email | gog CLI (Gmail) |

### Frontend (Wall-E)

| Layer | Technology |
|-------|------------|
| Framework | React 18 |
| Bundler | Vite |
| Styling | Tailwind CSS |
| Components | Base UI / Radix |
| Editor | Milkdown (Markdown) |
| i18n | Custom (en/zh) |
| Extension | Chrome MV3 |

---

## Configuration

### Environment Variables

```bash
ANTHROPIC_API_KEY=sk-...
OPENAI_API_KEY=sk-...
GOOGLE_API_KEY=...
FIRECRAWL_API_KEY=fc-...
```

### Database Configuration

```bash
eve config:set services.llm.provider "anthropic"
eve config:set services.llm.model "claude-3-5-sonnet-20241022"
eve config:set services.google.accounts '["user@gmail.com"]'
```

---

## Development Commands

```bash
# Start TUI dashboard
bun run src/index.ts

# Start HTTP API server
bun run src/index.ts serve

# CLI commands
bun run src/index.ts jobs:list
bun run src/index.ts email:sync
```

---

## Related Documentation

- `STATUS.md` - Current implementation status
- `ROADMAP.md` - Future plans and milestones
- `UI_SKILLS.md` - Frontend development constraints
- `AGENTS.md` - AI agent development guide
