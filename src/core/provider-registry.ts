import type { EveConfig, ProviderConfig } from "./config-schema";

/**
 * ProviderRegistry
 * 
 * Manages LLM provider configurations and lookups.
 * Initialized from eve.json at startup.
 */
export class ProviderRegistry {
  private providers: Map<string, ProviderConfig> = new Map();

  constructor(config: EveConfig) {
    this.loadProviders(config);
  }

  private loadProviders(config: EveConfig): void {
    for (const [name, providerConfig] of Object.entries(config.providers)) {
      this.providers.set(name, providerConfig);
    }
  }

  /**
   * Get provider configuration by name
   * @throws Error if provider not found
   */
  getProvider(name: string): ProviderConfig {
    const provider = this.providers.get(name);
    if (!provider) {
      throw new Error(
        `Provider "${name}" not found. Available: ${Array.from(this.providers.keys()).join(", ")}`
      );
    }
    return provider;
  }

  /**
   * Check if provider exists
   */
  hasProvider(name: string): boolean {
    return this.providers.has(name);
  }

  /**
   * Get all registered provider names
   */
  listProviders(): string[] {
    return Array.from(this.providers.keys());
  }
}
