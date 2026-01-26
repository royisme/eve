# Configure Providers - Task Breakdown

## Overview

| Total Tasks | Estimated Effort | Files Modified |
|-------------|------------------|----------------|
| 6 | Medium (2-3 hours) | 1 main file + minor updates |

## Tasks

### Task 1: Add Provider Constants and Model Presets

**Goal**: Define supported providers and their common models as constants.

**Size**: Small

**Files**:
- `src/cli/configure.ts` (add constants at top of file)

**Implementation**:
```typescript
const SUPPORTED_PROVIDERS = [
  { key: "anthropic", name: "Anthropic", requiresKey: true, requiresUrl: false },
  { key: "openai", name: "OpenAI", requiresKey: true, requiresUrl: false },
  { key: "google", name: "Google Gemini", requiresKey: true, requiresUrl: false },
  { key: "openrouter", name: "OpenRouter", requiresKey: true, requiresUrl: false },
  { key: "ollama", name: "Ollama (Local)", requiresKey: false, requiresUrl: true, defaultUrl: "http://localhost:11434/v1" },
] as const;

const MODEL_PRESETS: Record<string, Array<{ value: string; label: string; hint?: string }>> = {
  anthropic: [
    { value: "claude-3-5-sonnet-20241022", label: "Claude 3.5 Sonnet", hint: "recommended" },
    { value: "claude-3-5-haiku-20241022", label: "Claude 3.5 Haiku", hint: "fast" },
    { value: "claude-3-opus-20240229", label: "Claude 3 Opus", hint: "powerful" },
  ],
  openai: [
    { value: "gpt-4o", label: "GPT-4o", hint: "recommended" },
    { value: "gpt-4o-mini", label: "GPT-4o Mini", hint: "fast" },
  ],
  google: [
    { value: "gemini-1.5-pro", label: "Gemini 1.5 Pro", hint: "recommended" },
    { value: "gemini-1.5-flash", label: "Gemini 1.5 Flash", hint: "fast" },
  ],
  openrouter: [],  // User inputs custom model ID
  ollama: [],      // User inputs local model name
};
```

**Acceptance Criteria**:
- [ ] Constants defined and exported
- [ ] All 5 providers represented
- [ ] Model presets accurate and up-to-date

---

### Task 2: Refactor handleProviders() → handleProviderManagement()

**Goal**: Replace current limited provider menu with full CRUD menu.

**Size**: Medium

**Files**:
- `src/cli/configure.ts`

**Implementation**:
- Rename function to `handleProviderManagement()`
- Add new menu options: Add/Edit/Remove Provider, Configure Model Aliases
- Update main menu to call new function

**Acceptance Criteria**:
- [ ] New menu structure matches contract
- [ ] All options navigate correctly
- [ ] Back navigation works

---

### Task 3: Implement addProvider()

**Goal**: Allow users to add new providers with credentials.

**Size**: Medium

**Files**:
- `src/cli/configure.ts`

**Implementation**:
1. Show provider selection (filter out already-configured)
2. For cloud providers: prompt for API key (or skip if exists)
3. For Ollama: prompt for base_url with default
4. Save to `eve.json` via `ConfigReader.save()`
5. Save API key to `auth.json` via `AuthStore.setProfile()`
6. Offer to configure model alias

**Acceptance Criteria**:
- [ ] Provider added to eve.json
- [ ] API key saved to auth.json (if provided)
- [ ] Ollama prompts for URL
- [ ] Duplicate provider prevented
- [ ] Cancel at any step returns to menu

---

### Task 4: Implement editProvider() and removeProvider()

**Goal**: Allow editing provider config and removing providers.

**Size**: Small

**Files**:
- `src/cli/configure.ts`

**Implementation**:

**editProvider()**:
- Show current config (base_url, timeout_ms)
- Allow editing each field
- Save changes

**removeProvider()**:
- Confirm removal
- Ask if credentials should also be removed
- Remove from eve.json
- Optionally remove from auth.json
- Warn if model aliases reference this provider

**Acceptance Criteria**:
- [ ] Edit shows current values as defaults
- [ ] Remove confirms before deleting
- [ ] Credential removal is optional
- [ ] Warning shown if aliases will break

---

### Task 5: Implement configureModelAliases()

**Goal**: Visual configuration of model aliases (fast, smart, custom).

**Size**: Medium

**Files**:
- `src/cli/configure.ts`

**Implementation**:
1. List existing aliases with current provider/model
2. Allow selecting to edit or add new
3. For edit:
   - Select provider (show which have credentials)
   - Select model from presets or enter manual model ID (no remote fetch)
4. For add:
   - Enter alias name
   - Select provider
   - Select model (preset or manual)
5. Save to eve.json

**Acceptance Criteria**:
- [ ] Existing aliases shown with current config
- [ ] Provider selection shows credential status
- [ ] Model presets shown for known providers
- [ ] Manual model ID input works for every provider (no remote fetch dependency)
- [ ] New alias can be created
- [ ] Changes saved correctly

---

### Task 6: Auto-Link Credentials to Providers

**Goal**: When adding API key in Authentication, auto-create provider if missing.

**Size**: Small

**Files**:
- `src/cli/configure.ts` (modify `addApiKey()`)

**Implementation**:
- After saving API key, check if provider exists in eve.json
- If not, add empty provider config: `config.providers[provider] = {}`
- Save config

**Acceptance Criteria**:
- [ ] Adding API key creates provider entry
- [ ] Existing provider not overwritten
- [ ] Works for all cloud providers

---

## Dependency Graph

```
Task 1 (Constants)
    ↓
Task 2 (Menu Refactor) ──→ Task 3 (Add Provider)
    ↓                           ↓
Task 4 (Edit/Remove)      Task 5 (Model Aliases)
                               ↓
                          Task 6 (Auto-Link)
```

## Execution Order

1. **Task 1**: Add constants (prerequisite for all)
2. **Task 2**: Refactor menu structure
3. **Task 3**: Implement add provider
4. **Task 5**: Implement model alias config (can parallel with 4)
5. **Task 4**: Implement edit/remove
6. **Task 6**: Auto-link credentials

## Verification

## How to Verify / Test Plan

Automated (required):
- Run `bun run check`
- Run `bun run test`
- Run `bun run build`

Manual smoke test (required):
- Run `bun run src/index.ts configure`
- Validate you can:
  - Add a provider
  - Configure an alias using preset model
  - Configure an alias using **manual model ID**
  - Remove a provider
  - Verify `~/.config/eve/eve.json` and `~/.config/eve/auth.json` updated correctly

After all tasks:
```bash
# Final verification (required)
bun run check && bun run test && bun run build

# Manual test
bun run src/index.ts configure
# → Navigate through all new options
# → Add Anthropic provider with API key
# → Configure smart alias to use it
# → Verify eve.json and auth.json updated correctly
```
