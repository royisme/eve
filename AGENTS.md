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

## Development Workflow (MANDATORY)

**All code changes MUST follow this workflow. No exceptions.**

### Daily Dev & Build Flow

**Local dev (source):**

```bash
bun run src/index.ts        # TUI dashboard
bun run src/index.ts serve  # HTTP server
```

**Production build (dist):**

```bash
bun run build               # tsconfig.build.json -> dist/
# output: dist/index.js + dist/** + dist/drizzle/

bun dist/index.js serve     # run compiled output
```

**Migrations:**

- Drizzle SQL lives in `drizzle/`.
- `dist/` builds copy migrations to `dist/drizzle/`.
- App startup always runs migrations automatically.
- When schema changes: run `npx drizzle-kit generate --name <tag>` and commit `drizzle/`.

**Data directory:**

- Default: `~/.config/eve/eve.db`
- Override: `EVE_DATA_DIR=/custom/path` or `--data-dir=/custom/path`
- Users should not need to interact with data directory directly.

### Git Branch Strategy

```
main (protected)
  └── feat/<feature-name>    # New features
  └── fix/<issue-name>       # Bug fixes
  └── refactor/<scope>       # Refactoring
  └── docs/<topic>           # Documentation updates
```

### Required Steps

| Step | Action | Command |
|------|--------|---------|
| 1. Create Branch | Branch off `main` with descriptive name | `git checkout -b feat/my-feature` |
| 2. Develop | Make changes, commit frequently | `git commit -m "feat: add X"` |
| 3. Push | Push branch to remote | `git push -u origin feat/my-feature` |
| 4. Create PR | Open Pull Request for review | `gh pr create --title "feat: ..." --body "..."` |
| 5. Review | Wait for code review approval | Request review from maintainer |
| 6. Merge | Merge after approval | Squash merge to `main` |

### Commit Message Format

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>

[optional body]
```

| Type | Usage |
|------|-------|
| `feat` | New feature |
| `fix` | Bug fix |
| `refactor` | Code restructuring (no behavior change) |
| `docs` | Documentation only |
| `chore` | Build, deps, configs |
| `test` | Adding/updating tests |

### AI Agent Instructions

When implementing features:

1. **ALWAYS** create a feature branch before making changes
2. **NEVER** commit directly to `main`
3. **ALWAYS** create a PR after completing work
4. **WAIT** for user review before merging
5. Use `gh pr create` to create PRs with meaningful descriptions

```bash
# Example workflow for AI agents
git checkout -b feat/new-capability
# ... make changes ...
git add -A
git commit -m "feat(jobs): add resume tailoring service"
git push -u origin feat/new-capability
gh pr create --title "feat(jobs): add resume tailoring" --body "## Summary
- Added TailorService for LLM-based resume customization
- Created API endpoints for tailor operations
- Integrated with Wall-E workspace"
```

---

## Documentation Reference

- `docs/PRD.md` - Product vision
- `docs/TECH_SPEC.md` - Technical architecture
- `docs/CAPABILITY_FRAMEWORK_PLAN.md` - Capability system implementation details
- `docs/UI_SKILLS.md` - Frontend development constraints
