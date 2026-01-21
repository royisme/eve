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

/**
 * Initialize all registered capabilities and perform post-initialization cleanup.
 *
 * Constructs a CapabilityContext (db, ConfigManager, memory manager, and context store),
 * calls each capability's `init` function if present, and then attempts to delete expired
 * contexts from the context store, logging the number cleaned or any cleanup failure.
 */
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

  // TODO: Daily memory cleanup requires iterating known agent IDs (deferred for MVP)
}

/**
 * Create and configure an Eve Agent instance.
 *
 * Resolves the system prompt, provider, and model from `config` (falling back to defaults)
 * and constructs an Agent preloaded with capability tools.
 *
 * @param config - Optional configuration for the agent:
 *   - `systemPrompt`: override for the agent's system prompt
 *   - `provider`: provider identifier to select the model provider
 *   - `model`: model identifier for the selected provider
 * @returns The created Agent configured with the resolved system prompt, model, and capability tools
 */
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