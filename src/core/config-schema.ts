import { Type, type Static } from "@sinclair/typebox";

/**
 * Eve Configuration Schema (TypeBox)
 * Single source of truth for eve.json structure
 */

// Provider configuration
const ProviderConfigSchema = Type.Object(
  {
    api_key: Type.Optional(Type.String()),
    base_url: Type.Optional(Type.Union([Type.String(), Type.Null()])),
    timeout_ms: Type.Optional(Type.Integer({ default: 30000, minimum: 0 })),
    rate_limit: Type.Optional(
      Type.Object({
        requests_per_minute: Type.Integer({ minimum: 0 }),
        tokens_per_minute: Type.Integer({ minimum: 0 }),
      })
    ),
  },
  {
    description: "Provider configuration - must have at least api_key or base_url",
  }
);

// Model alias definition
const ModelAliasSchema = Type.Object({
  provider: Type.String(),
  model: Type.String(),
});

// Routing rule
const RoutingRuleSchema = Type.Object({
  pattern: Type.String(),
  agent: Type.String(),
  priority: Type.Number(),
});

// Eve core config
const EveConfigBlockSchema = Type.Object({
  model: Type.String(),
  role: Type.Union([Type.Literal("orchestrator"), Type.Literal("direct")], {
    default: "orchestrator",
  }),
  fallback: Type.Boolean({ default: true }),
  system_prompt: Type.Optional(Type.String()),
});

// Defaults block
const DefaultsSchema = Type.Object({
  retry: Type.Object({
    max_retries: Type.Integer({ default: 3, minimum: 0 }),
    retry_delay_ms: Type.Integer({ default: 1000, minimum: 0 }),
    backoff_multiplier: Type.Number({ default: 2, minimum: 0 }),
    max_delay_ms: Type.Integer({ default: 30000, minimum: 0 }),
  }),
  memory: Type.Object({
    short_term_retention_days: Type.Integer({ default: 7, minimum: 0 }),
    long_term_max_size_kb: Type.Integer({ default: 512, minimum: 0 }),
  }),
  context: Type.Object({
    default_expiry_hours: Type.Integer({ default: 168, minimum: 0 }),
    compression: Type.Union([
      Type.Literal("none"),
      Type.Literal("json"),
      Type.Literal("selective"),
      Type.Literal("summarize"),
    ], { default: "json" }),
  }),
});

// Root config schema
export const EveConfigSchema = Type.Object({
  providers: Type.Record(Type.String(), ProviderConfigSchema),
  models: Type.Record(Type.String(), ModelAliasSchema),
  model_fallback_chain: Type.Optional(
    Type.Record(Type.String(), Type.Array(Type.String()))
  ),
  agents: Type.Object({
    enabled: Type.Array(Type.String()),
    auto_discover: Type.Boolean({ default: true }),
  }),
  routing: Type.Object({
    tasks: Type.Array(RoutingRuleSchema),
    capabilities: Type.Optional(Type.Array(RoutingRuleSchema)),
    keywords: Type.Optional(Type.Array(RoutingRuleSchema)),
  }),
  eve: EveConfigBlockSchema,
  capabilities: Type.Optional(
    Type.Object({
      enabled: Type.Array(Type.String()),
      auto_discover: Type.Boolean({ default: true }),
    })
  ),
  defaults: Type.Optional(DefaultsSchema),
});

export type EveConfig = Static<typeof EveConfigSchema>;
export type ProviderConfig = Static<typeof ProviderConfigSchema>;
export type ModelAlias = Static<typeof ModelAliasSchema>;
export type RoutingRule = Static<typeof RoutingRuleSchema>;
