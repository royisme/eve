# Eve Architecture Proposal: TUI-First Design

> **Status**: Draft - Pending Review
> **Author**: AI Assistant
> **Date**: 2025-01-19

## Executive Summary

This document proposes a fundamental architectural shift for Eve: from HTTP-first to **TUI-first** design. Eve should function as a local-first personal AI assistant where the Terminal UI is the primary interface, CLI commands serve as shortcuts, and HTTP API exists solely as a service layer for external clients like Wall-E.

---

## 1. Current State Analysis

### 1.1 Existing Entry Point (`src/index.ts`)

```typescript
// Current: HTTP server as main entry
import { Hono } from "hono";
const app = new Hono();
// ... HTTP routes
export default { port: 3033, fetch: app.fetch };
```

**Problems**:
1. HTTP server starts by default - wrong paradigm for local assistant
2. User has no direct interaction channel
3. TUI (`src/ui/app.tsx`) exists but is disconnected from main entry
4. CLI commands exist in `JobModule` but are never registered

### 1.2 Existing Assets

| Asset | Location | Status |
|-------|----------|--------|
| TUI Framework | `@mariozechner/pi-tui` | ✅ Installed |
| Jobs TUI | `src/ui/app.tsx` | ✅ Working |
| CLI Framework | `cac` | ✅ Installed |
| Jobs CLI | `src/modules/jobs/index.ts` | ⚠️ Defined but not connected |
| Email Capability | `src/capabilities/email/` | ✅ Complete |
| HTTP Server | `src/index.ts` | ✅ Working |

---

## 2. Proposed Architecture

### 2.1 Design Philosophy

```
┌─────────────────────────────────────────────────────────────┐
│                    Eve Personal AI Assistant                 │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    │
│   │   🎨 TUI    │    │   ⚡ CLI    │    │  🔌 HTTP   │    │
│   │  (Primary)  │    │ (Shortcut)  │    │ (Service)   │    │
│   └──────┬──────┘    └──────┬──────┘    └──────┬──────┘    │
│          │                  │                  │            │
│          └──────────────────┼──────────────────┘            │
│                             │                               │
│                    ┌────────▼────────┐                      │
│                    │  Capabilities   │                      │
│                    │  (Email, Jobs)  │                      │
│                    └────────┬────────┘                      │
│                             │                               │
│                    ┌────────▼────────┐                      │
│                    │   pi-agent      │                      │
│                    │   (LLM Core)    │                      │
│                    └─────────────────┘                      │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 Entry Point Hierarchy

| Priority | Interface | Trigger | Use Case |
|----------|-----------|---------|----------|
| 1 (Default) | **TUI** | `eve` | Daily interaction, exploration, chat |
| 2 | **CLI** | `eve <command>` | Automation, scripts, quick tasks |
| 3 | **HTTP** | `eve serve` | Wall-E integration, remote access |

### 2.3 Smart Entry Detection

```typescript
// src/index.ts - Proposed
const args = Bun.argv.slice(2);

if (args.length === 0) {
  // Default: Launch TUI dashboard
  await import("./ui/main");
} else if (args[0] === "serve") {
  // Special: Start HTTP API service
  await import("./server");
} else {
  // CLI: Execute command directly
  await import("./cli");
}
```

---

## 3. TUI Design

### 3.1 Main Dashboard Layout

```
┌─ Eve v0.3.0 ──────────────────────────────────────────────────┐
│  [💬 Chat]  [📧 Email]  [💼 Jobs]  [⚙️ Config]                 │
├───────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌─ Chat with Eve ─────────────────────────────────────────┐  │
│  │                                                         │  │
│  │  Eve: Hello! I'm your personal AI assistant.           │  │
│  │       What would you like to do today?                 │  │
│  │                                                         │  │
│  │  You: Check my job emails                              │  │
│  │                                                         │  │
│  │  Eve: 📧 Syncing emails from 2 accounts...             │  │
│  │       ✅ Found 8 new job opportunities!                │  │
│  │       Would you like me to analyze them?               │  │
│  │                                                         │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                               │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │ 💬 Type your message...                                 │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                               │
├───────────────────────────────────────────────────────────────┤
│  ← → Switch Tab | Enter: Send | q: Quit | ?: Help            │
└───────────────────────────────────────────────────────────────┘
```

### 3.2 Tab Structure

| Tab | Component | Purpose | Key Features |
|-----|-----------|---------|--------------|
| 💬 Chat | `tabs/chat.tsx` | Conversational AI interface | Natural language interaction with Eve |
| 📧 Email | `tabs/email.tsx` | Email management | Status, OAuth setup, sync control |
| 💼 Jobs | `tabs/jobs.tsx` | Job opportunity browser | List, filter, open, analyze |
| ⚙️ Config | `tabs/config.tsx` | System configuration | API keys, accounts, preferences |

### 3.3 Component Hierarchy

```
src/ui/
├── main.tsx              # Entry point, tab navigation
├── components/
│   ├── Header.tsx        # App header with status
│   ├── TabBar.tsx        # Tab navigation
│   └── StatusBar.tsx     # Bottom status/help
├── tabs/
│   ├── chat.tsx          # Chat interface
│   ├── email.tsx         # Email management
│   ├── jobs.tsx          # Job browser (from app.tsx)
│   └── config.tsx        # Configuration
└── modals/
    └── email-setup.tsx   # OAuth flow modal
