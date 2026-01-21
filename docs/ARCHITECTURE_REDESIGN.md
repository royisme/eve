# Eve Architecture Redesign

> **Status**: Discussion Draft
> **Date**: 2026-01-20
> **Goal**: Transform Eve from a Job Hunting Copilot to a true AI Personal Agent Platform

---

## Table of Contents

1. [Problem Analysis](#1-problem-analysis)
2. [Core Design Principles](#2-core-design-principles)
3. [Directory Structure](#3-directory-structure)
4. [Configuration System](#4-configuration-system)
5. [Multi-Agent Orchestration](#5-multi-agent-orchestration)
6. [Agent Room Architecture](#6-agent-room-architecture)
7. [Memory System](#7-memory-system)
8. [Context Passing Mechanism](#8-context-passing-mechanism)
9. [Failure & Retry Mechanism](#9-failure--retry-mechanism)
10. [Migration Path](#10-migration-path)

---

## 1. Problem Analysis

### Current State Issues

| Layer | Design Goal | Current Implementation | Severity |
|-------|-------------|------------------------|----------|
| **Database Schema** | Generic/Extensible | 100% Job-specific (jobs, resumes, tailoredResumes, jobAnalysis, jobStatusHistory) | 🔴 Critical |
| **Capabilities** | Independent Modules | email/resume are actually jobs dependencies | 🟡 Medium |
| **Core Agent** | General Assistant | System prompt is generic, but no generic tools | 🟡 Medium |
| **CLI/UI** | General Entry Point | Commands are all jobs/email specific | 🔴 Critical |
| **Config** | Lightweight JSON | Stored in SQLite (sysConfig table) | 🔴 Critical |
| **Agent Management** | Multi-agent Orchestration | Single agent with hardcoded model aliases | 🔴 Critical |

### Root Cause

> **MVP Trap**: To quickly deliver the Job Hunting use case, core abstractions were skipped.

### Missing Core Capabilities for a True AI Assistant

- ❌ Conversation memory
- ❌ Notes/Knowledge management  
- ❌ Task management
- ❌ Calendar integration
- ❌ General web browsing/search
- ❌ General file operations
- ❌ Multi-agent orchestration

---

## 2. Core Design Principles

### Principle 1: Eve Core is Zero-DB

Eve core should only depend on a JSON config file, not SQLite.

```
Eve Core = Config Reader + Agent Orchestrator + Capability Loader
```

### Principle 2: Capabilities Own Their Storage

Each capability (Jobs, Calendar, Notes) manages its own persistence.

### Principle 3: Eve is the Orchestrator, Not Just an Agent

Eve coordinates multiple specialized agents, routing tasks to the right agent.

### Principle 4: Configuration-Driven

Everything should be configurable without code changes:
- Providers & Models
- Agent definitions
- Task routing rules
- Fallback strategies

---

## 3. Directory Structure

### Current (Problematic)

```
~/.config/eve/
└── eve.db          ← One giant SQLite with everything
    ├── sysConfig   ← Eve core config (mixed in DB)
    ├── jobs        ← Jobs module data
    ├── resumes     ← Jobs module data
    └── ...
```

### Target Architecture

```
~/.config/eve/
├── eve.json                          # Global config (providers, models, routing)
│
├── agents/                           # Agent Rooms root directory
│   ├── extractor/                    # Agent: extractor
│   │   ├── agent.json                # Agent definition
│   │   ├── memory/
│   │   │   ├── long-term.md          # Long-term memory (accumulated knowledge)
│   │   │   └── daily/
│   │   │       ├── 2026-01-20.json   # Short-term memory (daily context)
│   │   │       └── ...               # Auto-cleanup (retain N days)
│   │   └── logs/                     # Execution logs (optional)
│   │
│   ├── analyst/
│   │   ├── agent.json
│   │   ├── memory/
│   │   └── tools/                    # Agent-specific tools (optional)
│   │
│   └── writer/
│       └── ...
│
├── context/                          # Shared context storage
│   ├── context.db                    # SQLite: compressed context chunks
│   └── context.db-wal
│
├── capabilities/                     # Capability data (isolated)
│   ├── jobs/
│   │   └── jobs.db
│   ├── calendar/
│   │   └── calendar.db
│   └── notes/
│       └── notes.db
│
└── auth/
    └── tokens.db                     # Or tokens.json
```

---

## 4. Configuration System

### Global Config (`eve.json`)

```jsonc
{
  // ═══════════════════════════════════════════════════════════════════════════
  // Layer 1: Providers & Models (底层资源)
  // ═══════════════════════════════════════════════════════════════════════════
  "providers": {
    "anthropic": {
      "api_key": "sk-ant-...",
      "base_url": null                    // Optional, for proxy
    },
    "openai": {
      "api_key": "sk-...",
      "base_url": "https://api.openai.com/v1"
    },
    "ollama": {
      "base_url": "http://localhost:11434"
    }
  },

  "models": {
    // User-defined model aliases
    "fast": { "provider": "anthropic", "model": "claude-3-5-haiku-20241022" },
    "smart": { "provider": "anthropic", "model": "claude-3-5-sonnet-20241022" },
    "cheap": { "provider": "ollama", "model": "llama3.2" },
    "reasoning": { "provider": "openai", "model": "o1-preview" }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // Layer 2: Agent References (agents defined in their own rooms)
  // ═══════════════════════════════════════════════════════════════════════════
  "agents": {
    "enabled": ["extractor", "analyst", "writer"],
    "auto_discover": true                 // Scan agents/ directory
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // Layer 3: Routing (Task → Agent mapping)
  // ═══════════════════════════════════════════════════════════════════════════
  "routing": {
    // Capability-level routing
    "capabilities": {
      "jobs.analyze": "analyst",
      "jobs.tailor": "writer",
      "jobs.enrich": "extractor",
      "email.parse": "extractor"
    },
    
    // Task-type routing (finer granularity)
    "tasks": {
      "extract:*": "extractor",
      "analyze:*": "analyst",
      "generate:*": "writer"
    }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // Layer 4: Eve (Orchestrator & Fallback)
  // ═══════════════════════════════════════════════════════════════════════════
  "eve": {
    "model": "smart",                     // Eve's own model
    "role": "orchestrator",               // "orchestrator" | "direct"
    "fallback": true,                     // When no route matches, Eve handles it
    "system_prompt": "You are Eve, a personal AI orchestrator..."
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // Capabilities
  // ═══════════════════════════════════════════════════════════════════════════
  "capabilities": {
    "enabled": ["jobs", "email", "resume", "scheduler"],
    "auto_discover": true
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // Global Defaults
  // ═══════════════════════════════════════════════════════════════════════════
  "defaults": {
    "retry": {
      "max_retries": 3,
      "retry_delay_ms": 1000,
      "backoff_multiplier": 2,
      "max_delay_ms": 30000
    },
    "memory": {
      "short_term_retention_days": 7,
      "long_term_max_size_kb": 512
    },
    "context": {
      "default_expiry_hours": 168,        // 7 days
      "compression": "json"
    }
  }
}
```

### Layer 1: Providers (Confirmed Base Schema)

Providers are the lowest-level runtime dependency. Eve and all agents resolve models through providers.

```jsonc
{
  "providers": {
    "anthropic": {
      "api_key": "sk-ant-...",
      "base_url": null,
      "timeout_ms": 30000,
      "rate_limit": {
        "requests_per_minute": 60,
        "tokens_per_minute": 120000
      }
    },
    "openai": {
      "api_key": "sk-...",
      "base_url": "https://api.openai.com/v1",
      "timeout_ms": 30000
    },
    "ollama": {
      "base_url": "http://localhost:11434",
      "timeout_ms": 30000
    }
  }
}
```

**Rules**
- Provider entry must include at least `base_url` or `api_key` (depending on provider).
- Provider config is shared across all agents and Eve.
- Provider config changes require reload (manual or idle auto-reload).

**Confirmed**
- API keys live directly in `eve.json` (local-only config).
- Provide `schema.json` to guide configuration and validation.

### `schema.json` Generation (Confirmed)

`schema.json` is generated from a single TypeScript/TypeBox source of truth.

**Rules**
- Define `EveConfig` as TypeBox schema in code.
- Generate `schema.json` from TypeBox at build time.
- Never hand-edit `schema.json`.

---

### Layer 2: Models (Confirmed Base Schema)

Models are user-defined aliases referencing provider-specific model IDs. Agents and Eve reference **aliases**, not raw model IDs.

```jsonc
{
  "models": {
    "fast": { "provider": "anthropic", "model": "claude-3-5-haiku-20241022" },
    "smart": { "provider": "anthropic", "model": "claude-3-5-sonnet-20241022" },
    "cheap": { "provider": "ollama", "model": "llama3.2" },
    "reasoning": { "provider": "openai", "model": "o1-preview" }
  },
  "model_fallback_chain": {
    "reasoning": ["smart", "fast"],
    "smart": ["fast", "cheap"],
    "fast": ["cheap"]
  }
}
```

**Rules**
- A model alias must map to exactly one provider + model ID.
- Fallback chain is alias-to-alias only (no raw model IDs).
- Eve and agents must resolve the chain before dispatch.

**Confirmed**
- Provider configuration is valid only if at least one model alias references it.
- Model selection is driven by agent configuration (Eve does not auto-assign provider defaults).
- No per-model constraints or overrides beyond existing pi-agent runtime support.

---

## 5. Multi-Agent Orchestration

### Architecture Overview

```
┌────────────────────────────────────────────────────────────────┐
│                         USER REQUEST                           │
└───────────────────────────┬────────────────────────────────────┘
                            ▼
┌────────────────────────────────────────────────────────────────┐
│                     EVE (Orchestrator)                         │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  1. Understand user intent                               │  │
│  │  2. Decompose tasks                                      │  │
│  │  3. Query routing rules                                  │  │
│  │  4. Dispatch to specialized agents                       │  │
│  │  5. Aggregate results                                    │  │
│  │  6. Fallback execution                                   │  │
│  └──────────────────────────────────────────────────────────┘  │
└───────────────────────────┬────────────────────────────────────┘
                            │ dispatch
            ┌───────────────┼───────────────┐
            ▼               ▼               ▼
     ┌──────────┐    ┌──────────┐    ┌──────────┐
     │ extractor│    │  analyst │    │  writer  │
     │  (fast)  │    │  (smart) │    │  (smart) │
     └──────────┘    └──────────┘    └──────────┘
            │               │               │
            └───────────────┼───────────────┘
                            ▼
                    ┌──────────────┐
                    │   RESPONSE   │
                    └──────────────┘
```

### Key Concepts

| Concept | Description |
|---------|-------------|
| **Eve** | Orchestrator + Fallback. Routes tasks, aggregates results. |
| **Agent** | Specialized worker with defined role, model, and permissions. |
| **Routing** | Rules mapping tasks/capabilities to agents. |
| **Fallback** | When routing fails or agent fails, Eve handles it. |

### Orchestrator Decision Logic (Confirmed)

**Goal**: Eve decides whether to handle a task directly or delegate to a specialized agent.

**Decision Order (Deterministic)**

1. **Explicit Route**
   - If the task/capability matches a configured route → delegate to that agent.
2. **Capability Metadata Route**
   - If the capability declares intent tags or responsibilities → delegate.
3. **Task Type Pattern Route**
   - Match `extract:*`, `analyze:*`, `generate:*`, etc.
4. **Keyword Heuristic (Fallback)**
   - Only if none of the above match. Uses capability-provided keywords.
5. **Eve Direct Handling**
   - If still no match, Eve handles the task directly.

**Default Strategy**: **B — Eve performs intent recognition + routing rules**

---

### Capability Routing Metadata (Confirmed)

Capabilities can provide structured routing metadata. Intent tags take priority; keywords are auxiliary only.

```jsonc
// capability.json (or exported metadata)
{
  "capability": "jobs",
  "routes": {
    "intents": ["jobs:analyze", "jobs:tailor", "jobs:search"],
    "keywords": ["job", "resume", "hiring", "职位", "简历"]
  }
}
```

**Rule**: *Intent tags first, keywords only as fallback.*

### Routing Layer (Confirmed)

**Task Tag Format**: `module:task` (e.g., `jobs:analyze`, `jobs:enrich`).

**Conflict Resolution**: explicit priority wins. Higher `priority` value wins when multiple routes match.

```jsonc
"routing": {
  "tasks": [
    { "pattern": "jobs:*", "agent": "analyst", "priority": 90 },
    { "pattern": "email:*", "agent": "extractor", "priority": 80 }
  ],
  "capabilities": [],
  "keywords": [
    { "pattern": "resume|简历|cv", "agent": "writer", "priority": 10 }
  ]
}
```

**Rule**: if multiple routes match at the same priority, Eve logs a warning and falls back to the default agent (Eve).

### Eve Orchestrator Layer (Confirmed)

**Operating Modes**
- `direct`: Eve handles tasks without delegation.
- `orchestrator`: Eve routes tasks to agents and aggregates results.

**Confirmed Capabilities**
- Eve may decompose a task into multiple subtasks and dispatch them **in parallel**.
- Eve may run **multi-agent voting** (parallel responses) and aggregate into a final output.

#### Decision Flow (High-Level)

1. **Classify** request intent and task tags (`module:task`).
2. **Route** using priority-based rules (capabilities → tasks → keywords).
3. **Decompose** if the task is multi-stage or requires specialized skills.
4. **Dispatch** subtasks in parallel when independent.
5. **Aggregate** results using a chosen strategy (merge, rank, vote).
6. **Fallback** to Eve if routing fails or agents fail.

#### Decomposition Rules

Eve decomposes when:
- Task explicitly requests multiple outputs.
- Task is cross-domain (e.g., email + jobs + resume).
- Task requires separate skills (extract → analyze → generate).

Eve does **not** decompose when:
- Task is simple and fits one agent responsibility.
- Task requires strict ordering with no parallel steps.

#### Aggregation Strategies

- **merge**: combine complementary outputs (default for extract + analyze chains)
- **rank**: select best output based on confidence or scoring
- **vote**: majority consensus from multiple agents (for subjective tasks)

#### Fallback Behavior

- If no route matches → Eve handles directly.
- If agent fails after retries → Eve handles directly or uses fallback chain.
- If aggregation fails → Eve returns best-effort response with partial results.

**Confirmed**
- Eve may directly call tools even in orchestrator mode.

---

## 6. Agent Room Architecture

### Agent Definition (`agents/<name>/agent.json`)

```jsonc
// ~/.config/eve/agents/analyst/agent.json
{
  "id": "analyst",
  "name": "Job Analyst",
  "version": "1.0.0",
  
  // ═══════════════════════════════════════════════════════════════════════════
  // Role Definition
  // ═══════════════════════════════════════════════════════════════════════════
  "role": {
    "description": "Analyzes job postings and evaluates candidate fit",
    "personality": "Analytical, thorough, honest about gaps",
    "system_prompt": "You are a senior recruiter and career coach..."
  },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // Model Configuration (references model alias from eve.json)
  // ═══════════════════════════════════════════════════════════════════════════
  "model": {
    "primary": "smart",           // Primary model
    "fallback": "fast",           // Fallback model
    "temperature": 0.3,
    "thinking": "medium"          // Extended thinking level
  },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // Responsibilities (matchable by routing)
  // ═══════════════════════════════════════════════════════════════════════════
  "responsibilities": [
    "jobs.analyze",
    "jobs.analyze_single", 
    "jobs.prescore",
    "analyze:job-fit",
    "analyze:resume-match"
  ],
  
  // ═══════════════════════════════════════════════════════════════════════════
  // Permission Control
  // ═══════════════════════════════════════════════════════════════════════════
  "permissions": {
    "tools": {
      "allow": ["jobs_*", "resume_get"],   // Glob matching
      "deny": ["email_*", "system_*"]
    },
    "capabilities": ["jobs", "resume"],     // Accessible capabilities
    "can_delegate": false,                  // Can call other agents
    "can_access_context": true,             // Can read shared context
    "max_tokens_per_call": 8000             // Token limit per call
  },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // Memory Configuration
  // ═══════════════════════════════════════════════════════════════════════════
  "memory": {
    "long_term": {
      "enabled": true,
      "max_size_kb": 512,                   // Long-term memory size limit
      "auto_summarize": true                // Auto-summarize when exceeding limit
    },
    "short_term": {
      "retention_days": 7,                  // Short-term memory retention
      "auto_cleanup": true
    }
  },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // Error Handling
  // ═══════════════════════════════════════════════════════════════════════════
  "error_handling": {
    "max_retries": 3,
    "retry_delay_ms": 1000,
    "fallback_strategy": "use_fallback_model",  // "use_fallback_model" | "delegate_to_eve" | "fail"
    "on_timeout": "delegate_to_eve"
  }
}
```

**Confirmed**
- Agents may omit fields and inherit defaults from `eve.json.defaults`.
- Agent IDs are flat strings only (no hierarchical names like `jobs/analyst`).

### Agent Defaults & Permissions (Confirmed)

**Defaults**
- `permissions.tools`: allow-all by default; use `deny` to restrict.
- `permissions.can_delegate`: false by default.
- `memory.long_term.enabled`: true by default.

**Implication**
- For sensitive modules, explicitly deny tools in `agent.json`.
- Delegation must be explicitly granted to allow agent-to-agent calls.

### Agent Permissions (Best Practices)

**Precedence**
- `deny` overrides `allow`.

**Scope**
- Permissions apply to agent tool calls only.
- Eve direct tool calls are not restricted by agent permissions.

**Recommended Defaults**
- Start with allow-all, then deny high-risk tools (auth, file, admin).
- Add explicit allow lists for specialized agents handling sensitive tasks.

### Agent Room Structure

```
agents/<agent-id>/
├── agent.json              # Agent definition (required)
├── memory/
│   ├── long-term.md        # Persistent knowledge, preferences, learnings
│   └── daily/
│       ├── 2026-01-20.json # Today's context
│       ├── 2026-01-19.json # Yesterday (auto-cleanup after N days)
│       └── ...
├── tools/                  # Agent-specific tools (optional)
│   └── custom-tool.ts
└── logs/                   # Execution logs (optional)
    └── 2026-01-20.log
```

### Agent Config Reload Strategy (Confirmed)

**Default**: manual reload (explicit command).

**Optional**: auto-reload *only when all agents are idle* (no active task).

**Rules**:
- Never hot-reload while an agent is executing.
- A reload always re-reads `agent.json` and reinitializes the agent instance.
- Ongoing tasks continue with the old instance until completion.

**Rationale**: avoids breaking state mid-task and guarantees deterministic behavior.

### Logging & Auditing (Best Practices)

**Agent Logs**
- Write per-agent execution logs to `agents/<id>/logs/YYYY-MM-DD.log`.
- Include: task tag, agent id, model alias, duration, success/failure.

**Eve Logs**
- Log routing decisions and aggregation strategy.
- Log fallback events and retry counts.

---

## 7. Memory System

### Memory Hierarchy

| Type | Storage | Retention | Purpose |
|------|---------|-----------|---------|
| **Long-term** | `memory/long-term.md` | Permanent | Accumulated knowledge, preferences, learnings |
| **Short-term** | `memory/daily/*.json` | N days | Daily context, recent interactions |
| **Context** | `context/context.db` | Configurable | Cross-agent data passing |

### Long-term Memory Format

```markdown
<!-- memory/long-term.md -->
# Agent: analyst

## Preferences
- User prefers remote-first positions
- Salary expectations: $150k-200k
- Location preference: US/Canada timezone

## Learnings
- User has strong Python skills but weak in Go
- Previous applications to FAANG were unsuccessful
- User values work-life balance over compensation

## Patterns
- Jobs with "on-call" requirements usually rejected
- Startup roles (< 50 employees) preferred

## Last Updated
2026-01-20T15:30:00Z
```

### Short-term Memory Format

```jsonc
// memory/daily/2026-01-20.json
{
  "date": "2026-01-20",
  "sessions": [
    {
      "id": "sess_abc123",
      "started_at": "2026-01-20T10:00:00Z",
      "tasks": [
        {
          "type": "analyze:job-fit",
          "input_context_ids": ["ctx_001", "ctx_002"],
          "output_context_id": "ctx_003",
          "duration_ms": 2500,
          "status": "success"
        }
      ]
    }
  ],
  "summary": "Analyzed 5 jobs, 2 high-fit, 3 rejected"
}
```

### Memory Auto-Management

```typescript
interface MemoryManager {
  // Long-term operations
  appendToLongTerm(agentId: string, content: string): Promise<void>;
  summarizeLongTerm(agentId: string): Promise<void>;  // When exceeding size limit
  
  // Short-term operations
  recordToDaily(agentId: string, entry: DailyEntry): Promise<void>;
  cleanupOldDaily(agentId: string, retentionDays: number): Promise<void>;
  
  // Cross-memory
  promoteToLongTerm(agentId: string, insight: string): Promise<void>;
}
```

---

## 8. Context Passing Mechanism

### Flow Diagram

```
┌─────────────┐     ┌─────────────────────────────────────────┐
│    EVE      │────▶│  context.db (SQLite + Vector Extension) │
│ Orchestrator│     └─────────────────────────────────────────┘
└──────┬──────┘                        │
       │                               │
       │ dispatch(task, context_ids[]) │
       ▼                               │
┌─────────────┐                        │
│   Agent A   │◀───────────────────────┘
│ (extractor) │  fetch context by IDs
└──────┬──────┘
       │
       │ produce result → compress → store → get new context_id
       ▼
┌─────────────────────────────────────────┐
│  context.db                             │
│  ┌─────────────────────────────────────┐│
│  │ id: ctx_abc123                      ││
│  │ type: "extraction_result"           ││
│  │ agent: "extractor"                  ││
│  │ content: { compressed JSON }        ││
│  │ embedding: [0.1, 0.2, ...]  (opt)   ││
│  │ created_at: "2026-01-20T..."        ││
│  │ expires_at: "2026-01-27T..."        ││
│  └─────────────────────────────────────┘│
└─────────────────────────────────────────┘
       │
       │ return context_id to Eve
       ▼
┌─────────────┐
│    EVE      │  dispatch(next_task, [ctx_abc123, ...])
└──────┬──────┘
       │
       ▼
┌─────────────┐
│   Agent B   │  fetch [ctx_abc123] → decompress → use
│  (analyst)  │
└─────────────┘
```

### Context Database Schema

```sql
-- context/context.db
CREATE TABLE contexts (
  id TEXT PRIMARY KEY,              -- ctx_xxx format
  type TEXT NOT NULL,               -- Context type
  agent_id TEXT,                    -- Agent that produced this context
  
  -- Content
  content TEXT NOT NULL,            -- Compressed JSON
  content_hash TEXT,                -- For deduplication
  
  -- Vector (optional, for semantic retrieval)
  embedding BLOB,                   -- Serialized float32[]
  
  -- Metadata
  parent_ids TEXT,                  -- JSON array of parent context IDs
  metadata TEXT,                    -- Free-form JSON
  
  -- Lifecycle
  created_at TEXT NOT NULL,
  expires_at TEXT,                  -- NULL = never expires
  accessed_at TEXT,                 -- Last access time
  access_count INTEGER DEFAULT 0
);

CREATE INDEX idx_context_type ON contexts(type);
CREATE INDEX idx_context_agent ON contexts(agent_id);
CREATE INDEX idx_context_expires ON contexts(expires_at);
```

### Compression Strategies

| Level | Method | Use Case |
|-------|--------|----------|
| `none` | Raw storage | Small, critical data |
| `json` | JSON.stringify + gzip | Structured data |
| `selective` | Keep only specified fields | Large objects with few important fields |
| `summarize` | LLM summarization | Large text content |

### Context Retrieval Strategy (Confirmed)

**Default: ID-first, Semantic fallback**

1. **Primary path**: pass context IDs directly between agents.
2. **Fallback path**: use semantic search only when IDs are missing or insufficient.
3. **Reason**: deterministic, cheap, and debuggable by default.

### Context Lifecycle (Best Practices)

**Retention**
- Default expiry: 7 days (`defaults.context.default_expiry_hours = 168`).
- Per-context overrides allowed at creation.

**Cleanup**
- Perform cleanup on startup and once daily (cron or scheduled job).
- Remove expired contexts and update metrics.

```typescript
interface ContextCompressor {
  compress(data: any, options: {
    maxTokens?: number;      // Token limit
    preserveKeys?: string[]; // Must-keep fields
    summarize?: boolean;     // Use LLM summarization
  }): Promise<CompressedContext>;
  
  decompress(ctx: CompressedContext): any;
}
```

---

## 9. Failure & Retry Mechanism

### Retry Policy

```typescript
interface RetryPolicy {
  // Defaults (can be overridden by agent.json)
  defaults: {
    maxRetries: 3,
    retryDelayMs: 1000,
    backoffMultiplier: 2,        // Exponential backoff
    maxDelayMs: 30000
  };
  
  // Error classification
  errorClassification: {
    retryable: [
      "rate_limit",
      "timeout", 
      "connection_error",
      "overloaded"
    ],
    non_retryable: [
      "invalid_api_key",
      "content_policy",
      "context_length_exceeded"
    ]
  };
}
```

### Fallback Chain

```typescript
interface FallbackChain {
  // Agent-level fallback
  agentFallback: {
    // 1. First try fallback model
    useFallbackModel: true,
    
    // 2. If still fails, delegate to Eve
    delegateToEve: true,
    
    // 3. Eve also fails, return structured error
    finalFallback: "structured_error"
  };
  
  // Model-level fallback (configured in eve.json)
  modelFallbackChain: {
    "smart": ["fast", "cheap"],      // smart fails → fast → cheap
    "fast": ["cheap"],
    "reasoning": ["smart", "fast"]
  };
}
```

### Execution Flow

```
User Request
     │
     ▼
┌─────────────────────────────────────────────────────────┐
│ EVE: Route to Agent                                     │
└────────────────────────┬────────────────────────────────┘
                         │
                         ▼
              ┌──────────────────┐
              │   Agent: analyst │
              │   Model: smart   │
              └────────┬─────────┘
                       │
          ┌────────────┼────────────┐
          │            │            │
       Success      Retryable    Non-retryable
          │          Error         Error
          │            │            │
          ▼            ▼            ▼
       Return     Retry (max 3)   Fallback Model
                       │            │
                    ┌──┴──┐         │
                 Success  Fail      │
                    │      │        │
                    ▼      ▼        ▼
                 Return  Fallback  Try fallback model
                         Model        │
                           │       ┌──┴──┐
                           │    Success  Fail
                           │       │      │
                           ▼       ▼      ▼
                        Try it   Return  Delegate to Eve
                           │               │
                        ┌──┴──┐            │
                     Success  Fail         │
                        │      │           │
                        ▼      ▼           ▼
                     Return  Delegate   Eve handles
                            to Eve      or returns
                               │        structured error
                               ▼
                          Eve handles
```

---

## 10. Migration Path

### Phase 1: Extract Core Config (Priority: High)

1. Create `eve.json` to replace `sysConfig` table
2. Implement `ConfigReader` that reads from JSON file
3. Keep SQLite for capability data only
4. Migrate existing sysConfig data to eve.json

### Phase 2: Refactor Capability Storage (Priority: High)

1. Define `CapabilityStorage` interface
2. Move Jobs tables to `capabilities/jobs/jobs.db`
3. Each capability initializes its own DB on demand
4. Update schema to be capability-scoped

### Phase 3: Implement Agent Rooms (Priority: Medium)

1. Create `agents/` directory structure
2. Define `agent.json` schema
3. Implement `AgentRoom` class to manage agent lifecycle
4. Add hot-reload capability for agent configs

### Phase 4: Implement Memory System (Priority: Medium)

1. Create memory directory structure per agent
2. Implement `MemoryManager` class
3. Add long-term memory append/summarize
4. Add short-term memory daily recording/cleanup

### Phase 5: Implement Context Passing (Priority: Medium)

1. Create `context/context.db`
2. Implement `ContextStore` class
3. Add compression strategies
4. Integrate with agent dispatch flow

### Phase 6: Eve as Orchestrator (Priority: High)

1. Refactor `AgentManager` to be orchestration-focused
2. Implement routing engine
3. Add fallback chain logic
4. Create `Eve.handle()` as the main entry point

### Phase 7: Add Vector Support (Priority: Low)

1. Integrate sqlite-vss or similar
2. Add embedding generation for context
3. Implement semantic context retrieval

---

## 11. Foundation Build Path (Jobs Migration First)

This section defines the **minimum viable architecture** needed to migrate the existing Jobs module into the new system without blocking on long-term features.

### P0: Core Foundation (Must Land First)

**Goal**: Eve can boot from `eve.json`, resolve models, load agents, and route tasks.

- `eve.json` + `schema.json` (replace sysConfig)
- Provider + model alias resolver
- Agent Room discovery (`agents/*/agent.json`)
- Routing engine with priority + task tags (`category:action`)

**Exit Criteria**
- Eve boots with no DB dependency for config.
- A configured agent can be resolved by name and model alias.
- A task tag routes deterministically to an agent.

### P1: Orchestration Bridge (Jobs Compatibility)

**Goal**: Eve can orchestrate Jobs tasks using agents, with a safe fallback.

- Eve orchestrator state machine (direct + orchestrator)
- Parallel dispatch + aggregation strategies
- Fallback chain (retry → model fallback → Eve direct)
- Context Store (ID-first passing; semantic fallback optional)

**Exit Criteria**
- Jobs tasks can be routed to a specialized agent.
- Eve can still handle tasks directly if routing fails.
- Context IDs can be passed between agents.

### P2: Jobs Capability Migration

**Goal**: Jobs becomes a true capability in the new architecture.

- Add Jobs capability routing metadata (intents + keywords)
- Bind Jobs tasks to agents (analyst/writer/extractor)
- Split Jobs DB into `capabilities/jobs/jobs.db`

**Exit Criteria**
- Jobs functions operate with new routing + agent config.
- Jobs storage is isolated from Eve core.

### P3: Extensions (Optional)

- Memory system (long-term + short-term)
- Vector search for context retrieval
- Capability discovery and enable/disable via config

---

## 12. Minimum Config Example (P0/P1)

### `~/.config/eve/eve.json`

```jsonc
{
  "providers": {
    "anthropic": { "api_key": "sk-ant-...", "base_url": null, "timeout_ms": 30000 },
    "openai": { "api_key": "sk-...", "base_url": "https://api.openai.com/v1" }
  },
  "models": {
    "fast": { "provider": "anthropic", "model": "claude-3-5-haiku-20241022" },
    "smart": { "provider": "anthropic", "model": "claude-3-5-sonnet-20241022" }
  },
  "model_fallback_chain": {
    "smart": ["fast"],
    "fast": []
  },
  "agents": {
    "enabled": ["extractor", "analyst", "writer"],
    "auto_discover": true
  },
  "routing": {
    "tasks": [
      { "pattern": "jobs:*", "agent": "analyst", "priority": 90 },
      { "pattern": "email:*", "agent": "extractor", "priority": 80 }
    ],
    "capabilities": [],
    "keywords": [
      { "pattern": "resume|简历|cv", "agent": "writer", "priority": 10 }
    ]
  },
  "eve": {
    "model": "smart",
    "role": "orchestrator",
    "fallback": true,
    "system_prompt": "You are Eve, a personal AI orchestrator."
  },
  "defaults": {
    "retry": { "max_retries": 3, "retry_delay_ms": 1000 },
    "memory": { "short_term_retention_days": 7, "long_term_max_size_kb": 512 },
    "context": { "default_expiry_hours": 168, "compression": "json" }
  }
}
```

### `~/.config/eve/agents/analyst/agent.json`

```jsonc
{
  "id": "analyst",
  "name": "Job Analyst",
  "role": {
    "description": "Analyzes job postings and evaluates candidate fit",
    "system_prompt": "You are a senior recruiter and career coach."
  },
  "model": { "primary": "smart", "fallback": "fast", "thinking": "medium" },
  "responsibilities": ["jobs:analyze", "jobs:tailor"],
  "permissions": { "tools": { "allow": ["jobs_*", "resume_get"], "deny": ["email_*"] } }
}
```

---

## 13. Jobs Migration Mapping

This maps existing Jobs tools to the new routing tags and default agent roles.

**Confirmed**: tool names will follow the new `module:task` format (no legacy `jobs_*`).

| Existing Tool | New Task Tag | Default Agent | Notes |
|---------------|--------------|---------------|-------|
| `jobs:search` | `jobs:search` | `extractor` | Fast model for search/query parsing |
| `jobs:list` | `jobs:list` | `extractor` | Listing and filtering |
| `jobs:enrich` | `jobs:enrich` | `extractor` | Scrape and normalize JD |
| `jobs:analyze` | `jobs:analyze` | `analyst` | Batch analysis |
| `jobs:analyze-single` | `jobs:analyze-single` | `analyst` | Single job deep analysis |
| `jobs:prescore` | `jobs:prescore` | `analyst` | Quick compatibility check |
| `jobs:tailor` | `jobs:tailor` | `writer` | Resume tailoring |
| `jobs:tailor-history` | `jobs:tailor-history` | `extractor` | Version history retrieval |

**Routing Rules**
- `jobs:*` → `analyst` (default, can be overridden per task)

**Fallback**
- Any unclassified `jobs.*` task falls back to Eve.

---

## 19. Jobs Migration Plan (No Backward Compatibility)

This plan assumes we can break old DB formats, CLI behaviors, and tool names if needed.

### Phase 1: Clean-Slate Foundations

**Actions**
- Delete legacy `eve.db` and sysConfig usage.
- Introduce `~/.config/eve/eve.json` + `schema.json` as the only config source.
- Stand up agent rooms and routing engine.

**Outcome**
- Eve boots from JSON config.
- Routing works without legacy dependencies.

### Phase 2: Rebuild Jobs Capability Around New Tags

**Actions**
- Redefine jobs tools and tag them with `module:task` task tags.
- Create `capabilities/jobs/metadata.json` with intents + keywords.
- Map jobs tools to new tags and agents (extractor/analyst/writer).

**Outcome**
- Jobs routes cleanly through Eve’s orchestrator.

### Phase 3: Jobs Storage Reset

**Actions**
- Create `capabilities/jobs/jobs.db` with a new schema optimized for the new pipeline.
- Remove `src/db/schema.ts` jobs tables or relocate them under the jobs capability.

**Outcome**
- Jobs data is fully isolated from Eve core.

### Phase 4: CLI/Tool Surface Reset

**Actions**
- Redesign CLI commands to use hierarchical form: `eve <module> <task>`.
- No CLI aliasing for `module:task`.
- Remove any compatibility shims.

**Outcome**
- CLI reflects the new architecture cleanly.

### Phase 5: Orchestrator-First Flow

**Actions**
- Ensure all jobs flows enter through Eve orchestrator (not direct tool calls).
- Add multi-agent voting for subjective assessments if desired.

**Outcome**
- Jobs is the first capability fully living in the new orchestration model.

---

## 19.1 Jobs Data Sources (Best Practices)

**Default Sources**
- Email ingestion remains primary.

**Supported Inputs**
- Manual entry (CLI/UI)
- Import from CSV/JSON (optional)

---

## 20. Jobs Schema (Proposed, Capability-Scoped)

**Scope**: `capabilities/jobs/jobs.db`

### Tables (Jobs-Prefixed)

All tables in the Jobs capability are prefixed with `jobs_` so other modules can safely reference them when needed.

#### `jobs_jobs`

```sql
CREATE TABLE jobs_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  -- Source
  account TEXT NOT NULL,                 -- email account or source id
  sender TEXT NOT NULL,
  subject TEXT NOT NULL,
  snippet TEXT,
  raw_body TEXT,
  received_at TEXT NOT NULL,
  thread_id TEXT,
  source TEXT DEFAULT 'email',           -- 'email' | 'manual' | 'import'

  -- Job info
  company TEXT,
  title TEXT,
  url TEXT,
  url_hash TEXT UNIQUE,
  description TEXT,

  -- Tracking
  status TEXT DEFAULT 'inbox',           -- inbox | applied | interview | reject
  applied_at TEXT,

  -- Enrichment
  crawled_at TEXT,

  -- Metadata
  tags TEXT,                             -- JSON array
  priority TEXT,                         -- e.g. 'low' | 'medium' | 'high'
  starred INTEGER DEFAULT 0,

  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_jobs_status ON jobs_jobs(status);
CREATE INDEX idx_jobs_company ON jobs_jobs(company);
CREATE INDEX idx_jobs_title ON jobs_jobs(title);
CREATE INDEX idx_jobs_received_at ON jobs_jobs(received_at);
```

#### `jobs_resumes`

```sql
CREATE TABLE jobs_resumes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  content TEXT NOT NULL,
  is_default INTEGER DEFAULT 0,
  use_count INTEGER DEFAULT 0,
  source TEXT DEFAULT 'paste',           -- paste | file | import
  original_filename TEXT,
  parse_status TEXT DEFAULT 'success',
  parse_errors TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
```

#### `jobs_job_analyses`

```sql
CREATE TABLE jobs_job_analyses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER NOT NULL REFERENCES jobs_jobs(id) ON DELETE CASCADE,
  resume_id INTEGER NOT NULL REFERENCES jobs_resumes(id) ON DELETE CASCADE,
  model TEXT NOT NULL,
  prompt_hash TEXT NOT NULL,
  result TEXT NOT NULL,                  -- JSON
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_job_analyses_job_id ON jobs_job_analyses(job_id);
```

#### `jobs_tailored_resumes`

```sql
CREATE TABLE jobs_tailored_resumes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER NOT NULL REFERENCES jobs_jobs(id) ON DELETE CASCADE,
  resume_id INTEGER NOT NULL REFERENCES jobs_resumes(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  suggestions TEXT,                      -- JSON
  version INTEGER DEFAULT 1,
  is_latest INTEGER DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_tailored_resumes_job_id ON jobs_tailored_resumes(job_id);
```

### Status Values (Confirmed)

- `inbox`
- `applied`
- `interview`
- `reject`

**Note**: no `archived` or `offer` states.

---

## 14. Jobs Capability Metadata (Proposed Standard)

Each capability should provide routing metadata so Eve can match intents before keyword heuristics.

### `capabilities/jobs/metadata.json`

```jsonc
{
  "capability": "jobs",
  "version": "1.0.0",
  "routes": {
    "intents": [
      "jobs:search",
      "jobs:list",
      "jobs:enrich",
      "jobs:tailor-history",
      "jobs:analyze",
      "jobs:analyze-single",
      "jobs:prescore",
      "jobs:tailor"
    ],
    "keywords": [
      "job", "jobs", "hiring", "职位", "简历", "resume", "interview"
    ]
  }
}
```

**Rules**
- `intents` are authoritative for routing.
- `keywords` are fallback-only.
- Capability metadata is loaded at startup and cached.

---

## 15. Eve Orchestrator Pseudocode (Execution Flow)

```typescript
async function handle(request: UserRequest): Promise<Response> {
  const intent = classifyIntent(request.text); // produce task tag(s)

  // 1) Resolve routes by priority
  const route = resolveRoute(intent, request.capability, request.text);

  // 2) Decide whether to decompose
  const plan = shouldDecompose(request, intent)
    ? decompose(request, intent)
    : [{ intent, payload: request.payload }];

  // 3) Dispatch (parallel if independent)
  const results = await dispatchPlan(plan, route);

  // 4) Aggregate
  const response = aggregate(results, selectAggregationStrategy(plan));

  return response;
}

function resolveRoute(intent: string, capability?: string, text?: string): Route | null {
  // Priority order: explicit routes → capability intents → task patterns → keywords
  return matchExplicitRoutes(intent)
    ?? matchCapabilityIntents(intent, capability)
    ?? matchTaskPatterns(intent)
    ?? matchKeywords(text)
    ?? null;
}

async function dispatchPlan(plan: Task[], route: Route | null): Promise<Result[]> {
  const agent = route?.agent ?? "eve";
  return Promise.all(plan.map(task => dispatchTask(agent, task)));
}

async function dispatchTask(agentId: string, task: Task): Promise<Result> {
  try {
    return await agentManager.run(agentId, task);
  } catch (err) {
    return await fallbackToEve(task, err);
  }
}

async function fallbackToEve(task: Task, err: Error): Promise<Result> {
  // Retry → model fallback → Eve direct
  return eveDirect(task, err);
}
```

**Notes**
- Dispatch supports multi-agent voting by duplicating tasks with different agents and aggregating via `vote`.

---

## 16. Intent Classification Strategy (Confirmed)

**Strategy**: LLM-first, rules fallback.

**Multi-Label**: allow up to **3** task tags per request.

### Flow

1. **LLM classification** returns `task_tags[]` and optional `capability_hint`.
2. If LLM fails or returns empty → fall back to rule-based classifier.
3. Normalize tags to `module:task` format.
4. If more than 3 tags → keep top 3 by confidence.

### LLM Output Contract

```jsonc
{
  "task_tags": [
    { "tag": "jobs:analyze", "confidence": 0.91 },
    { "tag": "jobs:enrich", "confidence": 0.74 }
  ],
  "capability_hint": "jobs"
}
```

### Rule-Based Fallback (Examples)

- If text contains "tailor" or "resume" → `jobs:tailor`
- If text contains "analyze" or "fit" → `jobs:analyze`
- If text contains "list" or "show" → `jobs:list`

---

## 16.1 Config Validation (Best Practices)

**Validation Timing**
- Validate `eve.json` at startup.
- Re-validate on manual/idle reload.

**Failure Behavior**
- Hard fail on invalid config that prevents boot (missing providers/models/agents/eve blocks startup).
- Soft warn on non-critical fields (unknown keys, deprecated options).

**Output**
- Print validation errors with precise JSON path.
- Provide a short remediation hint and exit code `1` on hard fail.

---

## 17. Task Decomposition Strategy (Confirmed)

Eve decomposes complex requests into smaller tasks that map cleanly to routing tags and agents.

### When to Decompose

- The request implies **multiple outputs** (e.g., "summarize + analyze + generate").
- The request spans **multiple capabilities** (email + jobs + resume).
- The request implies **pipeline stages** (extract → analyze → generate).

### When NOT to Decompose

- Single-intent tasks that map to one agent.
- Tasks that require strict sequential reasoning without intermediate outputs.

### Decomposition Template

```jsonc
{
  "request_id": "req_123",
  "tasks": [
    {
      "id": "task_extract",
      "tag": "jobs:enrich",
      "depends_on": [],
      "parallel_group": "A"
    },
    {
      "id": "task_analyze",
      "tag": "jobs:analyze",
      "depends_on": ["task_extract"],
      "parallel_group": "B"
    },
    {
      "id": "task_generate",
      "tag": "jobs:tailor",
      "depends_on": ["task_analyze"],
      "parallel_group": "C"
    }
  ]
}
```

### Parallelism Rules

- Tasks in the same `parallel_group` and with no dependencies can run concurrently.
- Tasks with `depends_on` must wait for upstream completion.
- Eve can dispatch independent tasks in parallel by default.

### Output Passing Rules

- Each task writes its output to `context.db` and returns a `context_id`.
- Downstream tasks must reference upstream `context_id`s in input.

### Decomposition Examples

**User**: "Find the latest job at OpenAI, analyze fit, and tailor my resume."

1. `jobs:search`
2. `jobs:enrich`
3. `jobs:analyze`
4. `jobs:tailor`

**User**: "Summarize today's job emails and list top 5 roles."

1. `email:sync`
2. `jobs:list`
3. `jobs:analyze` (optional)

---

## 18. Aggregation Strategy (Confirmed)

Eve aggregates multiple task outputs into a final response using explicit strategies.

### Strategies

| Strategy | Use Case | Mechanism |
|----------|----------|-----------|
| **merge** | Pipeline outputs that build on each other | Concatenate + normalize structured fields |
| **rank** | Multiple candidates or options | Score and pick top N |
| **vote** | Subjective judgments | Majority consensus across agents |

### Strategy Selection Rules

- If tasks are sequential (extract → analyze → generate) → **merge**
- If tasks produce alternative answers → **vote**
- If tasks produce a list of candidates → **rank**

### Merge Example

```jsonc
{
  "inputs": [
    { "type": "extract", "context_id": "ctx_101" },
    { "type": "analyze", "context_id": "ctx_102" }
  ],
  "output": {
    "job": { "company": "OpenAI", "title": "Research Engineer" },
    "analysis": { "fit_score": 0.82, "summary": "Strong match" }
  }
}
```

### Vote Example

```jsonc
{
  "inputs": [
    { "agent": "analyst", "answer": "High fit" },
    { "agent": "writer", "answer": "Medium fit" },
    { "agent": "extractor", "answer": "High fit" }
  ],
  "output": { "decision": "High fit", "confidence": 0.67 }
}
```

### Rank Example

```jsonc
{
  "inputs": [
    { "job_id": 1, "score": 0.82 },
    { "job_id": 2, "score": 0.63 },
    { "job_id": 3, "score": 0.91 }
  ],
  "output": [
    { "job_id": 3, "score": 0.91 },
    { "job_id": 1, "score": 0.82 }
  ]
}
```

### Failure Handling

- If one task fails but others succeed → return partial results with warning.
- If aggregation fails → fallback to Eve direct response using available context IDs.

---

---

## Open Questions

1. **Hot Reload**: How to handle agent config changes at runtime?
2. **Eve Decision Logic**: How does Eve decide to decompose vs. delegate vs. handle directly?
3. **Cross-Agent Communication**: Should agents be able to call each other, or only through Eve?
4. **Vector Retrieval**: When to use semantic search vs. direct context ID passing?
5. **Capability-Agent Relationship**: How to handle capability tools that need specific agent context?

### Confirmed Decisions

- **Orchestrator routing**: Intent tags first, keywords as fallback. Eve uses routing rules + intent recognition (Strategy B).
- **Agent config reload**: Manual by default. Optional auto-reload only when all agents are idle.
- **Context retrieval**: ID-first, semantic search only as fallback.

---

## References

- Original PRD: `docs/PRD.md`
- Tech Spec: `docs/TECH_SPEC.md`
- Current Agent Manager: `src/agents/manager.ts`
- Current Capability Types: `src/capabilities/types.ts`
