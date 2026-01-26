import * as p from "@clack/prompts";
import { ConfigReader } from "../core/config-reader";
import { AuthStore, type AuthProfile } from "../core/auth-store";
import {
  listAccounts,
  addAccount,
  setPrimaryAccount,
  removeAccount,
  ensureAccountsInitialized,
  updateAccountAuth,
} from "../capabilities/email/services/account-service";
import { checkGogAuth, getFullAuthStatus, initiateGogAuth } from "../capabilities/email/services/email-service";

type ConfigSection = "authentication" | "providers" | "email" | "models" | "view" | "done";

const OAUTH_PROVIDERS = [
  { key: "anthropic", name: "Anthropic", method: "OAuth" },
  { key: "openai", name: "OpenAI", method: "Codex OAuth" },
  { key: "github_copilot", name: "GitHub Copilot", method: "OAuth" },
  { key: "gemini", name: "Google Gemini CLI", method: "OAuth" },
] as const;

const API_KEY_PROVIDERS = [
  { key: "openai", name: "OpenAI (API Key)" },
  { key: "anthropic", name: "Anthropic (API Key)" },
  { key: "google", name: "Google (API Key)" },
  { key: "openrouter", name: "OpenRouter" },
] as const;

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
  openrouter: [], // User inputs custom model ID
  ollama: [], // User inputs local model name
};

function maskApiKey(key: string): string {
  if (key.length <= 8) return "****";
  return key.slice(0, 4) + "..." + key.slice(-4);
}

function isCancel(value: unknown): value is symbol {
  return p.isCancel(value);
}

export async function interactiveConfigure(): Promise<void> {
  p.intro("🔧 Eve Configuration");

  while (true) {
    const authStore = AuthStore.getInstance();
    const profiles = authStore.listProfiles();
    const authCount = profiles.length;

    let accounts: Awaited<ReturnType<typeof listAccounts>> = [];
    try {
      await ensureAccountsInitialized();
      accounts = await listAccounts();
    } catch {
    }

    const section = await p.select({
      message: "What would you like to configure?",
      options: [
        {
          value: "authentication" as const,
          label: "🔐 Authentication",
          hint: authCount > 0 ? `${authCount} credentials` : "none configured",
        },
        {
          value: "providers" as const,
          label: "🤖 Providers & Models",
          hint: "Configure default models",
        },
        {
          value: "email" as const,
          label: "📧 Gmail Accounts",
          hint: accounts.length > 0 ? `${accounts.length} accounts` : "none configured",
        },
        {
          value: "view" as const,
          label: "📊 View Current Config",
        },
        {
          value: "done" as const,
          label: "✅ Done",
        },
      ],
    });

    if (isCancel(section) || section === "done") {
      p.outro("Configuration complete!");
      return;
    }

    switch (section) {
      case "authentication":
        await handleAuthentication();
        break;
      case "providers":
        await handleProviderManagement();
        break;
      case "email":
        await handleEmailAccounts();
        break;
      case "view":
        await showConfig();
        break;
    }
  }
}

async function handleAuthentication(): Promise<void> {
  const action = await p.select({
    message: "Authentication",
    options: [
      { value: "add", label: "➕ Add credentials" },
      { value: "list", label: "📋 List credentials" },
      { value: "remove", label: "🗑️  Remove credentials" },
      { value: "back", label: "← Back" },
    ],
  });

  if (isCancel(action) || action === "back") return;

  switch (action) {
    case "add":
      await addCredentials();
      break;
    case "list":
      listCredentials();
      break;
    case "remove":
      await removeCredentials();
      break;
  }
}

async function handleEmailAccounts(): Promise<void> {
  await ensureAccountsInitialized();

  const action = await p.select({
    message: "Gmail Accounts",
    options: [
      { value: "add", label: "➕ Add Gmail account" },
      { value: "list", label: "📋 List accounts" },
      { value: "set_primary", label: "⭐ Set primary account" },
      { value: "remove", label: "🗑️  Remove account" },
      { value: "back", label: "← Back" },
    ],
  });

  if (isCancel(action) || action === "back") return;

  switch (action) {
    case "add":
      await addEmailAccount();
      break;
    case "list":
      await listEmailAccounts();
      break;
    case "set_primary":
      await setPrimaryEmailAccount();
      break;
    case "remove":
      await removeEmailAccount();
      break;
  }
}

