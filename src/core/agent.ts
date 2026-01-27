import { Agent } from "@mariozechner/pi-agent-core";
import { getModel } from "@mariozechner/pi-ai";
import type { Model, Api } from "@mariozechner/pi-ai";
import { getCapabilityTools, getCapabilities } from "../capabilities";
import type { CapabilityContext } from "../capabilities/types";
import { ConfigManager } from "./config";
import { ConfigReader } from "./config-reader";
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
  let fromAuth = authStore.getApiKey(provider.toLowerCase());
  
  // If not found, try common alias mappings for custom providers
  if (!fromAuth) {
    const config = ConfigReader.get();
    // Find if any configured provider mapping to this API protocol has a key
    for (const [pName, pConfig] of Object.entries(config.providers)) {
      const mappedProvider = (pName === "openai-compatible" ? "openai" : pName === "anthropic-compatible" ? "anthropic" : pName);
      if (mappedProvider === provider) {
        fromAuth = authStore.getApiKey(pName);
        if (fromAuth) break;
      }
    }
  }
  
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

function resolveModel(provider: string, modelId: string): Model<any> {
  const apiProvider = (provider === "openai-compatible" ? "openai" : provider === "anthropic-compatible" ? "anthropic" : provider) as any;
  
  let baseUrl: string | undefined;
  try {
    const registry = ConfigReader.getProviderRegistry();
    const providerConfig = registry.getProvider(provider);
    if (providerConfig?.base_url) {
      baseUrl = providerConfig.base_url;
    }
  } catch (e) {}

  if (baseUrl) {
    const apiType: Api = apiProvider === "anthropic" ? "anthropic-messages" : "openai-completions";
    return {
      id: modelId,
      name: modelId,
      api: apiType,
      provider: apiProvider,
      baseUrl: baseUrl,
      reasoning: false,
      input: ["text"],
      contextWindow: 128000,
      maxTokens: 4096,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    } as Model<any>;
  }

  return getModel(apiProvider, modelId as any);
}

export async function createEveAgent(config: EveAgentConfig = {}): Promise<Agent> {
  const eveConfig = ConfigReader.get();
  
  const systemPrompt = config.systemPrompt || eveConfig.eve.system_prompt || DEFAULT_SYSTEM_PROMPT;
  
  // Resolve default provider/model from eve.json if not provided in config
  let provider = config.provider;
  let modelId = config.model;

  if (!provider || !modelId) {
    const defaultAlias = eveConfig.eve.model || "smart";
    try {
      const resolver = ConfigReader.getModelResolver();
      const resolved = resolver.resolve(defaultAlias);
      provider = provider || resolved.provider;
      modelId = modelId || resolved.modelId;
    } catch (e) {
      console.warn(`[Eve] Failed to resolve default model alias "${defaultAlias}", falling back to defaults:`, e instanceof Error ? e.message : String(e));
      provider = provider || DEFAULT_PROVIDER;
      modelId = modelId || DEFAULT_MODEL;
    }
  }

  const tools = await getCapabilityTools();
  const capabilities = await getCapabilities();

  console.log(`[Eve] Creating agent with ${tools.length} tools from ${capabilities.length} capabilities`);

  const agent = new Agent({
    getApiKey,
    initialState: {
      systemPrompt,
      model: resolveModel(provider!, modelId!),
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
