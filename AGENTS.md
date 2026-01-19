# AGENTS.md

This document helps AI agents work effectively in the Eve codebase.

## Project Overview

**Eve** is a modular, local-first **AI Personal Agent Platform** built with Bun and TypeScript. It aggregates digital signals (Email, Web), analyzes them with LLMs, and helps users take action through an intelligent assistant interface.

> **Ultimate Goal**: To become a Jarvis-like personal AI assistant.
> **Current Capability**: Job Hunting Copilot.

### System Architecture: Wall-E & Eve

The system is composed of two synchronized entities:

| Component | Role | Tech Stack | Location |
|-----------|------|------------|----------|
| **Eve** (Backend) | "The Mind" - Brain and Memory. Manages capabilities, context, and LLM reasoning | Bun + Hono + SQLite | `src/` |
| **Wall-E** (Frontend) | "The Body" - Eyes and Hands. Chrome Extension for browser interaction | React + Vite + Tailwind | `extension/wall-e/` |

---

## pi-agent Runtime (CRITICAL)

Eve runs on the `@mariozechner/pi-agent-core` runtime. **All AI capabilities are built as AgentTools.**

### Core Concepts

| Concept | Description |
|---------|-------------|
| **Agent** | Central orchestrator managing state, message history, and tool execution |
| **AgentTool** | A capability with name, description, TypeBox parameters, and `execute()` function |
| **Capability** | A logical bundle of tools and services (e.g., Jobs, Email, Calendar) |

### Defining a New Capability

1. Create directory `src/capabilities/<name>/`
2. Define tools in `tools/` using TypeBox
3. Create `index.ts` to export the `Capability` object
4. Register in `src/capabilities/index.ts`

```typescript
// src/capabilities/my-cap/index.ts
export const myCapability: Capability = {
  name: "my_capability",
  description: "Description of what this does",
  tools: [myTool1, myTool2],
};
```

---

## Code Organization

```
eve/
├── src/
│   ├── index.ts              # Hono HTTP server (main entry)
│   ├── core/                 # Core Infrastructure
│   │   ├── agent.ts          # Eve Agent & Capability initialization
│   │   ├── config.ts         # ConfigManager - DB-backed configuration
│   │   └── db.ts             # Database instance
│   │
│   ├── capabilities/         # Eve's Domain Capabilities
│   │   ├── types.ts          # Capability interface definitions
│   │   ├── index.ts          # Capability registry
│   │   └── jobs/             # Job Hunting Capability
│   │       ├── index.ts      # Jobs capability definition
│   │       ├── tools/        # AgentTools (search, analyze, etc.)
│   │       └── services/     # Capability-specific business logic
│   │
│   ├── agents/               # Multi-Agent Management
│   │   └── manager.ts        # Orchestrates different LLM agents
│   │
│   ├── db/                   # Database Schema
│   │   └── schema.ts         # SQLite table definitions
│   │
│   ├── services/             # Shared Infrastructure Services
│   │   ├── llm.ts            # LLM provider wrapper
│   │   └── firecrawl.ts      # Web scraping service
│   │
│   └── modules/              # Legacy Modules (being migrated)
│
├── extension/wall-e/         # Chrome Extension (Frontend)
└── docs/                     # Comprehensive Project Documentation
```

---

## Data Flow

1. **User Intent**: User prompts Eve via Wall-E or CLI.
2. **LLM Reasoning**: pi-agent invokes LLM with current context and available tools.
3. **Tool Call**: LLM decides to call a specific tool (e.g., `jobs_search`).
4. **Execution**: The tool's `execute()` function runs, accessing DB or external APIs.
5. **Observation**: Tool result is sent back to LLM.
6. **Response**: LLM provides a final response or calls another tool.

---

## Documentation Reference

- `docs/PRD.md` - Product vision
- `docs/TECH_SPEC.md` - Technical architecture
- `docs/CAPABILITY_FRAMEWORK_PLAN.md` - Capability system implementation details
- `docs/UI_SKILLS.md` - Frontend development constraints
