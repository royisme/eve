import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { FileSystemMemoryManager, DailySessionEntry } from "../../src/core/memory/MemoryManager";
import { existsSync, readFileSync, unlinkSync, mkdirSync } from "fs";
import { join } from "path";
import { getDataDir } from "../../src/core/data-dir";

describe("MemoryManager", () => {
  let manager: FileSystemMemoryManager;
  const testAgentId = "test_agent_memory";

  beforeAll(() => {
    manager = new FileSystemMemoryManager();
  });

  afterAll(() => {
    // Cleanup test agent memory
    const baseDir = getDataDir();
    const agentDir = join(baseDir, "agents", testAgentId, "memory");
    try {
      // Simple cleanup of the whole agent memory dir
      // In a real test we'd use a recursive delete
      const dailyFile = join(agentDir, "daily", new Date().toISOString().split("T")[0] + ".json");
      if (existsSync(dailyFile)) unlinkSync(dailyFile);
    } catch (e) {
      // Ignore cleanup errors
    }
  });

  it("should append to long-term memory", async () => {
    await manager.appendToLongTerm(testAgentId, "Test insight 1");
    
    const baseDir = getDataDir();
    const longTermPath = join(baseDir, "agents", testAgentId, "memory", "long-term.md");
    
    expect(existsSync(longTermPath)).toBe(true);
    
    const content = readFileSync(longTermPath, "utf-8");
    expect(content).toContain("Test insight 1");
  });

  it("should record to daily memory", async () => {
    const session: DailySessionEntry = {
      id: "sess_123",
      startedAt: new Date().toISOString(),
      tasks: [
        {
          type: "test_task",
          status: "success",
          durationMs: 100
        }
      ]
    };

    await manager.recordToDaily(testAgentId, session);

    const today = new Date().toISOString().split("T")[0];
    const baseDir = getDataDir();
    const dailyPath = join(baseDir, "agents", testAgentId, "memory", "daily", `${today}.json`);
    
    expect(existsSync(dailyPath)).toBe(true);
    
    const content = JSON.parse(readFileSync(dailyPath, "utf-8"));
    expect(content.sessions).toBeInstanceOf(Array);
    expect(content.sessions.length).toBeGreaterThan(0);
    expect(content.sessions[0].id).toBe("sess_123");
  });

  it("should promote to long-term memory", async () => {
    await manager.promoteToLongTerm(testAgentId, "Very important insight");
    
    const baseDir = getDataDir();
    const longTermPath = join(baseDir, "agents", testAgentId, "memory", "long-term.md");
    const content = readFileSync(longTermPath, "utf-8");
    
    expect(content).toContain("Very important insight");
    expect(content).toContain("Promoted Insight");
  });
});
