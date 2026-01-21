import type { EveConfig, ModelAlias } from "./config-schema";
import { ProviderRegistry } from "./provider-registry";

export interface ResolvedModel {
  provider: string;
  modelId: string;
  alias: string;
}

/**
 * ModelResolver
 * 
 * Resolves model aliases to provider + model ID pairs.
 * Enforces fallback chain resolution.
 */
export class ModelResolver {
  private models: Map<string, ModelAlias> = new Map();
  private fallbackChain: Map<string, string[]> = new Map();
  private providerRegistry: ProviderRegistry;

  constructor(config: EveConfig, providerRegistry: ProviderRegistry) {
    this.providerRegistry = providerRegistry;
    this.loadModels(config);
    this.loadFallbackChain(config);
  }

  private loadModels(config: EveConfig): void {
    for (const [alias, modelDef] of Object.entries(config.models)) {
      this.models.set(alias, modelDef);
    }
  }

  private loadFallbackChain(config: EveConfig): void {
    if (!config.model_fallback_chain) return;

    for (const [alias, fallbacks] of Object.entries(config.model_fallback_chain)) {
      this.fallbackChain.set(alias, fallbacks);
    }
  }

  /**
   * Resolve model alias to provider + model ID
   * @throws Error if alias not found or provider invalid
   */
  resolve(alias: string): ResolvedModel {
    const modelDef = this.models.get(alias);
    if (!modelDef) {
      throw new Error(
        `Model alias "${alias}" not found. Available: ${Array.from(this.models.keys()).join(", ")}`
      );
    }

    // Validate provider exists
    if (!this.providerRegistry.hasProvider(modelDef.provider)) {
      throw new Error(
        `Provider "${modelDef.provider}" for model "${alias}" not found in registry`
      );
    }

    return {
      provider: modelDef.provider,
      modelId: modelDef.model,
      alias,
    };
  }

  /**
   * Get fallback chain for a model alias
   * Returns empty array if no fallbacks configured
   */
  getFallbackChain(alias: string): string[] {
    return this.fallbackChain.get(alias) || [];
  }

  /**
   * Resolve with fallback chain
   * Returns primary model + all fallbacks in order
   */
  resolveWithFallbacks(alias: string): ResolvedModel[] {
    const primary = this.resolve(alias);
    const fallbacks = this.getFallbackChain(alias);

    const resolved: ResolvedModel[] = [primary];

    for (const fallbackAlias of fallbacks) {
      try {
        resolved.push(this.resolve(fallbackAlias));
      } catch (e) {
        console.warn(
          `⚠️ Fallback model "${fallbackAlias}" for "${alias}" failed to resolve:`,
          e instanceof Error ? e.message : String(e)
        );
      }
    }

    return resolved;
  }

  /**
   * Check if model alias exists
   */
  hasModel(alias: string): boolean {
    return this.models.has(alias);
  }

  /**
   * List all available model aliases
   */
  listModels(): string[] {
    return Array.from(this.models.keys());
  }
}