async function addEmailAccount(): Promise<void> {
  const emailInput = await p.text({
    message: "Gmail address",
    placeholder: "your@gmail.com",
    validate: (value) => (value.trim().includes("@") ? undefined : "Please enter a valid email"),
  });

  if (isCancel(emailInput)) return;

  const email = (emailInput as string).trim().toLowerCase();

  const alias = await p.text({
    message: "Alias (optional)",
    placeholder: "Work, Personal",
  });

  if (isCancel(alias)) return;

  const isPrimary = await p.confirm({
    message: "Set as primary account?",
  });

  if (isCancel(isPrimary)) return;

  const aliasValue = (alias as string).trim();

  await addAccount(email, {
    alias: aliasValue ? aliasValue : undefined,
    isPrimary: isPrimary as boolean,
  });

  p.log.success(`Added ${email}${aliasValue ? ` (${aliasValue})` : ""}`);

  const authorizeNow = await p.confirm({
    message: "Authorize this account now via Gmail OAuth?",
  });

  if (isCancel(authorizeNow) || !authorizeNow) return;

  const result = await initiateGogAuth(email);

  if (result.success && result.authUrl) {
    p.note(result.authUrl, "Open this URL to authorize");
    const completed = await p.confirm({
      message: "Press Enter after completing authorization",
    });
    if (!isCancel(completed) && completed) {
      const authorized = await checkGogAuth(email);
      if (authorized) {
        await updateAccountAuth(email, true);
        p.log.success(`Authorized ${email}`);
      } else {
        p.log.warn("Authorization not detected. You can retry with `eve email:setup`. ");
      }
    }
    return;
  }

  if (result.success) {
    await updateAccountAuth(email, true);
    p.log.success(result.message);
    return;
  }

  p.log.warn(result.message);
}

async function listEmailAccounts(): Promise<void> {
  const status = await getFullAuthStatus();

  if (!status.installed) {
    p.note("gog CLI not installed. Install: https://github.com/pdfinn/gog", "Gmail Status");
    return;
  }

  if (status.accounts.length === 0) {
    p.note("No accounts configured. Use 'Add Gmail account' to get started.", "Gmail Status");
    return;
  }

  const lines = status.accounts.map((acc) => {
    const primary = acc.isPrimary ? "⭐" : "";
    const auth = acc.authorized ? "✅" : "⚠️";
    const alias = acc.alias ? ` (${acc.alias})` : "";
    const lastSync = acc.lastSyncAt ? ` last sync: ${acc.lastSyncAt}` : "";
    return `${primary}${auth} ${acc.email}${alias}${lastSync}`;
  });

  p.note(lines.join("\n"), "Gmail Accounts");
}

async function setPrimaryEmailAccount(): Promise<void> {
  const accounts = await listAccounts();
  if (accounts.length === 0) {
    p.log.warn("No accounts configured.");
    return;
  }

  const selection = await p.select({
    message: "Select primary account",
    options: [
      ...accounts.map((acc) => ({
        value: acc.email,
        label: `${acc.email}${acc.alias ? ` (${acc.alias})` : ""}`,
      })),
      { value: "back", label: "← Back" },
    ],
  });

  if (isCancel(selection) || selection === "back") return;

  await setPrimaryAccount(selection as string);
  p.log.success(`Primary account set to ${selection}`);
}

async function removeEmailAccount(): Promise<void> {
  const accounts = await listAccounts();
  if (accounts.length === 0) {
    p.log.warn("No accounts configured.");
    return;
  }

  const selection = await p.select({
    message: "Select account to remove",
    options: [
      ...accounts.map((acc) => ({
        value: acc.email,
        label: `${acc.email}${acc.alias ? ` (${acc.alias})` : ""}`,
      })),
      { value: "back", label: "← Back" },
    ],
  });

  if (isCancel(selection) || selection === "back") return;

  const confirm = await p.confirm({
    message: `Remove ${selection}?`,
  });

  if (isCancel(confirm) || !confirm) return;

  await removeAccount(selection as string);
  p.log.success(`Removed ${selection}`);
}

