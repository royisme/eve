import { drizzle } from "drizzle-orm/bun-sqlite";
import { Database } from "bun:sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import * as schema from "./schema";
import { getDbPath } from "../core/data-dir";

const dbPath = getDbPath();
console.log(`📊 Using database: ${dbPath}`);

const sqlite = new Database(dbPath);
const db = drizzle(sqlite, { schema });

const currentDir = dirname(fileURLToPath(import.meta.url));
const isDist = currentDir.split("/").includes("dist");
const migrationsFolder = isDist ? join(currentDir, "..", "drizzle") : join(currentDir, "..", "..", "drizzle");

migrate(db, { migrationsFolder });

export { db };
