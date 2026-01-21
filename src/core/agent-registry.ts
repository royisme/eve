import { readdirSync, readFileSync, existsSync } from "fs";
import { join } from "path";
import { Value } from "@sinclair/typebox/value";
import { AgentConfigSchema, type AgentConfig } from "./agent-schema";
import { AgentRoom } from "./agent-room";
import { getDataDir } from "./data-dir";
import { ConfigReader } from "./config-reader";

const AGENTS_DIR = "agents";

/**
 * AgentRegistry
 * 
 * Discovers and manages agent configurations from filesystem.
 * Scans ~/.config/eve/agents/*\/agent.json and loads enabled agents.
 */
export class AgentRegistry {
  private agents: Map<string, AgentRoom> = new Map();
  private agentsDir: string;

  constructor() {
    this.agentsDir = join(getDataDir(), AGENTS_DIR);
  }

  discoverAndLoad(): void {
    const eveConfig = ConfigReader.get();
    const enabledAgents = eveConfig.agents.enabled;
    const autoDiscover = eveConfig.agents.auto_discover;

    if (!existsSync(this.agentsDir)) {
      console.log(`📁 Agents directory not found: ${this.agentsDir}`);
      console.log(`   Create agents at: ${this.agentsDir}/<agent-id>/agent.json`);
      return;
    }

    const discoveredAgents = this.scanAgentDirectories();

    if (discoveredAgents.length === 0) {
      console.log(`ℹ️ No agents discovered in ${this.agentsDir}`);
      return;
    }

    console.log(`🔍 Discovered ${discoveredAgents.length} agent(s): ${discoveredAgents.join(", ")}`);

    const agentsToLoad = autoDiscover
      ? discoveredAgents
      : discoveredAgents.filter((id) => enabledAgents.includes(id));

    for (const agentId of agentsToLoad) {
      this.loadAgent(agentId);
    }

    console.log(`✅ Loaded ${this.agents.size} agent(s)`);
  }

  private scanAgentDirectories(): string[] {
    const entries = readdirSync(this.agentsDir, { withFileTypes: true });
    const agentIds: string[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      if (entry.name.includes("/") || entry.name.includes("\\")) {
        console.warn(`⚠️ Skipping agent with hierarchical name: ${entry.name}`);
        continue;
      }

      const agentConfigPath = join(this.agentsDir, entry.name, "agent.json");
      if (existsSync(agentConfigPath)) {
        agentIds.push(entry.name);
      }
    }

    return agentIds;
  }

  private loadAgent(agentId: string): void {
    const configPath = join(this.agentsDir, agentId, "agent.json");

    try {
      const content = readFileSync(configPath, "utf-8");
      const rawConfig = JSON.parse(content) as unknown;

      const errors = [...Value.Errors(AgentConfigSchema, rawConfig)];
      if (errors.length > 0) {
        console.error(`❌ Invalid agent config: ${configPath}`);
        for (const error of errors) {
          console.error(`   - ${error.path}: ${error.message}`);
        }
        return;
      }

      const config = rawConfig as AgentConfig;

      if (config.id !== agentId) {
        console.warn(
          `⚠️ Agent id mismatch: directory "${agentId}" vs config id "${config.id}". Using directory name.`
        );
        (config as AgentConfig).id = agentId;
      }

      const agentRoom = new AgentRoom(config, configPath);
      this.agents.set(agentId, agentRoom);
      console.log(`   ✅ Loaded agent: ${agentId} (${agentRoom.name})`);
    } catch (e) {
      console.error(`❌ Failed to load agent ${agentId}:`, e instanceof Error ? e.message : String(e));
    }
  }

  getAgent(id: string): AgentRoom | undefined {
    return this.agents.get(id);
  }

  hasAgent(id: string): boolean {
    return this.agents.has(id);
  }

  listAgents(): string[] {
    return Array.from(this.agents.keys());
  }

  getAllAgents(): AgentRoom[] {
    return Array.from(this.agents.values());
  }

  findAgentByResponsibility(taskTag: string): AgentRoom | undefined {
    for (const agent of this.agents.values()) {
      if (agent.hasResponsibility(taskTag)) {
        return agent;
      }
    }
    return undefined;
  }

  reload(): void {
    console.log("🔄 Reloading agents...");
    this.agents.clear();
    this.discoverAndLoad();
  }
}
