# Task 5: Orchestration Bridge - Implementation Summary

**Branch:** `feat/orchestration-bridge`  
**Status:** ✅ Complete  
**Date:** 2026-01-21

---

## What Was Built

### 1. Context Store (`src/core/context-store.ts`)

In-memory context storage with ID-based retrieval and automatic expiration.

**Key Features:**
- Context creation with automatic ID generation (`ctx_<timestamp>_<random>`)
- TTL-based expiration (configurable per-context or global default)
- Access tracking (count + last accessed timestamp)
- Cleanup of expired contexts

**API:**
```typescript
const store = new ContextStore();
const ctx = store.create({ type: "job", content: {...}, ttlHours: 24 });
const retrieved = store.get(ctx.id);
store.cleanupExpired();
```

### 2. Orchestrator (`src/core/orchestrator.ts`)

Task dispatcher with routing, retry logic, model fallback, and Eve fallback.

**Key Features:**
- **Routing Integration**: Uses `RoutingEngine` to determine target agent
- **Retry with Exponential Backoff**: Configurable max retries, delay, and backoff multiplier
- **Model Fallback Chain**: Primary → fallback model → Eve
- **Error Classification**: Retryable vs non-retryable errors
- **Context Passing**: Load contexts by ID and pass to agents
- **Parallel Execution**: Dispatches multiple tasks concurrently via `Promise.all`
- **Dependency Injection**: Testable with custom executor, config, registry

**Operating Modes:**
- `direct`: Eve handles all tasks without delegation
- `orchestrator`: Route tasks to agents, fallback to Eve on failure

**API:**
```typescript
const orchestrator = new EveOrchestrator();
orchestrator.init();

const response = await orchestrator.handle({
  id: "req_001",
  taskTags: ["jobs:analyze"],
  payload: { jobId: 1 },
  contextIds: ["ctx_123"],
});
```

### 3. Default Agent Executor (`src/core/orchestrator.ts`)

Executes agent tasks by creating pi-agent instances on demand.

**Behavior:**
- Caches agents by `agentId:provider:model` key
- Builds prompts from task payload + contexts
- Uses pi-agent's streaming API to collect full responses

---

## Retry & Fallback Flow

```
User Request → Route to Agent
                    ↓
            Try Primary Model
                    ↓
         ┌──────────┴──────────┐
         │                     │
     Success              Error (retryable?)
         │                     │
         │              ┌──────┴──────┐
         │              │             │
         │             Yes            No
         │              │             │
         │        Retry (max N)    Try Fallback Model
         │              │             │
         │         ┌────┴────┐        │
         │         │         │        │
         │      Success    Fail       │
         │         │         │        │
         └─────────┴─────────┴────────┘
                    ↓
            Delegate to Eve
                    ↓
         ┌──────────┴──────────┐
         │                     │
     Success              Final Failure
         │                     │
      Return              Return Error
```

**Error Types:**
- **Retryable**: `rate_limit`, `timeout`, `connection_error`, `overloaded`
- **Non-retryable**: `invalid_api_key`, `content_policy`, `context_length_exceeded`

---

## Test Coverage

### Test File: `test-orchestrator.ts`

**Scenarios Tested:**
1. ✅ Retry on rate limit (first attempt fails, second succeeds)
2. ✅ Model fallback on non-retryable error
3. ✅ Eve fallback when agent fails
4. ✅ Context passing (context ID → load → pass to agent)
5. ✅ Parallel task execution

**Test Output:**
```json
{
  "requestId": "req_test",
  "mode": "orchestrator",
  "results": [
    {
      "taskId": "task_retry",
      "routedAgentId": "analyst",
      "executedAgentId": "analyst",
      "output": { "agent": "analyst", "model": "smart", ... }
    },
    {
      "taskId": "task_fallback",
      "routedAgentId": "analyst",
      "executedAgentId": "eve",
      "output": { "agent": "eve", "model": "smart", ... }
    }
  ]
}
```

---

## Configuration Used

All settings pulled from `eve.json.defaults.retry`:

```json
{
  "defaults": {
    "retry": {
      "max_retries": 3,
      "retry_delay_ms": 1000,
      "backoff_multiplier": 2,
      "max_delay_ms": 30000
    },
    "context": {
      "default_expiry_hours": 168
    }
  }
}
```

Agent-specific overrides read from `agent.json.error_handling`.

---

## Integration Points (Not Implemented Yet)

The orchestrator is ready but **not wired into runtime**. Next steps:

1. **Option A: Replace `AgentManager` in `src/services/llm.ts`**
   - Replace `AgentManager.prompt()` calls with `EveOrchestrator.handle()`
   - Map existing task routing logic to orchestrator tasks

2. **Option B: Add to `bootstrap.ts`**
   - Initialize orchestrator alongside agent in `bootstrap()`
   - Export as part of `EveCore` interface

3. **Option C: Create new HTTP endpoints**
   - Add `/api/orchestrate` endpoint in `src/server.ts`
   - Accept `OrchestratorRequest` JSON payload

---

## Files Changed

```
A  src/core/context-store.ts           (106 lines)
A  src/core/orchestrator.ts            (532 lines)
A  test-orchestrator.ts                (178 lines)
A  test-orchestrator-integration.ts    (103 lines)
```

---

## Build Verification

```bash
npm run build                # ✅ Success
bun dist/index.js --help     # ✅ Works
bun run test-orchestrator.ts # ✅ All tests pass
```

---

## Exit Criteria Status

**P1 Goals:**

| Criterion | Status |
|-----------|--------|
| Eve can dispatch tasks to agents via RoutingEngine | ✅ Complete |
| Retry logic with exponential backoff works | ✅ Complete |
| Fallback chain executes (retry → model → Eve) | ✅ Complete |
| Basic context passing works (store and retrieve by ID) | ✅ Complete |

**Additional Features Implemented:**

- ✅ Parallel task dispatch via `Promise.all`
- ✅ Error classification (retryable vs non-retryable)
- ✅ Configurable retry policies (per-agent + global defaults)
- ✅ Dependency injection for testing
- ✅ Output context creation (tasks can store results as contexts)

---

## Next Steps

1. **Wire into runtime** (choose integration point above)
2. **Add real agent execution** (replace `FakeExecutor` with pi-agent calls)
3. **Test with actual jobs tasks** (migrate existing Jobs capability)
4. **Add observability** (logging, metrics for task execution)
5. **Implement aggregation strategies** (merge, rank, vote - currently returns last output)

---

## Known Limitations

1. **No vector search**: Context retrieval is ID-only (semantic search deferred to P3)
2. **No compression**: Contexts stored as raw JSON (compression deferred)
3. **In-memory only**: Contexts lost on restart (SQLite persistence deferred)
4. **No decomposition**: Single tasks only (multi-stage decomposition deferred)
5. **Simple aggregation**: Returns last output or merged dict (rank/vote deferred)

These are intentional P1 scope cuts per architecture spec.

---

## Commit Message

```
feat(core): add orchestration bridge with retry and fallback

- Add ContextStore for ID-based context passing
- Add EveOrchestrator for task routing and dispatch
- Implement retry with exponential backoff
- Implement model fallback chain (primary → fallback → Eve)
- Add error classification (retryable vs non-retryable)
- Support parallel task execution via Promise.all
- Add test harness with retry/fallback scenarios

Exit criteria met:
- Tasks route to agents via RoutingEngine
- Retry logic works with configurable policies
- Fallback chain executes correctly
- Context passing works (store by ID, load, pass to agents)

Refs: docs/ARCHITECTURE_REDESIGN.md Section 5, 9
```
