import type { AgentConfig } from "./agent-schema";
import type { ResolvedModel } from "./model-resolver";
import { ConfigReader } from "./config-reader";

export interface ResolvedAgentConfig {
  id: string;
  name: string;
  version?: string;
  role: {
    description: string;
    personality?: string;
    system_prompt: string;
  };
  model: {
    primary: ResolvedModel;
    fallback?: ResolvedModel;
    temperature: number;
    thinking: "none" | "low" | "medium" | "high";
  };
  responsibilities: string[];
  permissions: {
    tools: {
      allow: string[];
      deny: string[];
    };
    capabilities: string[];
    can_delegate: boolean;
    can_access_context: boolean;
    max_tokens_per_call?: number;
  };
  memory: {
    long_term: {
      enabled: boolean;
      max_size_kb: number;
      auto_summarize: boolean;
    };
    short_term: {
      retention_days: number;
      auto_cleanup: boolean;
    };
  };
  error_handling: {
    max_retries: number;
    retry_delay_ms: number;
    fallback_strategy: "use_fallback_model" | "delegate_to_eve" | "fail";
    on_timeout: "delegate_to_eve" | "retry" | "fail";
  };
  configPath: string;
}

/**
 * AgentRoom
 * 
 * Represents a loaded agent with resolved models and applied defaults.
 * Handles the transformation from raw AgentConfig to fully resolved config.
 */
export class AgentRoom {
  readonly config: ResolvedAgentConfig;

  constructor(rawConfig: AgentConfig, configPath: string) {
    this.config = this.resolveConfig(rawConfig, configPath);
  }

  private resolveConfig(raw: AgentConfig, configPath: string): ResolvedAgentConfig {
    const modelResolver = ConfigReader.getModelResolver();
    const eveConfig = ConfigReader.get();
    const defaults = eveConfig.defaults;

    const primaryModel = modelResolver.resolve(raw.model.primary);
    const fallbackModel = raw.model.fallback
      ? modelResolver.resolve(raw.model.fallback)
      : undefined;

    const defaultSystemPrompt = `You are ${raw.name}. ${raw.role.description}`;

    return {
      id: raw.id,
      name: raw.name,
      version: raw.version,
      role: {
        description: raw.role.description,
        personality: raw.role.personality,
        system_prompt: raw.role.system_prompt || defaultSystemPrompt,
      },
      model: {
        primary: primaryModel,
        fallback: fallbackModel,
        temperature: raw.model.temperature ?? 0.7,
        thinking: raw.model.thinking ?? "none",
      },
      responsibilities: raw.responsibilities || [],
      permissions: {
        tools: {
          allow: raw.permissions?.tools?.allow || ["*"],
          deny: raw.permissions?.tools?.deny || [],
        },
        capabilities: raw.permissions?.capabilities || [],
        can_delegate: raw.permissions?.can_delegate ?? false,
        can_access_context: raw.permissions?.can_access_context ?? true,
        max_tokens_per_call: raw.permissions?.max_tokens_per_call,
      },
      memory: {
        long_term: {
          enabled: raw.memory?.long_term?.enabled ?? true,
          max_size_kb:
            raw.memory?.long_term?.max_size_kb ??
            defaults?.memory?.long_term_max_size_kb ??
            512,
          auto_summarize: raw.memory?.long_term?.auto_summarize ?? true,
        },
        short_term: {
          retention_days:
            raw.memory?.short_term?.retention_days ??
            defaults?.memory?.short_term_retention_days ??
            7,
          auto_cleanup: raw.memory?.short_term?.auto_cleanup ?? true,
        },
      },
      error_handling: {
        max_retries:
          raw.error_handling?.max_retries ?? defaults?.retry?.max_retries ?? 3,
        retry_delay_ms:
          raw.error_handling?.retry_delay_ms ?? defaults?.retry?.retry_delay_ms ?? 1000,
        fallback_strategy: raw.error_handling?.fallback_strategy ?? "use_fallback_model",
        on_timeout: raw.error_handling?.on_timeout ?? "delegate_to_eve",
      },
      configPath,
    };
  }

  get id(): string {
    return this.config.id;
  }

  get name(): string {
    return this.config.name;
  }

  get systemPrompt(): string {
    return this.config.role.system_prompt;
  }

  get primaryModel(): ResolvedModel {
    return this.config.model.primary;
  }

  hasResponsibility(taskTag: string): boolean {
    return this.config.responsibilities.some((r) => {
      if (r.endsWith("*")) {
        const prefix = r.slice(0, -1);
        return taskTag.startsWith(prefix);
      }
      return r === taskTag;
    });
  }

  canUseTool(toolName: string): boolean {
    const { allow, deny } = this.config.permissions.tools;

    const matchesPattern = (pattern: string, name: string): boolean => {
      if (pattern === "*") return true;
      if (pattern.endsWith("*")) {
        return name.startsWith(pattern.slice(0, -1));
      }
      return pattern === name;
    };

    const isDenied = deny.some((p) => matchesPattern(p, toolName));
    if (isDenied) return false;

    return allow.some((p) => matchesPattern(p, toolName));
  }
}
