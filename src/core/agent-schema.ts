import { Type, type Static } from "@sinclair/typebox";

/**
 * Agent Configuration Schema (TypeBox)
 * Matches agent.json structure in ~/.config/eve/agents/<id>/agent.json
 */

const AgentRoleSchema = Type.Object({
  description: Type.String(),
  personality: Type.Optional(Type.String()),
  system_prompt: Type.Optional(Type.String()),
});

const AgentModelSchema = Type.Object({
  primary: Type.String(),
  fallback: Type.Optional(Type.String()),
  temperature: Type.Optional(Type.Number({ minimum: 0, maximum: 2 })),
  thinking: Type.Optional(
    Type.Union([
      Type.Literal("none"),
      Type.Literal("low"),
      Type.Literal("medium"),
      Type.Literal("high"),
    ])
  ),
});

const AgentToolPermissionsSchema = Type.Object({
  allow: Type.Optional(Type.Array(Type.String())),
  deny: Type.Optional(Type.Array(Type.String())),
});

const AgentPermissionsSchema = Type.Object({
  tools: Type.Optional(AgentToolPermissionsSchema),
  capabilities: Type.Optional(Type.Array(Type.String())),
  can_delegate: Type.Optional(Type.Boolean({ default: false })),
  can_access_context: Type.Optional(Type.Boolean({ default: true })),
  max_tokens_per_call: Type.Optional(Type.Integer({ minimum: 0 })),
});

const AgentLongTermMemorySchema = Type.Object({
  enabled: Type.Optional(Type.Boolean({ default: true })),
  max_size_kb: Type.Optional(Type.Integer({ minimum: 0 })),
  auto_summarize: Type.Optional(Type.Boolean({ default: true })),
});

const AgentShortTermMemorySchema = Type.Object({
  retention_days: Type.Optional(Type.Integer({ minimum: 0 })),
  auto_cleanup: Type.Optional(Type.Boolean({ default: true })),
});

const AgentMemorySchema = Type.Object({
  long_term: Type.Optional(AgentLongTermMemorySchema),
  short_term: Type.Optional(AgentShortTermMemorySchema),
});

const AgentErrorHandlingSchema = Type.Object({
  max_retries: Type.Optional(Type.Integer({ minimum: 0 })),
  retry_delay_ms: Type.Optional(Type.Integer({ minimum: 0 })),
  fallback_strategy: Type.Optional(
    Type.Union([
      Type.Literal("use_fallback_model"),
      Type.Literal("delegate_to_eve"),
      Type.Literal("fail"),
    ])
  ),
  on_timeout: Type.Optional(
    Type.Union([
      Type.Literal("delegate_to_eve"),
      Type.Literal("retry"),
      Type.Literal("fail"),
    ])
  ),
});

export const AgentConfigSchema = Type.Object({
  id: Type.String(),
  name: Type.String(),
  version: Type.Optional(Type.String()),
  role: AgentRoleSchema,
  model: AgentModelSchema,
  responsibilities: Type.Optional(Type.Array(Type.String())),
  permissions: Type.Optional(AgentPermissionsSchema),
  memory: Type.Optional(AgentMemorySchema),
  error_handling: Type.Optional(AgentErrorHandlingSchema),
});

export type AgentConfig = Static<typeof AgentConfigSchema>;
export type AgentRole = Static<typeof AgentRoleSchema>;
export type AgentModel = Static<typeof AgentModelSchema>;
export type AgentPermissions = Static<typeof AgentPermissionsSchema>;
export type AgentMemory = Static<typeof AgentMemorySchema>;
export type AgentErrorHandling = Static<typeof AgentErrorHandlingSchema>;