async function addCredentials(): Promise<void> {
  const method = await p.select({
    message: "Authentication method",
    options: [
      { value: "oauth", label: "🔗 OAuth (recommended)", hint: "Uses provider's OAuth flow" },
      { value: "api-key", label: "🔑 API Key", hint: "Paste your API key directly" },
      { value: "back", label: "← Back" },
    ],
  });

  if (isCancel(method) || method === "back") return;

  if (method === "api-key") {
    await addApiKey();
  } else {
    await addOAuth();
  }
}

async function addOAuth(): Promise<void> {
  const provider = await p.select({
    message: "Select provider",
    options: [
      ...OAUTH_PROVIDERS.map((prov) => ({
        value: prov.key,
        label: prov.name,
        hint: prov.method,
      })),
      { value: "back", label: "← Back" },
    ],
  });

  if (isCancel(provider) || provider === "back") return;

  p.note("OAuth login will be implemented using pi-ai library.", provider);
  p.log.warn("OAuth support coming soon. Please use API Key for now.");
}

async function addApiKey(): Promise<void> {
  const provider = await p.select({
    message: "Select provider",
    options: [
      ...API_KEY_PROVIDERS.map((prov) => ({
        value: prov.key,
        label: prov.name,
      })),
      { value: "back", label: "← Back" },
    ],
  });

  if (isCancel(provider) || provider === "back") return;

  const providerMeta = API_KEY_PROVIDERS.find((p) => p.key === provider);
  if (!providerMeta) return;

  const apiKey = await p.text({
    message: `${providerMeta.name} API Key`,
    placeholder: "sk-...",
    validate: (value) => {
      if (!value.trim()) return "API key is required";
      return undefined;
    },
  });

  if (isCancel(apiKey)) return;

  const apiKeyValue = (apiKey as string).trim();
  const authStore = AuthStore.getInstance();
  authStore.setProfile(`${provider}:api-key`, {
    type: "api_key",
    provider: provider as "openai" | "anthropic" | "google" | "openrouter",
    api_key: apiKeyValue,
  });

  p.log.success(`${providerMeta.name} API key saved!`);

  // Auto-link: ensure provider entry exists in eve.json
  const config = ConfigReader.get();
  if (!config.providers[provider as string]) {
    config.providers[provider as string] = {
      base_url: null,
    };
    ConfigReader.save(config);
    p.log.success(`Automatically added ${provider} to providers in eve.json`);
  }
}

function listCredentials(): void {
  const authStore = AuthStore.getInstance();
  const profiles = authStore.listProfiles();

  if (profiles.length === 0) {
    p.note("No credentials configured.", "Credentials");
    return;
  }

  const lines: string[] = [];
  for (const { id, profile } of profiles) {
    if (profile.type === "api_key") {
      const status = profile.api_key ? "✅" : "⚠️";
      lines.push(`${status} ${profile.provider}: API Key (${maskApiKey(profile.api_key)})`);
    } else if (profile.type === "oauth") {
      const status = profile.access ? "✅" : "⚠️";
      const expires = profile.expires
        ? `expires ${new Date(profile.expires).toLocaleDateString()}`
        : "";
      lines.push(`${status} ${profile.provider}: OAuth ${expires}`);
    }
  }

  p.note(lines.join("\n"), "Configured Credentials");
}

async function removeCredentials(): Promise<void> {
  const authStore = AuthStore.getInstance();
  const profiles = authStore.listProfiles();

  if (profiles.length === 0) {
    p.log.warn("No credentials to remove.");
    return;
  }

  const options = profiles.map(({ id, profile }) => {
    const label = profile.type === "api_key" ? `${profile.provider} (API Key)` : `${profile.provider} (OAuth)`;
    return { value: id, label };
  });

  const toRemove = await p.select({
    message: "Select credentials to remove",
    options: [...options, { value: "back", label: "← Back" }],
  });

  if (isCancel(toRemove) || toRemove === "back") return;

  const confirm = await p.confirm({
    message: `Remove ${toRemove}?`,
  });

  if (isCancel(confirm) || !confirm) return;

  authStore.removeProfile(toRemove as string);
  p.log.success("Credentials removed.");
}

