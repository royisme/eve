import { Agent } from "@mariozechner/pi-agent-core";
import { getModel } from "@mariozechner/pi-ai";
import type { Model, Api } from "@mariozechner/pi-ai";
import { jobsCapability } from "./index";
import { resumeCapability } from "../resume";
import { AuthStore } from "../../core/auth-store";
import { ConfigReader } from "../../core/config-reader";

export interface JobsAgentConfig {
  showThinking?: boolean;
  provider?: string;
  model?: string;
}

const JOBS_SYSTEM_PROMPT = `You are an expert job hunting assistant. Your role is to help users:

1. **Analyze Jobs**: Evaluate job postings against user's skills and experience
2. **Search & Filter**: Find relevant opportunities based on preferences
3. **Resume Tailoring**: Customize resumes for specific job applications
4. **Provide Insights**: Offer strategic advice on job fit, compensation, and career growth

You have access to the user's resume and job history. Be direct, actionable, and data-driven.

When analyzing a job:
- Start with a quick fit assessment (High/Medium/Low)
- Identify key matching skills and gaps
- Provide specific resume tailoring suggestions
- Note any red flags or highlights

Always be honest about poor fits - the user's time is valuable.`;

const DEFAULT_PROVIDER = "anthropic";
const DEFAULT_MODEL = "claude-sonnet-4-20250514";

async function getApiKey(provider: string): Promise<string | undefined> {
  const authStore = AuthStore.getInstance();
  let fromAuth = authStore.getApiKey(provider.toLowerCase());

  if (!fromAuth) {
    const config = ConfigReader.get();
    for (const [pName, pConfig] of Object.entries(config.providers)) {
      const mappedProvider = (pName === "openai-compatible" ? "openai" : pName === "anthropic-compatible" ? "anthropic" : pName);
      if (mappedProvider === provider) {
        fromAuth = authStore.getApiKey(pName);
        if (fromAuth) break;
      }
    }
  }

  if (fromAuth) return fromAuth;

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

export async function createJobsAgent(config: JobsAgentConfig = {}): Promise<Agent> {
  const eveConfig = ConfigReader.get();
  
  // Resolve provider and model
  let provider = config.provider;
  let modelId = config.model;

  if (!provider || !modelId) {
    const alias = eveConfig.eve.model || "smart";
    try {
      const resolved = ConfigReader.getModelResolver().resolve(alias);
      provider = provider || resolved.provider;
      modelId = modelId || resolved.modelId;
    } catch (e) {
      provider = provider || DEFAULT_PROVIDER;
      modelId = modelId || DEFAULT_MODEL;
    }
  }

  const resumeReadTools = resumeCapability.tools.filter((t) =>
    ["resume_get", "resume_list", "resume_set_default"].includes(t.name)
  );

  const tools = [...jobsCapability.tools, ...resumeReadTools];

  console.log(`[JobsAgent] Creating agent with ${tools.length} tools using ${provider}/${modelId}`);

  const agent = new Agent({
    getApiKey,
    initialState: {
      systemPrompt: JOBS_SYSTEM_PROMPT,
      model: resolveModel(provider!, modelId!),
      tools,
    },
  });

  return agent;
}
