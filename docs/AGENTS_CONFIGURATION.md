# Agent Configuration

This project uses `@mariozechner/pi-agent` to manage multiple LLM agents for different tasks.

## Architecture

```
┌─────────────┐
│ TaskRouter  │ ← Maps tasks to specific agents
└──────┬──────┘
       │
       ▼
┌──────────────────────┐
│  AgentManager       │
│  ├── mainAgent      │ ← Fallback agent
│  └── subAgents[]   │ ← Task-specific agents
└──────────────────────┘
```

## Configuration via Config File

API Keys and model settings are configured through Eve's config system, **not environment variables**.

### Main Agent (Fallback)

Configure the main agent which handles all un-routed tasks:

```bash
# Set model (use simplified names, see list below)
eve config set agents.main.model "claude-3.5-sonnet"

# Set system prompt (optional)
eve config set agents.main.systemPrompt "You are a helpful assistant for job hunting tasks."
```

### API Keys

Configure API keys per provider:

```bash
# Anthropic (Claude)
eve config set services.anthropic.api_key "sk-ant-..."

# Google (Gemini)
eve config set services.google.api_key "AIzaSy..."

# OpenAI (GPT)
eve config set services.openai.api_key "sk-..."
```

## Simplified Model Names

You can use these simplified names instead of full model IDs:

| Alias | Full Model ID | Provider | Use Case |
|--------|---------------|-----------|-----------|
| `claude-3.5-sonnet` | `anthropic.claude-3-5-sonnet-20241022-v2:0` | Anthropic | General purpose |
| `claude-haiku` | `anthropic.claude-3-5-haiku-20241022-v1:0` | Anthropic | Fast/cheap |
| `claude-opus` | `anthropic.claude-3-opus-20240229-v1:0` | Anthropic | High quality |
| `gemini-flash` | `google.gemini-2.0-flash-exp:0` | Google | Fast extraction |
| `gemini-pro` | `google.gemini-2.0-flash-thinking-exp:0` | Google | With thinking |
| `gpt-4o` | `openai.gpt-4o-2024-08-06:0` | OpenAI | High quality |
| `gpt-4o-mini` | `openai.gpt-4o-mini-2024-07-18:0` | OpenAI | Fast/cheap |

**Example**:

```bash
# Using simplified name
eve config set agents.main.model "claude-3.5-sonnet"

# Equivalent to full model ID
eve config set agents.main.model "anthropic.claude-3-5-sonnet-20241022-v2:0"
```

## Sub Agents (Optional)

Configure specialized agents for specific tasks:

```bash
eve config set agents.enabled '[
  {
    "name": "gemini-flash",
    "provider": "google",
    "model": "gemini-flash",
    "systemPrompt": "You are a fast extraction assistant.",
    "thinkingLevel": "off"
  },
  {
    "name": "claude-haiku",
    "provider": "anthropic",
    "model": "claude-haiku",
    "systemPrompt": "You are an analyst.",
    "thinkingLevel": "low"
  }
]'
```

## Default Task Routes

| Task | Default Agent | Purpose |
|------|---------------|---------|
| `extract:job-details` | `gemini-flash` | Fast extraction from emails |
| `extract:company-name` | `gemini-flash` | Extract company name |
| `extract:role-name` | `gemini-flash` | Extract role name |
| `analyze:job-fit` | `claude-haiku` | Deep job analysis with resume |
| `analyze:resume-match` | `claude-haiku` | Resume matching analysis |
| `enrich:job-description` | `main` | Content enrichment |

## Quick Start

### 1. Configure API Key

```bash
# Using Anthropic Claude (recommended)
eve config set services.anthropic.api_key "sk-ant-..."
```

### 2. Configure Main Agent

```bash
# Use Claude Sonnet by default
eve config set agents.main.model "claude-3.5-sonnet"
eve config set agents.main.systemPrompt "You are a helpful assistant for job hunting tasks."
```

### 3. (Optional) Configure Sub-Agents for Cost Optimization

```bash
# Use Gemini Flash for fast extraction (saves money!)
eve config set agents.enabled '[{"name":"gemini-flash","provider":"google","model":"gemini-flash","systemPrompt":"Extract job details as JSON only.","thinkingLevel":"off"}]'

# Also configure Google API key
eve config set services.google.api_key "AIzaSy..."
```

### 4. Test

```bash
# Run ingestion
eve ingest

# Or use TUI
eve
```

## Cost Optimization

By default:

- **Extraction tasks** → Use fast/cheap models (Gemini Flash, Claude Haiku)
- **Analysis tasks** → Use higher-quality models (Claude Sonnet, GPT-4o)

**Example daily cost comparison** (20 emails):

| Configuration | Cost/Day |
|--------------|-----------|
| All Claude Sonnet | ~$2.00 |
| Optimized routing | ~$0.20 |

## Common Errors

### "No API key configured for anthropic"
→ Configure API key:
```bash
eve config set services.anthropic.api_key "sk-ant-..."
```

### "No model configured"
→ Model ID is invalid. Use simplified names from the table above.

### "Unknown model alias"
→ The model alias is not recognized. Use one of:
- `claude-3.5-sonnet`
- `claude-haiku`
- `claude-opus`
- `gemini-flash`
- `gemini-pro`
- `gpt-4o`
- `gpt-4o-mini`

Or use the full model ID like `anthropic.claude-3-5-sonnet-20241022-v2:0`

## Custom Routing

You can modify task routes programmatically by editing `src/agents/router.ts`:

```typescript
this.routes.set("extract:job-details", "your-agent-name");
```

## Debugging

Enable verbose logging to see which agent handles each task:

```bash
# When running commands
eve ingest

# You'll see logs like:
# 🔧 Main Agent: claude-3.5-sonnet → anthropic/anthropic.claude-3-5-sonnet-20241022-v2:0
# 🔧 Sub Agent: gemini-flash → google/google.gemini-2.0-flash-exp:0
# 🔀 Routing to: gemini-flash
# 🔀 Routing to: claude-haiku
# 🤖 Using main agent
```

## Environment Variables (Fallback)

If config file is not set, Eve falls back to environment variables:

| Config Path | Environment Variable |
|-------------|---------------------|
| `services.anthropic.api_key` | `ANTHROPIC_API_KEY` or `ANTHROPIC_OAUTH_TOKEN` |
| `services.google.api_key` | `GOOGLE_API_KEY` |
| `services.openai.api_key` | `OPENAI_API_KEY` |

**Note**: Using config files is recommended for better management.

## Listing Available Models

```bash
# List all simplified model names
eve models

# Or programmatically:
bun -e "import { AgentManager } from './src/agents/manager.ts'; console.log(AgentManager.listAvailableModels());"
```
