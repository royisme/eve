# Tasks: Phase 3 (State Layer)

## Overview
Implement the Context and Memory systems as defined in `contracts.md`.

## Task List

### 1. Context System Implementation
- **Goal**: Create the `context.db` and `ContextStore` service.
- **Files**:
  - `src/core/context/schema.ts`
  - `src/core/context/db.ts`
  - `src/core/context/types.ts`
  - `src/core/context/ContextStore.ts`
  - `src/core/context/index.ts`
- **Acceptance Criteria**:
  - `contexts` table schema matches contract.
  - `db.ts` creates/connects to `~/.config/eve/context/context.db`.
  - `ContextStore` implements all methods (save, get, getMany, deleteExpired).
  - Compression logic (JSON + Gzip + Base64) works correctly.

### 2. Memory System Implementation
- **Goal**: Create the `MemoryManager` service backed by filesystem.
- **Files**:
  - `src/core/memory/types.ts`
  - `src/core/memory/MemoryManager.ts`
  - `src/core/memory/index.ts`
- **Acceptance Criteria**:
  - `MemoryManager` implements all methods.
  - `appendToLongTerm` appends text to `.md` file with timestamp.
  - `recordToDaily` manages daily JSON files correctly (creates new file for new day).
  - `cleanupOldDaily` removes old JSON files.

### 3. Capability Context Integration
- **Goal**: Inject new services into the capability system.
- **Files**:
  - `src/capabilities/types.ts`
  - `src/core/agent.ts`
- **Acceptance Criteria**:
  - `CapabilityContext` interface includes `memory` and `context`.
  - `initializeCapabilities` in `agent.ts` instantiates the services and passes them.
  - Startup cleanup (context expiration, old logs) runs without errors.
  - Existing tests pass (regression check).

### 4. Verification Tests
- **Goal**: Verify the new systems work as expected.
- **Files**:
  - `tests/core/context.test.ts`
  - `tests/core/memory.test.ts`
- **Acceptance Criteria**:
  - Unit tests for ContextStore (save/read roundtrip, expiration).
  - Unit tests for MemoryManager (file creation, appending, cleanup).
