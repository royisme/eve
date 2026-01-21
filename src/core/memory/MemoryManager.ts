import { writeFile, mkdir, readFile, rm, readdir } from "fs/promises";
import { existsSync } from "fs";
import { join, parse } from "path";
import { getDataDir } from "../data-dir";

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
  date: string;
  sessions: DailySessionEntry[];
  summary?: string;
}

export interface MemoryManager {
  appendToLongTerm(agentId: string, content: string): Promise<void>;
  summarizeLongTerm(agentId: string): Promise<void>;
  recordToDaily(agentId: string, entry: DailySessionEntry): Promise<void>;
  cleanupOldDaily(agentId: string, retentionDays: number): Promise<void>;
  promoteToLongTerm(agentId: string, insight: string): Promise<void>;
}

export class FileSystemMemoryManager implements MemoryManager {
  private getAgentDir(agentId: string): string {
    const baseDir = getDataDir();
    const agentDir = join(baseDir, "agents", agentId, "memory");
    return agentDir;
  }

  private async ensureDirs(agentId: string): Promise<void> {
    const agentDir = this.getAgentDir(agentId);
    await mkdir(agentDir, { recursive: true });
    await mkdir(join(agentDir, "daily"), { recursive: true });
  }

  async appendToLongTerm(agentId: string, content: string): Promise<void> {
    await this.ensureDirs(agentId);
    const filePath = join(this.getAgentDir(agentId), "long-term.md");
    const timestamp = new Date().toISOString();
    const entry = `\n\n## Update ${timestamp}\n${content}`;

    if (!existsSync(filePath)) {
      const header = `# Agent: ${agentId}\n\n## Preferences\n\n## Learnings\n\n## Patterns\n`;
      await writeFile(filePath, header + entry);
    } else {
      await writeFile(filePath, entry, { flag: "a" });
    }
  }

  async summarizeLongTerm(agentId: string): Promise<void> {
    console.warn(`[MemoryManager] summarizeLongTerm not implemented for agent: ${agentId}`);
  }

  async recordToDaily(agentId: string, entry: DailySessionEntry): Promise<void> {
    await this.ensureDirs(agentId);
    const today = new Date().toISOString().split("T")[0];
    const filePath = join(this.getAgentDir(agentId), "daily", `${today}.json`);

    let memory: DailyMemory = { date: today, sessions: [] };

    if (existsSync(filePath)) {
      try {
        const content = await readFile(filePath, "utf-8");
        const parsed = JSON.parse(content);
        if (parsed.date === today) {
            memory = parsed;
        }
      } catch (e) {
        console.error(`[MemoryManager] Failed to parse daily memory, overwriting: ${filePath}`, e);
      }
    }

    memory.sessions.push(entry);
    await writeFile(filePath, JSON.stringify(memory, null, 2));
  }

  async cleanupOldDaily(agentId: string, retentionDays: number): Promise<void> {
    const dailyDir = join(this.getAgentDir(agentId), "daily");
    if (!existsSync(dailyDir)) return;

    const files = await readdir(dailyDir);
    const now = Date.now();
    let count = 0;

    for (const file of files) {
        const filePath = join(dailyDir, file);
        const parsed = parse(file);
        
        if (!parsed.name.match(/^\d{4}-\d{2}-\d{2}$/)) continue;

        const fileDateStr = parsed.name;
        const fileDate = new Date(fileDateStr);
        if (isNaN(fileDate.getTime())) continue;
        
        const fileDateUTC = Date.UTC(fileDate.getFullYear(), fileDate.getMonth(), fileDate.getDate());
        const diffDays = (now - fileDateUTC) / (1000 * 60 * 60 * 24);

        if (diffDays > retentionDays) {
            try {
                await rm(filePath);
                count++;
            } catch (e) {
                console.error(`[MemoryManager] Failed to delete ${filePath}:`, e);
            }
        }
    }
    console.log(`[MemoryManager] Cleaned up ${count} old daily files for agent ${agentId}`);
  }

  async promoteToLongTerm(agentId: string, insight: string): Promise<void> {
    await this.appendToLongTerm(agentId, `Promoted Insight: ${insight}`);
  }
}
