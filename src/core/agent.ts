import { Agent } from "@mariozechner/pi-agent-core";
import { getModel } from "@mariozechner/pi-ai";
import { getCapabilityTools, getCapabilities } from "../capabilities";
import type { CapabilityContext } from "../capabilities/types";
import { ConfigManager } from "./config";
import { AuthStore } from "./auth-store";
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

async function getApiKey(provider: string): Promise<string | undefined> {
  // 1. Try auth.json (primary source)
  const authStore = AuthStore.getInstance();
  const fromAuth = authStore.getApiKey(provider.toLowerCase());
  if (fromAuth) return fromAuth;

  // 2. Try environment variables (fallback)
  const envKeys: Record<string, string[]> = {
    anthropic: ["ANTHROPIC_API_KEY"],
    openai: ["OPENAI_API_KEY"],
    google: ["GOOGLE_API_KEY"],
  };

  for (const envKey of envKeys[provider.toLowerCase()] || []) {
    if (process.env[envKey]) return process.env[envKey];
  }

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

  // TODO: Daily memory cleanup requires iterating known agent IDs (deferred for MVP)
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
