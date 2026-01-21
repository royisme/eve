import { writeFileSync, mkdirSync, readFileSync, existsSync, rmSync, readdirSync, statSync } from "fs";
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
    mkdirSync(agentDir, { recursive: true });
    mkdirSync(join(agentDir, "daily"), { recursive: true });
    return agentDir;
  }

  private getLongTermPath(agentId: string): string {
    return join(this.getAgentDir(agentId), "long-term.md");
  }

  private getDailyPath(agentId: string, date: string): string {
    return join(this.getAgentDir(agentId), "daily", `${date}.json`);
  }

  async appendToLongTerm(agentId: string, content: string): Promise<void> {
    const path = this.getLongTermPath(agentId);
    const timestamp = new Date().toISOString();
    const entry = `\n\n## Update ${timestamp}\n${content}`;

    if (!existsSync(path)) {
      const header = `# Agent: ${agentId}\n\n## Preferences\n\n## Learnings\n\n## Patterns\n`;
      writeFileSync(path, header + entry);
    } else {
      writeFileSync(path, entry, { flag: "a" });
    }
  }

  async summarizeLongTerm(agentId: string): Promise<void> {
    console.warn(`[MemoryManager] summarizeLongTerm not implemented for agent: ${agentId}`);
  }

  async recordToDaily(agentId: string, entry: DailySessionEntry): Promise<void> {
    const today = new Date().toISOString().split("T")[0];
    const path = this.getDailyPath(agentId, today);

    let memory: DailyMemory = { date: today, sessions: [] };

    if (existsSync(path)) {
      try {
        const content = readFileSync(path, "utf-8");
        const parsed = JSON.parse(content);
        if (parsed.date === today) {
            memory = parsed;
        }
      } catch (e) {
        // If corrupted, overwrite
      }
    }

    memory.sessions.push(entry);
    writeFileSync(path, JSON.stringify(memory, null, 2));
  }

  async cleanupOldDaily(agentId: string, retentionDays: number): Promise<void> {
    const dailyDir = join(this.getAgentDir(agentId), "daily");
    if (!existsSync(dailyDir)) return;

    const files = readdirSync(dailyDir);
    const now = Date.now();
    let count = 0;

    for (const file of files) {
        const filePath = join(dailyDir, file);
        const parsed = parse(file);
        
        if (!parsed.name.match(/^\d{4}-\d{2}-\d{2}$/)) continue;

        const fileDate = new Date(parsed.name).getTime();
        const diffDays = (now - fileDate) / (1000 * 60 * 60 * 24);

        if (diffDays > retentionDays) {
            rmSync(filePath);
            count++;
        }
    }
    console.log(`[MemoryManager] Cleaned up ${count} old daily files for agent ${agentId}`);
  }

  async promoteToLongTerm(agentId: string, insight: string): Promise<void> {
    await this.appendToLongTerm(agentId, `Promoted Insight: ${insight}`);
  }
}
