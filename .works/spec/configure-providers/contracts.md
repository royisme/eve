# Configure Providers - Contracts

## Goal / Purpose / Objective

Make `eve configure` fully capable of configuring LLM providers and model aliases so that:

1. A user can add/edit/remove providers in `eve.json` (non-secret metadata like base_url/timeout/rate limits).
2. A user can add credentials in `auth.json` (secrets like API keys) without ever storing secrets in `eve.json`.
3. Model alias resolution (e.g., `fast`, `smart`) never breaks due to missing provider registrations.
4. Model selection never depends on a provider implementing a remote “list models” API.

## Scope

In scope for this feature:
- Extend the existing `eve configure` wizard (`src/cli/configure.ts`).
- Provider CRUD in `eve.json.providers`:
  - Add Provider
  - Edit Provider (base_url, timeout_ms, optional rate_limit)
  - Remove Provider (optionally remove credentials)
- Configure model aliases in `eve.json.models`:
  - Edit existing aliases (`fast`, `smart`, and any user-defined aliases)
  - Add new alias
  - Select provider + model via presets OR manual model ID input
- Auto-link: when adding API key credentials for a cloud provider, ensure that provider exists in `eve.json.providers`.

Out of scope (explicitly):
- Auto-discovering models by calling provider endpoints.
- OAuth flows for LLM providers (not implemented; wizard already warns OAuth coming soon).
- Changing runtime behavior of `@mariozechner/pi-ai` / `pi-agent-core` provider implementations.

## Non-Goals / Out of Scope

- Implementing provider OAuth login.
- Verifying model IDs by making remote API calls.
- Adding new upstream providers to `@mariozechner/pi-ai` itself (we only configure existing providers; for Ollama we treat it as OpenAI-compatible endpoint configuration).
- Refactoring unrelated CLI commands.

## Data Structures

## Data Model / Schema / Type Definitions

This section is the single source of truth for the persisted config shapes touched by this feature.

### eve.json

```typescript
// Root shape (subset used by this feature)
interface EveJsonConfig {
  providers: Record<string, ProviderConfig>;
  models: Record<string, ModelAlias>;
  eve: {
    model: string; // default alias, e.g. "smart"
  };
}

interface ProviderConfig {
  base_url?: string | null;
  timeout_ms?: number;
  rate_limit?: {
    requests_per_minute: number;
    tokens_per_minute: number;
  };
}

interface ModelAlias {
  provider: string; // must exist in providers
  model: string;    // opaque model ID
}
```

### auth.json

```typescript
interface AuthFile {
  version: number;
  profiles: Record<string, AuthProfile>;
}

type AuthProfile = ApiKeyProfile | OAuthProfile;

interface ApiKeyProfile {
  type: "api_key";
  provider: "openai" | "anthropic" | "google" | "openrouter";
  api_key: string;
}

interface OAuthProfile {
  type: "oauth";
  provider: string;
  access: string;
  refresh?: string;
  expires?: number;
}
```

### eve.json Provider Entry

```typescript
interface ProviderConfig {
  base_url?: string | null;      // Custom API endpoint (required for Ollama)
  timeout_ms?: number;           // Request timeout (default: 30000)
  rate_limit?: {
    requests_per_minute: number;
    tokens_per_minute: number;
  };
}

// Example eve.json
{
  "providers": {
    "anthropic": {},                                    // Uses default endpoint
    "openai": { "timeout_ms": 60000 },                 // Custom timeout
    "ollama": { "base_url": "http://localhost:11434/v1" }  // Local model
  },
  "models": {
    "fast": { "provider": "anthropic", "model": "claude-3-5-haiku-20241022" },
    "smart": { "provider": "anthropic", "model": "claude-3-5-sonnet-20241022" },
    "local": { "provider": "ollama", "model": "llama3" }
  }
}
```

### auth.json Credential Entry

```typescript
interface ApiKeyProfile {
  type: "api_key";
  provider: "openai" | "anthropic" | "google" | "openrouter";
  api_key: string;
}

// Profile ID pattern: "${provider}:api-key"
// Example: "anthropic:api-key"
```

## Supported Providers

