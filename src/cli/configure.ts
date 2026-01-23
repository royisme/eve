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
        await handleProviders();
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

async function handleProviders(): Promise<void> {
  const config = ConfigReader.get();

  p.note("Configure which provider/model to use for different tasks.", "Providers & Models");

  const currentModel = config.eve.model;

  const models = Object.entries(config.models || {}).map(([name, alias]) => ({
    value: name,
    label: `${name}: ${alias.provider}/${alias.model}`,
  }));

  const selectedModel = await p.select({
    message: "Select default model for Eve",
    options: [...models, { value: "back", label: "← Back" }],
  });

  if (isCancel(selectedModel) || selectedModel === "back") return;

  config.eve.model = selectedModel as string;
  ConfigReader.save(config);

  p.log.success(`Default model set to ${selectedModel}`);
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