async function handleProviderManagement(): Promise<void> {
  while (true) {
    const config = ConfigReader.get();
    const providers = Object.keys(config.providers || {});

    const action = await p.select({
      message: "Providers & Models",
      options: [
        { value: "add", label: "➕ Add Provider" },
        { value: "edit", label: "✏️  Edit Provider", hint: `${providers.length} configured` },
        { value: "remove", label: "🗑️  Remove Provider" },
        { value: "aliases", label: "🎯 Configure Model Aliases" },
        { value: "back", label: "← Back" },
      ],
    });

    if (isCancel(action) || action === "back") break;

    switch (action) {
      case "add":
        await addProvider();
        break;
      case "edit":
        await editProviderMenu();
        break;
      case "remove":
        await removeProviderMenu();
        break;
      case "aliases":
        await configureModelAliases();
        break;
    }
  }
}

async function addProvider(): Promise<void> {
  const config = ConfigReader.get();
  const existingProviders = Object.keys(config.providers);

  const availableProviders = SUPPORTED_PROVIDERS.filter((p) => !existingProviders.includes(p.key));

  if (availableProviders.length === 0) {
    p.log.warn("All supported providers are already configured.");
    return;
  }

  const selection = await p.select({
    message: "Select provider to add",
    options: [
      ...availableProviders.map((prov) => ({
        value: prov.key,
        label: prov.name,
        hint: prov.key === "anthropic" ? "recommended" : undefined,
      })),
      { value: "back", label: "← Back" },
    ],
  });

  if (isCancel(selection) || selection === "back") return;

  const providerKey = selection as string;
  const providerMeta = SUPPORTED_PROVIDERS.find((p) => p.key === providerKey)!;

  let baseUrl: string | undefined;
  if (providerMeta.requiresUrl) {
    const urlInput = await p.text({
      message: `${providerMeta.name} API URL`,
      placeholder: providerMeta.defaultUrl,
      defaultValue: providerMeta.defaultUrl,
      validate: (value) => {
        if (!value.trim()) return "URL is required";
        try {
          new URL(value);
          return undefined;
        } catch {
          return "Invalid URL format";
        }
      },
    });
    if (isCancel(urlInput)) return;
    baseUrl = (urlInput as string).trim();
  }

  if (providerMeta.requiresKey) {
    const authStore = AuthStore.getInstance();
    const hasKey = authStore.hasAuth(providerKey);

    if (!hasKey) {
      const apiKeyInput = await p.text({
        message: `${providerMeta.name} API Key`,
        placeholder: "sk-...",
        validate: (value) => (value.trim() ? undefined : "API key is required"),
      });

      if (isCancel(apiKeyInput)) return;

      const apiKeyValue = (apiKeyInput as string).trim();
      authStore.setProfile(`${providerKey}:api-key`, {
        type: "api_key",
        provider: providerKey as any,
        api_key: apiKeyValue,
      });
      p.log.success(`API key saved to auth.json`);
    } else {
      p.log.info(`Using existing API key from auth.json`);
    }
  }

  // Save to eve.json
  config.providers[providerKey] = {
    base_url: baseUrl || null,
  };
  ConfigReader.save(config);
  p.log.success(`✅ Added provider: ${providerKey}`);

  const configureAlias = await p.confirm({
    message: "Configure a model alias for this provider now?",
  });

  if (!isCancel(configureAlias) && configureAlias) {
    await configureModelAliases();
  }
}

