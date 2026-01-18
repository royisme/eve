import { ConfigManager } from "../core/config";
import { Agent } from "@mariozechner/pi-agent-core";
import { getModel } from "@mariozechner/pi-ai";

export interface AgentConfig {
  name: string;
  provider: string;
  model: string;
  systemPrompt?: string;
  thinkingLevel?: "off" | "minimal" | "low" | "medium" | "high" | "xhigh";
}

// 简化的模型名称映射
const MODEL_ALIASES: Record<string, { provider: string; modelId: string }> = {
  // Claude
  "claude-sonnet": {
    provider: "anthropic",
    modelId: "anthropic.claude-3-5-sonnet-20241022-v2:0",
  },
  "claude-3.5-sonnet": {
    provider: "anthropic",
    modelId: "anthropic.claude-3-5-sonnet-20241022-v2:0",
  },
  "claude-haiku": {
    provider: "anthropic",
    modelId: "anthropic.claude-3-5-haiku-20241022-v1:0",
  },
  "claude-opus": {
    provider: "anthropic",
    modelId: "anthropic.claude-3-opus-20240229-v1:0",
  },

  // Gemini
  "gemini-flash": {
    provider: "google",
    modelId: "google.gemini-2.0-flash-exp:0",
  },
  "gemini-pro": {
    provider: "google",
    modelId: "google.gemini-2.0-flash-thinking-exp:0",
  },

  // GPT
  "gpt-4o": { provider: "openai", modelId: "openai.gpt-4o-2024-08-06:0" },
  "gpt-4o-mini": {
    provider: "openai",
    modelId: "openai.gpt-4o-mini-2024-07-18:0",
  },
};

export class AgentManager {
  private agents: Map<string, Agent> = new Map();
  private mainAgent!: Agent;

  // 获取 API key 的回调函数
  private getApiKey = async (provider: string): Promise<string | undefined> => {
    const configPath = `services.${provider.toLowerCase()}.api_key`;
    const apiKey = await ConfigManager.get<string>(configPath);
    if (apiKey) {
      return apiKey;
    }
    // 降级到环境变量
    if (provider === "anthropic") {
      return process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_OAUTH_TOKEN;
    }
    if (provider === "google") {
      return process.env.GOOGLE_API_KEY;
    }
    if (provider === "openai") {
      return process.env.OPENAI_API_KEY;
    }
    return undefined;
  };

  async init() {
    // 获取并解析模型配置
    const modelAlias =
      (await ConfigManager.get<string>(
        "agents.main.model",
        "claude-3.5-sonnet",
      )) || "claude-3.5-sonnet";
    const { provider: mainProvider, modelId: mainModelId } =
      this.resolveModel(modelAlias);
    const mainSystemPrompt =
      (await ConfigManager.get<string>(
        "agents.main.systemPrompt",
        "You are a helpful assistant for job hunting tasks.",
      )) || "You are a helpful assistant for job hunting tasks.";

    console.log(
      `🔧 Main Agent: ${modelAlias} → ${mainProvider}/${mainModelId}`,
    );

    // 检查 API key
    const apiKey = await this.getApiKey(mainProvider);
    if (!apiKey) {
      console.error(`❌ No API key configured for ${mainProvider}`);
      console.error(
        `   Run: eve config set services.${mainProvider.toLowerCase()}.api_key "YOUR_KEY"`,
      );
      console.error(
        `   Or set environment variable: ${mainProvider.toUpperCase()}_API_KEY`,
      );
    }

    this.mainAgent = new Agent({
      getApiKey: this.getApiKey,
      initialState: {
        systemPrompt: mainSystemPrompt,
        model: getModel(mainProvider as any, mainModelId as any),
      },
    });

    const enabledAgents =
      (await ConfigManager.get<AgentConfig[]>("agents.enabled", [])) || [];

    console.log(`🤖 Initializing ${enabledAgents.length} sub-agents...`);

    for (const config of enabledAgents) {
      try {
        const { provider, modelId } = this.resolveModel(config.model);

        console.log(`🔧 Sub Agent: ${config.name} → ${provider}/${modelId}`);

        const agent = new Agent({
          getApiKey: this.getApiKey,
          initialState: {
            systemPrompt:
              config.systemPrompt || "You are a specialized assistant.",
            model: getModel(provider as any, modelId as any),
          },
        });

        this.agents.set(config.name, agent);
        console.log(`  ✅ Registered: ${config.name}`);
      } catch (e) {
        console.error(`  ❌ Failed to register ${config.name}:`, e);
      }
    }

    if (enabledAgents.length === 0) {
      console.log(
        "ℹ️ No sub-agents configured, main agent will handle all tasks",
      );
    }
  }

  // 解析模型别名或完整模型 ID
  private resolveModel(modelInput: string): {
    provider: string;
    modelId: string;
  } {
    // 检查是否是别名
    if (MODEL_ALIASES[modelInput]) {
      return MODEL_ALIASES[modelInput];
    }

    // 如果是完整模型 ID，解析 provider
    if (modelInput.includes(".")) {
      const [provider, ..._modelParts] = modelInput.split(".");
      return {
        provider: provider as string,
        modelId: modelInput,
      };
    }

    // 默认返回
    console.warn(`⚠️ Unknown model alias: ${modelInput}, using default`);
    return MODEL_ALIASES["claude-3.5-sonnet"];
  }

  getAgent(name?: string): Agent {
    if (name && this.agents.has(name)) {
      return (console.log(`🔀 Routing to: ${name}`), this.agents.get(name)!);
    }
    return (console.log("🤖 Using main agent"), this.mainAgent);
  }

  async prompt(agentName: string | undefined, text: string): Promise<string> {
    const agent = this.getAgent(agentName);
    let fullResponse = "";

    try {
      const unsubscribe = agent.subscribe((event) => {
        if (
          event.type === "message_update" &&
          event.assistantMessageEvent?.type === "text_delta"
        ) {
          fullResponse += event.assistantMessageEvent.delta;
        }
      });

      await agent.prompt(text);

      unsubscribe();
    } catch (e) {
      console.error("Agent prompt error:", e);
    }

    return fullResponse;
  }

  // 列出可用的模型别名
  static listAvailableModels(): string[] {
    return Object.keys(MODEL_ALIASES);
  }
}
