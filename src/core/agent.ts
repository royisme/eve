import { Agent } from "@mariozechner/pi-agent-core";
import { getModel } from "@mariozechner/pi-ai";
import { getCapabilityTools, getCapabilities } from "../capabilities";
import type { CapabilityContext } from "../capabilities/types";
import { ConfigManager } from "./config";
import { ConfigReader } from "./config-reader";
import { db } from "../db";
import { getContextStore } from "./context";
import { getMemoryManager } from "./memory";

export interface EveAgentConfig {
  systemPrompt?: string;
  provider?: string;
  model?: string;
}

const DEFAULT_SYSTEM_PROMPT = `You are Eve, a personal AI assistant like Jarvis from Iron Man.
You help users with various tasks by using the tools available to you.
Be proactive, professional, and efficient. Always aim to complete tasks fully.`;

const DEFAULT_PROVIDER = "anthropic";
const DEFAULT_MODEL = "claude-3-5-sonnet-20241022";

const ENV_KEYS: Record<string, string[]> = {
  anthropic: ["ANTHROPIC_API_KEY", "ANTHROPIC_OAUTH_TOKEN"],
  google: ["GOOGLE_API_KEY"],
  openai: ["OPENAI_API_KEY"],
};

function getApiKeyFromRegistry(provider: string): string | undefined {
  try {
    const registry = ConfigReader.getProviderRegistry();
    if (registry.hasProvider(provider)) {
      const config = registry.getProvider(provider);
      if (config.api_key) return config.api_key;
    }
  } catch {
    // Fallthrough to env vars
  }

  for (const envKey of ENV_KEYS[provider.toLowerCase()] || []) {
    if (process.env[envKey]) return process.env[envKey];
  }

  return undefined;
}

async function getApiKey(provider: string): Promise<string | undefined> {
  const fromRegistry = getApiKeyFromRegistry(provider);
  if (fromRegistry) return fromRegistry;

  const configPath = `services.${provider.toLowerCase()}.api_key`;
  const apiKey = await ConfigManager.get<string>(configPath);
  if (apiKey) return apiKey;

  return undefined;
}

export async function initializeCapabilities(): Promise<void> {
  const ctx: CapabilityContext = {
    db,
    config: ConfigManager,
    memory: getMemoryManager(),
    context: getContextStore(),
  };

  for (const capability of await getCapabilities()) {
    if (capability.init) {
      await capability.init(ctx);
      console.log(`[Eve] Capability initialized: ${capability.name}`);
    }
  }

  // Cleanup tasks
  try {
    const count = await ctx.context.deleteExpired();
    if (count > 0) console.log(`[Eve] Cleaned up ${count} expired contexts`);
  } catch (e) {
    console.error("[Eve] Failed to clean up contexts", e);
  }
  
  // Clean up old daily logs (default 7 days)
  const memory = getMemoryManager();
  // Ideally we'd iterate over configured agents, but for now we rely on agents creating their own dir
  // or we clean up known agent IDs from config.
  // For MVP, we skip global agent iteration or rely on capability init doing it if needed.
  // A simple approach: The MemoryManager cleanupOldDaily is agent-specific.
  // If we don't know the agent IDs, we can't clean them all.
  // But wait, FileSystemMemoryManager.getAgentDir creates dirs on demand.
  // Let's skip auto-cleanup of all agents for now as it's low priority for MVP.
}

export async function createEveAgent(config: EveAgentConfig = {}): Promise<Agent> {
  const systemPrompt = config.systemPrompt || DEFAULT_SYSTEM_PROMPT;
  const provider = config.provider || DEFAULT_PROVIDER;
  const modelId = config.model || DEFAULT_MODEL;

  const tools = await getCapabilityTools();
  const capabilities = await getCapabilities();

  console.log(`[Eve] Creating agent with ${tools.length} tools from ${capabilities.length} capabilities`);

  const agent = new Agent({
    getApiKey,
    initialState: {
      systemPrompt,
      model: getModel(provider as Parameters<typeof getModel>[0], modelId as Parameters<typeof getModel>[1]),
      tools,
    },
  });

  return agent;
}

export async function disposeCapabilities(): Promise<void> {
  for (const capability of await getCapabilities()) {
    if (capability.dispose) {
      await capability.dispose();
      console.log(`[Eve] Capability disposed: ${capability.name}`);
    }
  }
}