async function editProviderMenu(): Promise<void> {
  const config = ConfigReader.get();
  const providers = Object.keys(config.providers);

  if (providers.length === 0) {
    p.log.warn("No providers configured to edit.");
    return;
  }

  const selection = await p.select({
    message: "Select provider to edit",
    options: [
      ...providers.map((p) => ({ value: p, label: p })),
      { value: "back", label: "← Back" },
    ],
  });

  if (isCancel(selection) || selection === "back") return;

  const providerKey = selection as string;
  const providerConfig = config.providers[providerKey];

  const field = await p.select({
    message: `Editing ${providerKey}`,
    options: [
      { value: "base_url", label: "API URL", hint: providerConfig.base_url || "default" },
      { value: "timeout_ms", label: "Timeout (ms)", hint: String(providerConfig.timeout_ms || 30000) },
      { value: "back", label: "← Back" },
    ],
  });

  if (isCancel(field) || field === "back") return;

  if (field === "base_url") {
    const urlInput = await p.text({
      message: "New API URL",
      placeholder: providerConfig.base_url || "http://...",
      validate: (value) => {
        if (!value.trim()) return undefined; // allow clearing
        try {
          new URL(value);
          return undefined;
        } catch {
          return "Invalid URL format";
        }
      },
    });
    if (isCancel(urlInput)) return;
    providerConfig.base_url = (urlInput as string).trim() || null;
  } else if (field === "timeout_ms") {
    const timeoutInput = await p.text({
      message: "Timeout in milliseconds",
      placeholder: String(providerConfig.timeout_ms || 30000),
      validate: (value) => {
        const n = parseInt(value, 10);
        if (isNaN(n) || n < 0) return "Must be a positive number";
        return undefined;
      },
    });
    if (isCancel(timeoutInput)) return;
    providerConfig.timeout_ms = parseInt(timeoutInput as string, 10);
  }

  ConfigReader.save(config);
  p.log.success(`Updated ${providerKey} configuration`);
}

async function removeProviderMenu(): Promise<void> {
  const config = ConfigReader.get();
  const providers = Object.keys(config.providers);

  if (providers.length === 0) {
    p.log.warn("No providers configured to remove.");
    return;
  }

  const selection = await p.select({
    message: "Select provider to remove",
    options: [
      ...providers.map((p) => ({ value: p, label: p })),
      { value: "back", label: "← Back" },
    ],
  });

  if (isCancel(selection) || selection === "back") return;

  const providerKey = selection as string;

  // Check for aliases using this provider
  const affectedAliases = Object.entries(config.models)
    .filter(([_, def]) => def.provider === providerKey)
    .map(([name]) => name);

  if (affectedAliases.length > 0) {
    p.log.warn(`Warning: The following aliases use this provider and will break: ${affectedAliases.join(", ")}`);
  }

  const confirm = await p.confirm({
    message: `Are you sure you want to remove ${providerKey}?`,
  });

  if (isCancel(confirm) || !confirm) return;

  delete config.providers[providerKey];
  ConfigReader.save(config);
  p.log.success(`Removed provider ${providerKey} from eve.json`);

  const authStore = AuthStore.getInstance();
  if (authStore.hasAuth(providerKey)) {
    const removeCreds = await p.confirm({
      message: `Also remove credentials for ${providerKey} from auth.json?`,
    });
    if (!isCancel(removeCreds) && removeCreds) {
      const profiles = authStore.listProfiles().filter((p) => p.id.startsWith(`${providerKey}:`));
      for (const p of profiles) {
        authStore.removeProfile(p.id);
      }
      p.log.success(`Removed credentials for ${providerKey}`);
    }
  }
}

