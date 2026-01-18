# API Keys Setup

Eve uses `@mariozechner/pi-ai` for LLM integration. API keys can be configured via environment variables.

## Anthropic (Claude)

```bash
export ANTHROPIC_API_KEY="sk-ant-..."

# Or add to .env file
echo "ANTHROPIC_API_KEY=sk-ant-..." >> .env
```

## Google (Gemini)

```bash
export GOOGLE_API_KEY="AIzaSy..."

# Or add to .env file
echo "GOOGLE_API_KEY=AIzaSy..." >> .env
```

## OpenAI (GPT)

```bash
export OPENAI_API_KEY="sk-"

# Or add to .env file
echo "OPENAI_API_KEY=sk-..." >> .env
```

## Testing Configuration

After setting up API keys, test the ingestion:

```bash
bun run src/index.ts ingest
```

## Common Errors

### "No API key for provider: anthropic"
→ Missing `ANTHROPIC_API_KEY` environment variable

### "No model configured"
→ Model ID is incorrect. Use full model IDs like:
- `anthropic.claude-3-5-sonnet-20241022-v2:0`
- `google.gemini-2.0-flash-exp:0`

## Model IDs

View available model IDs:

```bash
# List Anthropic models
bun -e "import { getModels, getModel } from '@mariozechner/pi-ai'; console.log(getModels('anthropic').map(m => m.id));"

# List Google models
bun -e "import { getModels, getModel } from '@mariozechner/pi-ai'; console.log(getModels('google').map(m => m.id));"
```
