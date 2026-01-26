# Configure Providers Feature

## Problem Statement

当前 `eve configure` 命令的 "Providers & Models" 功能不完整：
1. 只能选择预设的模型别名 (fast/smart)，不能添加/编辑 provider
2. `eve.json` 中的 `providers: {}` 始终为空
3. 添加 API Key 后，凭证存在 `auth.json`，但 `eve.json` 中没有对应的 provider 条目

## User Decision Summary

| Decision Point | Choice |
|----------------|--------|
| 功能范围 | **完整 Provider 管理** - 添加/编辑/删除 provider，配置 base_url、timeout、rate_limit |
| Provider 支持 | **Anthropic + OpenAI + Google + OpenRouter + Ollama** |
| 模型别名配置 | **可视化选择** - 列出可用模型让用户选择 |

## Additional Requirement

Many endpoints cannot reliably support “list models” APIs. The configuration flow must **NOT depend on fetching model lists** from any remote endpoint.

Design choice:
- Provide **curated presets** for well-known providers as convenience.
- Always provide a **manual model ID input** option for every provider.
- For OpenAI-compatible endpoints (including some self-hosted gateways), model IDs are treated as opaque strings.

## Architecture Summary

### Configuration System

Eve 使用双层配置架构：

```
eve.json (Public Config)          auth.json (Secrets)
├── providers                     ├── profiles
│   └── anthropic: {base_url}     │   └── anthropic:api-key: {api_key}
├── models                        │   └── openai:api-key: {api_key}
│   ├── fast → provider/model     └── version: 1
│   └── smart → provider/model
└── eve.model: "smart"
```

### Credential Flow

```
Model Alias ("smart")
    ↓
ModelResolver → [provider: "anthropic", model: "claude-3-5-sonnet"]
    ↓
ProviderRegistry → {base_url?, timeout_ms?, rate_limit?}
    ↓
AuthStore.getApiKey("anthropic") → API Key
    ↓
pi-agent-core Agent → LLM Call
```

### Key Insight

`ProviderRegistry` requires provider to exist in `eve.json` for `ModelResolver.resolve()` to succeed:

```typescript
// model-resolver.ts:54-58
if (!this.providerRegistry.hasProvider(modelDef.provider)) {
  throw new Error(
    `Provider "${modelDef.provider}" for model "${alias}" not found in registry`
  );
}
```

This means adding API key alone is insufficient - provider must be registered in `eve.json`.

## Technical Approach

### 1. Provider Management

Add CRUD operations for providers in `handleProviders()`:
- **Add Provider**: Select from supported list → Configure base_url (optional) → Auto-prompt for API key
- **Edit Provider**: Modify base_url, timeout, rate_limit
- **Remove Provider**: Delete from both `eve.json` and optionally `auth.json`

### 2. Model Alias Configuration

Enhance model selection to show available models per provider:
- List configured providers
- Show common models for each provider (presets)
- **Always allow manual model ID input (no remote fetch)**

### 3. Provider-Credential Auto-Link

When adding API key via "Authentication", auto-create provider entry in `eve.json` if missing.

## Supported Providers

| Provider | Auth Method | Base URL Required |
|----------|-------------|-------------------|
| Anthropic | API Key | No (default) |
| OpenAI | API Key | No (default) |
| Google | API Key | No (default) |
| OpenRouter | API Key | No (default) |
| Ollama | None | Yes (default: http://localhost:11434) |

## Files to Modify

- `src/cli/configure.ts` - Main wizard implementation
- `src/core/config-reader.ts` - May need helper methods
- `src/core/agent.ts` - Add Ollama to env fallback map (optional)

## Status

- [x] Discovery complete
- [x] Codebase explored
- [ ] Contracts written
- [ ] Tasks breakdown
- [ ] Implementation
- [ ] Review & PR
