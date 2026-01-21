# Phase 3: State Layer (Context & Memory)

## Status
- [x] Discovery
- [x] Codebase Exploration
- [x] Documentation (Contracts)
- [x] Task Breakdown
- [ ] Readiness Gate
- [ ] Implementation
- [ ] Review

## Decisions
1. **Context DB Isolation**: Using a dedicated `context.db` instead of adding to main `eve.db`. This keeps the core lightweight and modular.
2. **Filesystem Memory**: Using direct file manipulation for agent memory (`.md`, `.json`) instead of a database. This allows for easy human inspection and editing.
3. **Lazy Initialization**: Context/Memory services will be instantiated on demand or at agent startup, rather than being global static singletons (though `index.ts` may export a singleton instance).

## Readiness Gate
- **Confidence**: High. The plan is detailed and follows standard patterns.
- **Risks**:
  - Concurrency issues with file writing (daily logs). *Mitigation*: Simple append or synchronous write for now (low volume).
  - Schema migration for `context.db` if we change it later. *Mitigation*: It's a cache/buffer, safe to clear if schema changes drastically.

## Verification
- Run `bun test tests/core/context.test.ts`
- Run `bun test tests/core/memory.test.ts`