```

---

## 4. CLI Design

### 4.1 Command Structure

```bash
eve                       # Launch TUI (default)
eve serve [--port]        # Start HTTP API service

# Email commands
eve email:status          # Check email configuration
eve email:setup <email>   # Setup Gmail account (launches TUI flow)
eve email:sync [--max N]  # Sync emails

# Jobs commands
eve jobs:list             # List job opportunities
eve jobs:status           # Show job hunting dashboard
eve jobs:enrich           # Enrich jobs with Firecrawl
eve jobs:analyze          # Analyze jobs with LLM
eve jobs:resume <path>    # Import resume

# System commands
eve status                # System status
eve config:get <key>      # Get config value
eve config:set <key> <v>  # Set config value
eve morning               # Daily briefing
```

### 4.2 CLI Implementation

```typescript
// src/cli/index.ts
import { cac } from "cac";
import { registerEmailCommands } from "./email";
import { registerJobsCommands } from "./jobs";
import { registerSystemCommands } from "./system";

const cli = cac("eve");

registerEmailCommands(cli);
registerJobsCommands(cli);
registerSystemCommands(cli);

cli.command("serve", "Start HTTP API server")
  .option("--port <port>", "Port number", { default: 3033 })
  .action(async (options) => {
    const { startServer } = await import("../server");
    await startServer(options.port);
  });

