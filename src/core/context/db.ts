import { drizzle } from "drizzle-orm/bun-sqlite";
import { Database } from "bun:sqlite";
import { mkdirSync } from "fs";
import { join } from "path";
import { contexts } from "./schema";
import { getDataDir } from "../data-dir";

/**
 * Compute and ensure the filesystem path for the context SQLite database.
 *
 * @returns The filesystem path to the "context.db" file inside the application's data/context directory
 */
function getContextDbPath() {
    const baseDir = getDataDir();
    const ctxDir = join(baseDir, "context");
    mkdirSync(ctxDir, { recursive: true });
    return join(ctxDir, "context.db");
}

let _db: ReturnType<typeof drizzle<typeof import("./schema")>> | null = null;
let _sqlite: Database | null = null;

/**
 * Get or initialize the singleton Drizzle ORM instance for the context schema.
 *
 * Ensures the on-disk SQLite database and the `contexts` table (with its indexes) exist before returning the instance.
 *
 * @returns The initialized Drizzle ORM instance bound to the context schema for interacting with the `contexts` table.
 */
export function getContextDb() {
    if (_db) return _db;

    const dbPath = getContextDbPath();
    const sqlite = new Database(dbPath);
    _sqlite = sqlite;
    _db = drizzle(sqlite, { schema: { contexts } });

    // Create table and indexes
    sqlite.run(`
        CREATE TABLE IF NOT EXISTS contexts (
            id TEXT PRIMARY KEY,
            type TEXT NOT NULL,
            agent_id TEXT,
            content TEXT NOT NULL,
            compression TEXT DEFAULT 'gzip',
            content_hash TEXT,
            embedding TEXT,
            parent_ids TEXT,
            metadata TEXT,
            created_at TEXT NOT NULL,
            expires_at TEXT,
            accessed_at TEXT,
            access_count INTEGER DEFAULT 0
        );
    `);
    sqlite.run(`CREATE INDEX IF NOT EXISTS idx_context_type ON contexts(type);`);
    sqlite.run(`CREATE INDEX IF NOT EXISTS idx_context_agent ON contexts(agent_id);`);
    sqlite.run(`CREATE INDEX IF NOT EXISTS idx_context_expires ON contexts(expires_at);`);

    return _db;
}

/**
 * Close the context SQLite connection and clear cached database instances.
 *
 * If a connection exists, closes the Bun SQLite database and resets the internal Drizzle and SQLite references to null.
 */
export function closeContextDb(): void {
    if (_sqlite) {
        _sqlite.close();
        _sqlite = null;
        _db = null;
    }
}