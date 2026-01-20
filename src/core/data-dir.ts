import { existsSync, mkdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";

const DEFAULT_DATA_DIR = join(homedir(), ".config", "eve");

export function getDataDir(): string {
  const customDir = process.env.EVE_DATA_DIR || process.argv.find(arg => arg.startsWith("--data-dir="))?.split("=")[1];
  
  const dataDir = customDir || DEFAULT_DATA_DIR;
  
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
    console.log(`📁 Created data directory: ${dataDir}`);
  }
  
  return dataDir;
}

export function getDbPath(): string {
  return join(getDataDir(), "eve.db");
}
