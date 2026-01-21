import { drizzle } from "drizzle-orm/bun-sqlite";
import { Database } from "bun:sqlite";
import { mkdirSync } from "fs";
import { dirname, join } from "path";
import { contexts } from "./schema";
import { getDataDir } from "../data-dir";

// Helper to ensure we get a valid DB path
function getContextDbPath() {
    const baseDir = getDataDir();
    const ctxDir = join(baseDir, "context");
    
    // Ensure directory exists
    mkdirSync(ctxDir, { recursive: true });
    
    return join(ctxDir, "context.db");
}

let _db: ReturnType<typeof drizzle<typeof import("./schema")>> | null = null;

export function getContextDb() {
    if (_db) return _db;

    const dbPath = getContextDbPath();
    // console.log(`🧠 Context DB: ${dbPath}`);
    
    const sqlite = new Database(dbPath);
    _db = drizzle(sqlite, { schema: { contexts } });
    
    // Auto-create table if not exists (simple migration for now)
    // In production we might want a robust migration system like the main DB
    sqlite.run(`
        CREATE TABLE IF NOT EXISTS contexts (
            id TEXT PRIMARY KEY,
            type TEXT NOT NULL,
            agent_id TEXT,
            content TEXT NOT NULL,
            content_hash TEXT,
            embedding TEXT,
            parent_ids TEXT,
            metadata TEXT,
            created_at TEXT NOT NULL,
            expires_at TEXT,
            accessed_at TEXT,
            access_count INTEGER DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS idx_context_type ON contexts(type);
        CREATE INDEX IF NOT EXISTS idx_context_agent ON contexts(agent_id);
        CREATE INDEX IF NOT EXISTS idx_context_expires ON contexts(expires_at);
    `);

    return _db;
}