| Provider | ID | Requires API Key | Requires base_url | Default base_url |
|----------|-----|------------------|-------------------|------------------|
| Anthropic | `anthropic` | Yes | No | (built-in) |
| OpenAI | `openai` | Yes | No | (built-in) |
| Google Gemini | `google` | Yes | No | (built-in) |
| OpenRouter | `openrouter` | Yes | No | (built-in) |
| Ollama | `ollama` | No | Yes | `http://localhost:11434/v1` |

## Common Model Presets

### Important: no remote model fetch

Some endpoints (enterprise gateways, proxies, OpenRouter-like aggregators, or OpenAI-compatible self-hosted services) may not implement a reliable `GET /models` or equivalent API, or it may be blocked.

**Contract**:
- The wizard must never require fetching a remote model list.
- Presets are a convenience only.
- Every provider must offer **manual model ID input**.

### Anthropic
- `claude-3-5-sonnet-20241022` (recommended)
- `claude-3-5-haiku-20241022` (fast)
- `claude-3-opus-20240229` (powerful)

### OpenAI
- `gpt-4o` (recommended)
- `gpt-4o-mini` (fast)
- `gpt-4-turbo` (legacy)

### Google
- `gemini-1.5-pro` (recommended)
- `gemini-1.5-flash` (fast)
- `gemini-2.0-flash-exp` (experimental)

### OpenRouter
- Custom: user inputs model ID (e.g., `anthropic/claude-3-opus`)

### Ollama
- Custom: user inputs local model name (e.g., `llama3`, `mistral`, `codellama`)

## UI Flow Contracts

### Provider Management Menu

```
┌─────────────────────────────────────┐
│ 🤖 Providers & Models               │
├─────────────────────────────────────┤
│ > ➕ Add Provider                   │
│   ✏️  Edit Provider                  │
│   🗑️  Remove Provider                │
│   ───────────────────               │
│   🎯 Configure Model Aliases        │
│   ───────────────────               │
│   ← Back                            │
└─────────────────────────────────────┘
```

### Add Provider Flow

```
Step 1: Select Provider Type
┌─────────────────────────────────────┐
│ Select provider to add              │
├─────────────────────────────────────┤
│ > Anthropic (Recommended)           │
│   OpenAI                            │
│   Google Gemini                     │
│   OpenRouter                        │
│   Ollama (Local)                    │
│   ← Back                            │
└─────────────────────────────────────┘

Step 2a: For Cloud Providers (Anthropic/OpenAI/Google/OpenRouter)
┌─────────────────────────────────────┐
│ Anthropic API Key                   │
│ > sk-ant-...                        │
│                                     │
│ (Press Enter to skip if already     │
│  configured in Authentication)      │
└─────────────────────────────────────┘

Step 2b: For Ollama
┌─────────────────────────────────────┐
│ Ollama API URL                      │
│ > http://localhost:11434/v1         │
│   (default)                         │
└─────────────────────────────────────┘

Step 3: Confirmation
┌─────────────────────────────────────┐
│ ✅ Added provider: anthropic        │
│                                     │
│ Configure a model alias now?        │
│ > Yes                               │
│   No                                │
└─────────────────────────────────────┘
```

### Configure Model Alias Flow

```
Step 1: Select Alias to Configure
┌─────────────────────────────────────┐
│ Select model alias to configure     │
├─────────────────────────────────────┤
│ > fast: anthropic/claude-3-5-haiku  │
│   smart: anthropic/claude-3-5-sonnet│
│   ➕ Add new alias                  │
│   ← Back                            │
└─────────────────────────────────────┘

Step 2: Select Provider
┌─────────────────────────────────────┐
│ Select provider for "fast"          │
├─────────────────────────────────────┤
│ > anthropic ✅                      │  (✅ = has credentials)
│   openai ✅                         │
│   ollama                            │
│   ← Back                            │
└─────────────────────────────────────┘

Step 3: Select Model
┌─────────────────────────────────────┐
│ Select model for anthropic          │
├─────────────────────────────────────┤
│ > claude-3-5-haiku-20241022 (fast)  │
│   claude-3-5-sonnet-20241022        │
│   claude-3-opus-20240229            │
│   ✏️  Enter model ID manually        │
│   ← Back                            │
└─────────────────────────────────────┘

Manual input behavior:
- Prompt: `Model ID` (text input)
- Validation: non-empty string; do not attempt to validate against remote endpoint
- Example inputs:
  - OpenAI: `gpt-4o`
  - OpenRouter: `anthropic/claude-3.5-sonnet`
  - Ollama: `llama3`
```

