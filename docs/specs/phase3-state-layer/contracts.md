# Contracts

## Overview
This document defines the contracts for the new State Layer (Memory System & Context Persistence) in Eve.
These systems provide the foundation for multi-step agent orchestration.

## 1. Context System (`src/core/context`)

The Context System manages the persistence of execution context chunks (JSON data) that are passed between agents or steps. It uses a dedicated SQLite database (`context.db`).

### Schema: `contexts` Table

```typescript
// src/core/context/schema.ts
import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";

export const contexts = sqliteTable("contexts", {
  id: text("id").primaryKey(),                 // Format: ctx_{uuid}
  type: text("type").notNull(),                // e.g., "extraction_result", "job_analysis"
  agentId: text("agent_id"),                   // ID of the agent that produced this context
  content: text("content").notNull(),          // Compressed JSON payload (base64 string)
  compression: text("compression").default("gzip"), // Compression method: "gzip" or "none"
  contentHash: text("content_hash"),           // SHA256 hash for deduplication
  embedding: text("embedding"),                // Optional: Serialized vector (base64)
  parentIds: text("parent_ids"),               // JSON array of parent context IDs
  metadata: text("metadata"),                  // Free-form JSON metadata
  createdAt: text("created_at").notNull(),     // ISO 8601
  expiresAt: text("expires_at"),               // ISO 8601 (nullable)
  accessedAt: text("accessed_at"),             // ISO 8601
  accessCount: integer("access_count").default(0),
}, (table) => [
  index("idx_context_type").on(table.type),
  index("idx_context_agent").on(table.agentId),
  index("idx_context_expires").on(table.expiresAt),
]);
```

### Interface: `ContextStore`

```typescript
// src/core/context/ContextStore.ts

export type ContextCompression = "none" | "gzip";

export interface ContextItem {
  id: string;
  type: string;
  agentId?: string;
  content: unknown;            // Decompressed content
  contentHash?: string;
  embedding?: string;
  parentIds?: string[];
  metadata?: Record<string, unknown>;
  createdAt: string;
  expiresAt?: string | null;
  accessedAt?: string | null;
  accessCount?: number;
}

export interface ContextStore {
  /**
   * Save a new context item.
   */
  save(input: {
    type: string;
    agentId?: string;
    content: unknown;
    parentIds?: string[];
    metadata?: Record<string, unknown>;
    expiresAt?: string | null;
    compression?: ContextCompression;
  }): Promise<ContextItem>;

  /**
   * Retrieve a context item by ID.
   * Updates accessedAt and accessCount.
   */
  get(id: string): Promise<ContextItem | null>;

  /**
   * Retrieve multiple context items.
   */
  getMany(ids: string[]): Promise<ContextItem[]>;

  /**
   * Update access stats without retrieving content.
   */
  touch(id: string): Promise<void>;

  /**
   * Delete expired context items.
   * @returns Number of items deleted.
   */
  deleteExpired(now?: string): Promise<number>;
}
```

## 2. Memory System (`src/core/memory`)

The Memory System manages agent-specific state using the filesystem.
It provides Long-term memory (Markdown) and Short-term memory (Daily JSON logs).

### File Structure

```text
~/.config/eve/agents/{agentId}/
  ├── memory/
  │   ├── long-term.md
  │   └── daily/
  │       ├── 2026-01-20.json
  │       └── ...
```

### Data Structures

```typescript
// src/core/memory/types.ts

export interface DailyTaskEntry {
  type: string;
  inputContextIds?: string[];
  outputContextId?: string;
  durationMs?: number;
  status: "success" | "error";
  error?: string;
}

export interface DailySessionEntry {
  id: string;
  startedAt: string;
  tasks: DailyTaskEntry[];
}

export interface DailyMemory {
  date: string; // YYYY-MM-DD
  sessions: DailySessionEntry[];
  summary?: string;
}
```

### Interface: `MemoryManager`

```typescript
// src/core/memory/MemoryManager.ts

export interface MemoryManager {
  /**
   * Append an insight to the agent's long-term memory file.
   * Adds an entry under "## Updates" with timestamp.
   */
  appendToLongTerm(agentId: string, content: string): Promise<void>;

  /**
   * Summarize long-term memory if it exceeds size limits.
   * (Placeholder implementation for now)
   */
  summarizeLongTerm(agentId: string): Promise<void>;

  /**
   * Record a session entry to the daily memory log.
   * Creates the file if it doesn't exist.
   */
  recordToDaily(agentId: string, entry: DailySessionEntry): Promise<void>;

  /**
   * Delete daily memory files older than retentionDays.
   */
  cleanupOldDaily(agentId: string, retentionDays: number): Promise<void>;

  /**
   * Promote a key insight from short-term to long-term memory.
   */
  promoteToLongTerm(agentId: string, insight: string): Promise<void>;
}
```

## 3. Integration Points

### `CapabilityContext` Extension

The `CapabilityContext` passed to `capability.init()` will be extended to include these new services.

```typescript
// src/capabilities/types.ts

import { MemoryManager } from "../core/memory/types";
import { ContextStore } from "../core/context/ContextStore";

export interface CapabilityContext {
  db: Database;             // Existing main DB
  config: typeof ConfigManager; // Existing config
  memory: MemoryManager;    // NEW
  context: ContextStore;    // NEW
}
```

### Initialization Flow (`src/core/agent.ts`)

1. `createEveAgent` / `initializeCapabilities` will initialize `ContextStore` (singleton) and `MemoryManager` (singleton).
2. These instances will be injected into `CapabilityContext`.
3. Background cleanup tasks (`deleteExpired`, `cleanupOldDaily`) will be triggered on startup.
