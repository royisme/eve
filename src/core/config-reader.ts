import { readFileSync, existsSync, writeFileSync } from "fs";
import { join } from "path";
import { Value } from "@sinclair/typebox/value";
import { EveConfigSchema, type EveConfig } from "./config-schema";
import { getDataDir } from "./data-dir";
import { ProviderRegistry } from "./provider-registry";
import { ModelResolver } from "./model-resolver";

const CONFIG_FILE = "eve.json";

const DEFAULT_CONFIG: EveConfig = {
  providers: {},
  models: {
    fast: { provider: "anthropic", model: "claude-3-5-haiku-20241022" },
    smart: { provider: "anthropic", model: "claude-3-5-sonnet-20241022" },
  },
  model_fallback_chain: {
    smart: ["fast"],
  },
  agents: {
    enabled: [],
    auto_discover: true,
  },
  routing: {
    tasks: [],
  },
  eve: {
    model: "smart",
    role: "orchestrator",
    fallback: true,
    system_prompt: "You are Eve, a personal AI orchestrator.",
  },
  defaults: {
    retry: {
      max_retries: 3,
      retry_delay_ms: 1000,
      backoff_multiplier: 2,
      max_delay_ms: 30000,
    },
    memory: {
      short_term_retention_days: 7,
      long_term_max_size_kb: 512,
    },
    context: {
      default_expiry_hours: 168,
      compression: "json",
    },
  },
};

export class ConfigReader {
  private static config: EveConfig | null = null;
  private static providerRegistry: ProviderRegistry | null = null;
  private static modelResolver: ModelResolver | null = null;

  static getConfigPath(): string {
    return join(getDataDir(), CONFIG_FILE);
  }

  static load(): EveConfig {
    if (this.config) {
      return this.config;
    }

    const configPath = this.getConfigPath();

    if (!existsSync(configPath)) {
      console.log(`📝 Config file not found. Creating default config at ${configPath}`);
      this.createDefaultConfig(configPath);
      console.log(`⚠️  Run 'eve configure' to set up your providers and API keys.`);
    }

    let rawConfig: unknown;
    try {
      const content = readFileSync(configPath, "utf-8");
      rawConfig = JSON.parse(content);
    } catch (err) {
      console.error(`❌ Failed to parse config file: ${configPath}`);
      console.error(err);
      process.exit(1);
    }

    const errors = [...Value.Errors(EveConfigSchema, rawConfig)];
    if (errors.length > 0) {
      console.error(`❌ Invalid config schema in ${configPath}:`);
      for (const error of errors) {
        console.error(`  - ${error.path}: ${error.message}`);
      }
      process.exit(1);
    }

    const config = rawConfig as EveConfig;

    // Skip provider validation - providers can be empty initially
    // Validation happens when actually using the provider

    this.config = config;
    this.providerRegistry = new ProviderRegistry(config);
    this.modelResolver = new ModelResolver(config, this.providerRegistry);
    console.log(`✅ Loaded config from ${configPath}`);
    return this.config;
  }

  static reload(): EveConfig {
    this.config = null;
    this.providerRegistry = null;
    this.modelResolver = null;
    return this.load();
  }

  static get(): EveConfig {
    if (!this.config) {
      return this.load();
    }
    return this.config;
  }

  static getProviderRegistry(): ProviderRegistry {
    if (!this.providerRegistry) {
      this.load();
    }
    return this.providerRegistry!;
  }

  static getModelResolver(): ModelResolver {
    if (!this.modelResolver) {
      this.load();
    }
    return this.modelResolver!;
  }

  private static createDefaultConfig(configPath: string): void {
    writeFileSync(configPath, JSON.stringify(DEFAULT_CONFIG, null, 2), "utf-8");
  }

  static save(config: EveConfig): void {
    const configPath = this.getConfigPath();
    writeFileSync(configPath, JSON.stringify(config, null, 2), "utf-8");
    this.config = config;
    this.providerRegistry = new ProviderRegistry(config);
    this.modelResolver = new ModelResolver(config, this.providerRegistry);
  }

  static hasProvider(name: string): boolean {
    const config = this.get();
    return name in config.providers;
  }

  static getProviderNames(): string[] {
    const config = this.get();
    return Object.keys(config.providers);
  }
}