## Function Signatures

### New Functions in configure.ts

```typescript
/**
 * Main provider management menu
 */
async function handleProviderManagement(): Promise<void>;

/**
 * Add a new provider to eve.json
 * @param providerKey - Provider identifier (anthropic, openai, etc.)
 * @param config - Optional provider configuration
 */
async function addProvider(
  providerKey: string, 
  config?: Partial<ProviderConfig>
): Promise<void>;

/**
 * Edit an existing provider's configuration
 * @param providerKey - Provider to edit
 */
async function editProvider(providerKey: string): Promise<void>;

/**
 * Remove a provider from eve.json
 * @param providerKey - Provider to remove
 * @param removeCredentials - Also remove from auth.json
 */
async function removeProvider(
  providerKey: string, 
  removeCredentials: boolean
): Promise<void>;

/**
 * Configure model aliases (fast, smart, custom)
 */
async function configureModelAliases(): Promise<void>;

/**
 * List available models for a provider
 * @param providerKey - Provider to get models for
 * @returns Array of model options with labels
 */
function getModelsForProvider(providerKey: string): Array<{
  value: string;
  label: string;
  hint?: string;
}>;

/**
 * Always available escape hatch when presets aren't sufficient.
 */
async function promptManualModelId(providerKey: string): Promise<string>;
```

## Validation Rules

1. **Provider uniqueness**: Cannot add a provider that already exists
2. **Ollama requires base_url**: Must have valid URL format
3. **API Key validation**: Non-empty string, provider-specific prefix check (optional)
4. **Model alias names**: Alphanumeric + underscore, no spaces
5. **Model ID validation**: Non-empty string; **no remote verification**
6. **Circular reference**: Model alias cannot reference non-existent provider

## Error Messages

## How to Verify / Test Plan

Automated checks:
- `bun run check`
- `bun run test`
- `bun run build`

Manual checks:
- `bun run src/index.ts configure`
- Confirm provider CRUD works and writes to `eve.json`.
- Confirm adding an API key writes to `auth.json` and auto-creates the provider entry in `eve.json` if missing.
- Confirm model aliases can be set via presets and via **manual model ID input**.

## Non-Functional Requirements (Performance / Security / Reliability)

Security:
- Never store secrets (API keys/tokens) in `eve.json`.
- Credentials remain in `auth.json` (via `AuthStore`), which enforces file permissions `0600`.

Reliability:
- Wizard must work even if provider endpoints cannot list models; model selection must always allow manual model ID entry.
- No network calls are required to complete configuration.

Performance:
- Configuration operations are local file reads/writes only.
- Provider `timeout_ms` is configurable to reduce the chance of long-hanging runtime requests.

## Interfaces / API / Contract Definitions

This section defines the concrete configuration contracts written by the wizard.

### Input Contracts

#### ProviderConfig input (wizard)

- `providerKey: string` — one of: `anthropic | openai | google | openrouter | ollama`
- `base_url?: string | null`
- `timeout_ms?: number`
- `rate_limit?: { requests_per_minute: number; tokens_per_minute: number }`

#### Model alias input (wizard)

- `aliasName: string` — e.g. `fast`, `smart`, `local`, `code`
- `providerKey: string` — must exist in `eve.json.providers`
- `modelId: string` — opaque string; manual input always allowed

### Output Contracts

#### Writes to eve.json

- Writes provider metadata to:
  - `config.providers[providerKey] = ProviderConfig`
- Writes model aliases to:
  - `config.models[aliasName] = { provider: providerKey, model: modelId }`

#### Writes to auth.json

- For API-key providers, writes profile:
  - id: `${providerKey}:api-key`
  - `{ type: "api_key", provider: providerKey, api_key: string }`

### Compatibility Contract

- No secrets in `eve.json`.
- `ModelResolver.resolve(alias)` must not fail due to missing provider registry entry.
- The wizard must remain usable in non-networked environments (no model fetch required).

| Scenario | Message |
|----------|---------|
| Provider exists | `Provider "${name}" already configured. Use Edit instead.` |
| Invalid URL | `Invalid URL format. Expected: http(s)://host:port` |
| Missing API key | `No API key found for ${provider}. Add one in Authentication first.` |
| Provider not found | `Provider "${name}" not found in configuration.` |
| Model alias exists | `Alias "${name}" already exists. Choose a different name.` |