cli.help();
cli.version("0.3.0");
cli.parse();
```

---

## 5. HTTP API Design

### 5.1 Role Clarification

The HTTP API is **not** the main interface. It serves as:
1. **Wall-E Backend**: Chrome extension communicates via HTTP
2. **Remote Access**: Optional remote control capability
3. **Integration Point**: Third-party tools can connect

### 5.2 API Endpoints

```typescript
// src/server.ts
GET  /health              # Health check
GET  /agent/status        # List capabilities and tools
POST /chat                # Send prompt to Eve agent
GET  /jobs                # List job opportunities
POST /email/sync          # Trigger email sync
```

### 5.3 Server Implementation

```typescript
// src/server.ts
export async function startServer(port: number = 3033) {
  const app = new Hono();
  const agentManager = new AgentManager();
  await agentManager.init();

  app.use("/*", cors());
  
  // ... routes ...

  console.log(`🔌 Eve HTTP API listening on http://localhost:${port}`);
  console.log(`   This is a service endpoint for Wall-E and integrations.`);
  console.log(`   For direct interaction, use: eve (TUI) or eve <command> (CLI)`);
  
  Bun.serve({ port, fetch: app.fetch });
}
```

---

## 6. File Structure

### 6.1 Proposed Structure

```
eve/
├── src/
│   ├── index.ts              # 🎯 Smart entry (TUI/CLI/Serve detection)
│   │
│   ├── ui/                   # 🎨 TUI (Primary Interface)
│   │   ├── main.tsx          # Dashboard entry
│   │   ├── components/       # Shared UI components
│   │   │   ├── Header.tsx
│   │   │   ├── TabBar.tsx
│   │   │   └── StatusBar.tsx
│   │   ├── tabs/             # Tab content
│   │   │   ├── chat.tsx      # Chat with Eve
│   │   │   ├── email.tsx     # Email management
│   │   │   ├── jobs.tsx      # Job browser
│   │   │   └── config.tsx    # Settings
│   │   └── modals/           # Modal dialogs
│   │       └── email-setup.tsx
│   │
│   ├── cli/                  # ⚡ CLI (Shortcuts)
│   │   ├── index.ts          # CLI entry & registration
│   │   ├── email.ts          # Email commands
│   │   ├── jobs.ts           # Jobs commands
│   │   └── system.ts         # System commands
│   │
│   ├── server.ts             # 🔌 HTTP API (Service)
│   │
│   ├── capabilities/         # 🧩 Core Capabilities
│   │   ├── email/            # ✅ Complete
│   │   └── jobs/             # ✅ Complete
│   │
│   ├── core/                 # 💾 Core Infrastructure
│   │   ├── agent.ts
│   │   ├── config.ts
│   │   └── db.ts
│   │
│   ├── agents/               # 🤖 Agent Management
│   │   └── manager.ts
│   │
│   └── modules/              # 📦 Legacy (gradual migration)
│       └── jobs/
│
├── extension/wall-e/         # 🤖 Chrome Extension
└── docs/                     # 📚 Documentation
```

---

## 7. Implementation Plan

### Phase 1: Core TUI Framework (Priority: High)

| Task | File | Description |
|------|------|-------------|
| 1.1 | `src/ui/main.tsx` | Create main dashboard with tab navigation |
| 1.2 | `src/ui/tabs/chat.tsx` | Implement chat interface |
| 1.3 | `src/ui/tabs/email.tsx` | Implement email management tab |
| 1.4 | `src/ui/tabs/jobs.tsx` | Migrate from `src/ui/app.tsx` |

### Phase 2: CLI Integration (Priority: High)

| Task | File | Description |
|------|------|-------------|
| 2.1 | `src/cli/index.ts` | Create CLI entry point |
| 2.2 | `src/cli/email.ts` | Register email commands |
| 2.3 | `src/cli/jobs.ts` | Wrap existing JobModule commands |

### Phase 3: Entry Point Refactor (Priority: High)

| Task | File | Description |
|------|------|-------------|
| 3.1 | `src/index.ts` | Implement smart entry detection |
| 3.2 | `src/server.ts` | Extract HTTP server from index.ts |

### Phase 4: Polish (Priority: Medium)

| Task | File | Description |
|------|------|-------------|
| 4.1 | `src/ui/modals/email-setup.tsx` | OAuth flow modal |
| 4.2 | `src/ui/tabs/config.tsx` | Configuration management |
| 4.3 | `package.json` | Update scripts and bin entry |

---

## 8. Technical Considerations

### 8.1 pi-tui Constraints

Based on `src/ui/app.tsx`, pi-tui supports:
- ✅ `Box`, `Text` components
- ✅ `useInput` for keyboard handling
- ✅ `render()` for mounting
- ⚠️ Limited to terminal capabilities (no complex input fields)

### 8.2 State Management

For the TUI dashboard:
- Use React `useState`/`useEffect` for local state
- Consider a simple store for shared state across tabs
- Agent conversations persist in pi-agent's message history

### 8.3 Capability Integration

Tools should be callable from both TUI and CLI:

```typescript
// Unified tool invocation
async function invokeEmailSync(options) {
  const result = await emailSyncTool.execute(
    "ui-or-cli",
    { query: options.query, maxThreads: options.max },
    undefined,
    (update) => {
      // Progress callback - render in TUI or console.log in CLI
    }
  );
  return result;
}
```

---

## 9. Migration Path

### 9.1 Backward Compatibility

- Keep `eve serve` working for Wall-E
- Existing HTTP endpoints unchanged
- `JobModule.registerCommands()` pattern preserved

### 9.2 Deprecation Plan

| Component | Status | Action |
|-----------|--------|--------|
| `src/index.ts` (HTTP entry) | Deprecated | Move to `src/server.ts` |
| `src/ui/app.tsx` | Deprecated | Merge into `tabs/jobs.tsx` |
| `JobModule` CLI registration | Keep | Reuse in `cli/jobs.ts` |

---

## 10. Success Criteria

1. ✅ `eve` launches TUI dashboard
2. ✅ `eve email:sync` executes and returns
3. ✅ `eve serve` starts HTTP server
4. ✅ TUI Chat tab can converse with Eve agent
5. ✅ TUI Email tab shows status and can trigger sync
6. ✅ TUI Jobs tab displays opportunities
7. ✅ Wall-E continues to work via HTTP API

---

## 11. Open Questions

1. **Chat Input**: pi-tui text input capabilities? May need custom solution.
2. **Long Operations**: How to show progress for `email:sync` in TUI?
3. **Notifications**: Should TUI show real-time updates when new jobs arrive?
4. **Persistence**: Should TUI remember last active tab?

---

## Appendix A: Comparison with Alternatives

| Approach | Pros | Cons |
|----------|------|------|
| **TUI-First (Proposed)** | Natural for local assistant, discoverable, interactive | Terminal only, requires pi-tui mastery |
| HTTP-First (Current) | Easy for web clients | Unnatural for local use, no direct interaction |
| CLI-Only | Simple, scriptable | Poor discoverability, no persistent state |
| Desktop App (Electron) | Rich UI, cross-platform | Heavy, overkill for current scope |

---

## Appendix B: Reference Implementation

### Existing TUI Pattern (`src/ui/app.tsx`)

```typescript
import React, { useState, useEffect } from "react";
import { render, Box, Text, useInput } from "@mariozechner/pi-tui";
import { Database } from "bun:sqlite";

