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

/**
 * Produce a compact, display-safe representation of an API key.
 *
 * @param key - The API key to mask
 * @returns The masked key: `****` if `key` length is 8 or fewer characters, otherwise the first 4 characters, `...`, and the last 4 characters
 */
function maskApiKey(key: string): string {
  if (key.length <= 8) return "****";
  return key.slice(0, 4) + "..." + key.slice(-4);
}

function isCancel(value: unknown): value is symbol {
  return p.isCancel(value);
}

/**
 * Launches the interactive CLI configuration flow for Eve.
 *
 * Presents a main menu that lets the user manage authentication credentials, providers and model aliases, Gmail accounts, or view the current configuration; the flow runs until the user selects "Done" or cancels.
 */
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

/**
 * Prompts the user to select an API-key-based provider, collects an API key, and persists it.
 *
 * Saves the key in the AuthStore under the profile name `<provider>:api-key` and, if the provider
 * is not present in the Eve configuration, adds a provider entry to eve.json with `base_url: null`.
 */
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
    provider: provider as any,
    api_key: apiKeyValue,
  } as AuthProfile);

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

/**
 * Display a summary of stored authentication profiles to the user.
 *
 * Prints a note listing each configured credential: for API-key profiles shows the provider and a masked API key; for OAuth profiles shows the provider, authorization status, and expiry date if available. If no credentials exist, shows a "No credentials configured." note.
 */
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

/**
 * Interactively removes a stored authentication profile.
 *
 * Prompts the user to select a credential to delete, asks for confirmation, removes the selected profile from the credential store, and logs the outcome. If no credentials exist or the user cancels, the function returns without changes.
 */
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

/**
 * Presents an interactive menu for managing providers and model aliases and repeats until the user chooses Back or cancels.
 */
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
        { value: "set_default", label: "⭐ Set Default Model", hint: config.eve.model },
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
      case "set_default":
        await setDefaultModelMenu();
        break;
    }
  }
}

async function setDefaultModelMenu(): Promise<void> {
  const config = ConfigReader.get();
  const aliasOptions = Object.entries(config.models).map(([name, def]) => ({
    value: name,
    label: name,
    hint: `${def.provider}/${def.model}`,
  }));

  if (aliasOptions.length === 0) {
    p.log.warn("No aliases configured. Add one first.");
    return;
  }

  const selection = await p.select({
    message: "Select default model for Eve",
    options: [...aliasOptions, { value: "back", label: "← Back" }],
  });

  if (isCancel(selection) || selection === "back") return;

  config.eve.model = selection as string;
  ConfigReader.save(config);
  p.log.success(`Default model set to "${selection}"`);
}

/**
 * Interactively add a supported provider to the Eve configuration.
 *
 * Prompts the user to select an unconfigured provider, optionally collects an API URL and/or API key as required by the provider, persists credentials to auth.json and provider settings to eve.json, and offers to configure a model alias for the new provider. Gracefully aborts if the user cancels any prompt and warns if all supported providers are already configured.
 */
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
    const hasKey = !!authStore.getApiKey(providerKey);

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
      } as AuthProfile);
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

/**
 * Presents an interactive menu to edit a configured provider's settings and saves any changes to the persisted configuration.
 *
 * Allows updating the provider's API URL and request timeout:
 * - API URL: accepts a valid URL or an empty value to clear the URL (saved as `null`).
 * - Timeout (ms): accepts a non-negative integer number of milliseconds.
 */
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

/**
 * Interactively removes a configured provider from the project's eve.json and optionally removes its stored credentials.
 *
 * Prompts the user to select a provider to remove; if selected, warns about any model aliases that reference the provider,
 * asks for confirmation, deletes the provider entry from the configuration and persists the change, and then optionally
 * removes any matching credential profiles from auth.json. User cancelation at any prompt aborts the operation.
 */
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
    p.log.warn(`Warning: The following aliases use this provider and will be removed: ${affectedAliases.join(", ")}`);
  }

  const confirm = await p.confirm({
    message: `Are you sure you want to remove ${providerKey}${affectedAliases.length > 0 ? " and its associated aliases" : ""}?`,
  });

  if (isCancel(confirm) || !confirm) return;

  // Cleanup aliases and update default model if necessary
  for (const alias of affectedAliases) {
    delete config.models[alias];
  }

  if (affectedAliases.includes(config.eve.model)) {
    config.eve.model = "smart";
    p.log.info("Default model alias was removed; reset to 'smart'.");
  }

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

/**
 * Interactively add or update model aliases in the Eve configuration.
 *
 * Runs a prompt-driven loop that lets the user create new aliases or edit existing ones by
 * selecting a provider and choosing a model (from provider-specific presets or by entering a
 * model ID manually). Alias names are validated (required, unique, alphanumeric/underscore).
 * The flow requires at least one configured provider and indicates whether credentials exist for
 * each provider. Changes are persisted to the configuration and a success message is shown when
 * an alias is added or updated. The loop exits when the user selects Back or cancels.
 */
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
        ...providers.map((p) => {
          const meta = SUPPORTED_PROVIDERS.find((sp) => sp.key === p);
          let hint = "";
          if (meta && !meta.requiresKey) {
            hint = "no credentials required";
          } else if (authStore.hasAuth(p)) {
            hint = "✅ credentials found";
          } else {
            hint = "⚠️ no credentials";
          }
          return { value: p, label: p, hint };
        }),
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

/**
 * Display a human-readable snapshot of the current Eve configuration to the user.
 *
 * Gathers configuration and authentication data, then shows:
 * - paths to config and auth files,
 * - configured credentials (API keys are masked, OAuth entries include authorization status and expiry if available),
 * - configured model aliases (alias → provider/model),
 * - Eve settings (default model),
 * - Gmail accounts (primary and authorization status).
 * If the Gmail accounts database is unavailable, indicates that state.
 */
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