async function configureModelAliases(): Promise<void> {
  const config = ConfigReader.get();
  const authStore = AuthStore.getInstance();

  while (true) {
    const aliasOptions = Object.entries(config.models).map(([name, def]) => ({
      value: name,
      label: `${name}: ${def.provider}/${def.model}`,
    }));

    const selection = await p.select({
      message: "Configure model aliases",
      options: [
        ...aliasOptions,
        { value: "add", label: "➕ Add new alias" },
        { value: "back", label: "← Back" },
      ],
    });

    if (isCancel(selection) || selection === "back") break;

    let aliasName = selection as string;
    let isNew = false;

    if (aliasName === "add") {
      const nameInput = await p.text({
        message: "New alias name",
        placeholder: "e.g. local, code, vision",
        validate: (value) => {
          if (!value.trim()) return "Name is required";
          if (config.models[value]) return "Alias already exists";
          if (!/^[a-zA-Z0-9_]+$/.test(value)) return "Invalid name format (alphanumeric and underscore only)";
          return undefined;
        },
      });
      if (isCancel(nameInput)) continue;
      aliasName = (nameInput as string).trim();
      isNew = true;
    }

    // 1. Select Provider
    const providers = Object.keys(config.providers);
    if (providers.length === 0) {
      p.log.warn("No providers configured. Add a provider first.");
      continue;
    }

    const providerSelection = await p.select({
      message: `Select provider for "${aliasName}"`,
      options: [
        ...providers.map((p) => ({
          value: p,
          label: p,
          hint: authStore.hasAuth(p) ? "✅ credentials found" : "⚠️ no credentials",
        })),
        { value: "back", label: "← Back" },
      ],
    });

    if (isCancel(providerSelection) || providerSelection === "back") continue;
    const providerKey = providerSelection as string;

    // 2. Select Model
    const presets = MODEL_PRESETS[providerKey] || [];
    const modelSelection = await p.select({
      message: `Select model for ${providerKey}`,
      options: [
        ...presets.map((m) => ({ value: m.value, label: m.label, hint: m.hint })),
        { value: "manual", label: "✏️  Enter model ID manually" },
        { value: "back", label: "← Back" },
      ],
    });

    if (isCancel(modelSelection) || modelSelection === "back") continue;

    let modelId: string;
    if (modelSelection === "manual") {
      const manualId = await p.text({
        message: "Model ID",
        placeholder: "e.g. gpt-4o, llama3, anthropic/claude-3-5-sonnet",
        validate: (value) => (value.trim() ? undefined : "Model ID is required"),
      });
      if (isCancel(manualId)) continue;
      modelId = (manualId as string).trim();
    } else {
      modelId = modelSelection as string;
    }

    config.models[aliasName] = {
      provider: providerKey,
      model: modelId,
    };

    ConfigReader.save(config);
    p.log.success(`${isNew ? "Added" : "Updated"} alias "${aliasName}" → ${providerKey}/${modelId}`);
  }
}

async function showConfig(): Promise<void> {
  const config = ConfigReader.get();
  const authStore = AuthStore.getInstance();
  const lines: string[] = [];

  lines.push(`📁 Config: ${ConfigReader.getConfigPath()}`);
  lines.push(`🔐 Auth: ${authStore.getFilePath()}`);
  lines.push("");

  lines.push("🔐 Authentication:");
  const profiles = authStore.listProfiles();
  if (profiles.length === 0) {
    lines.push("  No credentials configured");
  } else {
    for (const { profile } of profiles) {
      if (profile.type === "api_key") {
        lines.push(`  ✅ ${profile.provider}: API Key (${maskApiKey(profile.api_key)})`);
      } else if (profile.type === "oauth") {
        const status = profile.access ? "✅" : "⚠️";
        const expires = profile.expires
          ? `expires ${new Date(profile.expires).toLocaleDateString()}`
          : "";
        lines.push(`  ${status} ${profile.provider}: OAuth ${expires}`);
      }
    }
  }

  lines.push("");
  lines.push("🤖 Providers & Models:");
  for (const [name, alias] of Object.entries(config.models || {})) {
    lines.push(`  ${name}: ${alias.provider}/${alias.model}`);
  }

  lines.push("");
  lines.push("🎯 Eve Settings:");
  lines.push(`  Default model: ${config.eve.model}`);

  lines.push("");
  lines.push("📧 Gmail Accounts:");
  try {
    await ensureAccountsInitialized();
    const accounts = await listAccounts();
    if (accounts.length === 0) {
      lines.push("  No accounts configured");
    } else {
      for (const a of accounts) {
        const primary = a.isPrimary ? "⭐" : " ";
        const auth = a.isAuthorized ? "✅" : "⚠️";
        lines.push(`  ${primary} ${auth} ${a.email}`);
      }
    }
  } catch {
    lines.push("  (Database not available)");
  }

  p.note(lines.join("\n"), "Current Configuration");
}