function App() {
  const [jobs, setJobs] = useState([]);
  const [selected, setSelected] = useState(0);

  useEffect(() => {
    const rows = db.query("SELECT * FROM jobs").all();
    setJobs(rows);
  }, []);

  useInput((input, key) => {
    if (input === "q") process.exit(0);
    if (key.upArrow) setSelected(prev => Math.max(0, prev - 1));
    if (key.downArrow) setSelected(prev => Math.min(jobs.length - 1, prev + 1));
  });

  return (
    <Box flexDirection="column" borderStyle="round">
      {jobs.map((job, i) => (
        <Text key={job.id} color={i === selected ? "green" : "white"}>
          {job.role} @ {job.company}
        </Text>
      ))}
    </Box>
  );
}

render(<App />);
```

This pattern should be extended for the multi-tab dashboard.

---

---

## 12. Oracle Review Feedback

> **Reviewed by**: Oracle (GPT-5.2)
> **Date**: 2025-01-19
> **Verdict**: ✅ Valid approach with actionable improvements needed

### 12.1 Summary

**Bottom Line**: TUI-first is a valid and pragmatic primary interface for a local-first assistant. The separation of TUI/CLI/HTTP as interface layers over shared capabilities is sound, but the proposal needs clearer lifecycle, async task handling, and input/UX constraints to avoid a fragile TUI experience.

### 12.2 Architecture Validity

| Aspect | Assessment |
|--------|------------|
| TUI-first approach | ✅ Valid for local-first, but ensure CLI remains first-class for scripts |
| TUI/CLI/HTTP separation | ✅ Appropriate if all three call the same core init + capability tools |
| Anti-patterns | ⚠️ Avoid embedding business logic in TUI or CLI - keep in `src/capabilities/**` |

### 12.3 Critical Technical Concerns

#### 1. pi-tui Input Limitations
- **Issue**: No built-in multi-line or cursor-aware text input
- **Solution**: Build a custom text buffer component to handle:
  - Character buffering
  - Backspace handling
  - Cursor movement
  - Submit on Enter

#### 2. Long-Running Operations
- **Issue**: Email sync, enrich, analyze could freeze the TUI
- **Solution**: Use a task runner with:
  - Progress callbacks
  - Status registry
  - Cancel support
  - Non-blocking rendering

#### 3. Tab State Management
- **Issue**: Cross-tab status (sync progress, errors) will drift
- **Solution**: Use a minimal shared store (context or event emitter) for:
  - Global status
  - Agent conversation reference
  - Keep tabs largely stateless

#### 4. TTY Detection
- **Issue**: TUI will break automation and piping
- **Solution**: Only launch TUI when `process.stdout.isTTY` is true

```typescript
// src/index.ts - Enhanced entry
const args = Bun.argv.slice(2);

if (args.length === 0) {
  if (process.stdout.isTTY) {
    await import("./ui/main");
  } else {
    console.log("Eve v0.3.0 - Use 'eve --help' for commands");
  }
} else if (args[0] === "serve") {
  await import("./server");
} else {
  await import("./cli");
}
```

#### 5. Lifecycle Consistency
- **Issue**: Capabilities initialization currently happens on HTTP server startup
- **Solution**: Create shared `src/core/bootstrap.ts` for consistent init

```typescript
// src/core/bootstrap.ts
import { initializeCapabilities, createEveAgent } from "./agent";

let agent = null;
let initialized = false;

export async function bootstrap() {
  if (initialized) return agent;
  
  await initializeCapabilities();
  agent = await createEveAgent();
  initialized = true;
  
  return agent;
}

export async function shutdown() {
  if (!initialized) return;
  await disposeCapabilities();
  initialized = false;
}
```

### 12.4 Design Gaps Identified

| Gap | Description | Recommendation |
|-----|-------------|----------------|
| Lifecycle & Shutdown | No mention of `disposeCapabilities` for TUI/CLI exit | Add cleanup on exit (SIGINT handler) |
| Credential Workflows | OAuth/email setup needs explicit UI/CLI fallback | Add error recovery steps |
| Notifications | No non-blocking notification for background tasks | Add status bar badges or log |
| Persistence | Only mentions last tab | Extend to last selection, last run task |

### 12.5 Implementation Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| pi-tui maturity | 🟡 Medium | Build custom input component early, validate chat UX |
| Concurrency/Freezing | 🔴 High | Use async task runner with yielding |
| Testing difficulty | 🟡 Medium | Rely on tool/service tests + CLI tests |
| Dependency coupling | 🟡 Medium | Ensure shared bootstrap path |

### 12.6 Testing Strategy (Minimal)

```
1. Unit tests: Capability services and tool execute paths
2. CLI integration tests: `eve <command>` behaviors
3. Manual TUI smoke tests: Render + input + task progress
4. HTTP smoke tests: `/health` and `/chat` endpoints
```

### 12.7 Escalation Triggers

1. **If TUI input becomes major bottleneck** (multi-line editing, rich history):
   - Consider lightweight web UI as primary UX instead
   
2. **If background tasks must run continuously**:
   - Introduce daemon/service process
   - TUI/CLI act as clients

### 12.8 Recommended Action Plan

| Priority | Task | Effort |
|----------|------|--------|
| 1 | Refactor entrypoint with smart launcher + TTY detection | Short (1-2h) |
| 2 | Create shared `bootstrap.ts` for lifecycle consistency | Short (1h) |
| 3 | Build minimal text input component for chat | Medium (4-8h) |
| 4 | Create async task runner with progress streaming | Medium (4-8h) |
| 5 | Scaffold TUI tabs with lightweight state | Medium (1d) |
| 6 | Define error handling conventions | Short (2h) |

### 12.9 Alternative Approach (If TUI Proves Limited)

If TUI proves too limited, keep HTTP-first but add a local TUI client that speaks to the HTTP API:

```
┌─────────┐     HTTP      ┌─────────┐
│   TUI   │ ────────────▶ │   Eve   │
│ (Client)│               │ (Server)│
└─────────┘               └─────────┘
```

**Pros**: Preserves integration flexibility, avoids TUI-state management for long tasks
**Cons**: Adds latency and client/server complexity

---

## 13. Revised Implementation Plan

Based on Oracle's feedback, here's the updated plan:

### Phase 0: Foundation (Priority: Critical)

| Task | File | Description |
|------|------|-------------|
| 0.1 | `src/core/bootstrap.ts` | Create shared initialization path |
| 0.2 | `src/core/task-runner.ts` | Create async task runner with progress |
| 0.3 | `src/index.ts` | Smart entry with TTY detection |

### Phase 1: TUI Core (Priority: High)

| Task | File | Description |
|------|------|-------------|
| 1.1 | `src/ui/components/TextInput.tsx` | Custom text input component |
| 1.2 | `src/ui/components/StatusBar.tsx` | Progress and notification display |
| 1.3 | `src/ui/main.tsx` | Main dashboard with tab navigation |

### Phase 2: TUI Tabs (Priority: High)

| Task | File | Description |
|------|------|-------------|
| 2.1 | `src/ui/tabs/email.tsx` | Email management (simple, no chat) |
| 2.2 | `src/ui/tabs/jobs.tsx` | Migrate from `app.tsx` |
| 2.3 | `src/ui/tabs/chat.tsx` | Chat with custom input |

### Phase 3: CLI & Polish (Priority: Medium)

| Task | File | Description |
|------|------|-------------|
| 3.1 | `src/cli/index.ts` | CLI entry point |
| 3.2 | `src/server.ts` | Extract HTTP server |
| 3.3 | Lifecycle handlers | SIGINT cleanup |

---

**End of Proposal**
