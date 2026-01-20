import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { getDbPath } from "../src/core/data-dir";
import * as schema from "../src/db/schema";

const sqlite = new Database(getDbPath());
const db = drizzle(sqlite, { schema });

const currentDir = dirname(fileURLToPath(import.meta.url));
const migrationsFolder = join(currentDir, "..", "drizzle");

migrate(db, { migrationsFolder });

console.log("✅ All migrations applied successfully!");
sqlite.close();