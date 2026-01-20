import { Type } from "@sinclair/typebox";
import type { AgentTool } from "@mariozechner/pi-agent-core";
import {
  listAccounts,
  setPrimaryAccount,
  addAccount,
  removeAccount,
} from "../services/account-service";

export const emailAccountsListTool: AgentTool<any, any> = {
  name: "email_accounts_list",
  label: "List Email Accounts",
  description: "List all configured email accounts with their status (primary, authorized, last sync time).",
  parameters: Type.Object({}),
  execute: async (_toolCallId, _params, _signal, onUpdate) => {
    onUpdate?.({
      content: [{ type: "text", text: "Fetching email accounts..." }],
      details: { status: "fetching" }
    });

    const accounts = await listAccounts();

    if (accounts.length === 0) {
      return {
        content: [{ 
          type: "text", 
          text: "📧 No email accounts configured.\n\nUse `email_setup` to add a Gmail account." 
        }],
        details: { accounts: [] },
      };
    }

    let text = "📧 **Email Accounts**\n\n";
    for (const acc of accounts) {
      const icons = [
        acc.isPrimary ? "⭐" : "",
        acc.isAuthorized ? "✅" : "⚠️",
      ].filter(Boolean).join(" ");
      
      text += `- ${icons} **${acc.email}**`;
      if (acc.alias) text += ` (${acc.alias})`;
      text += "\n";
      
      if (acc.lastSyncAt) {
        text += `  Last sync: ${acc.lastSyncAt}\n`;
      }
    }
    
    text += "\n_Legend: ⭐ = Primary, ✅ = Authorized, ⚠️ = Needs authorization_";

    return {
      content: [{ type: "text", text }],
      details: { accounts },
    };
  },
};

export const emailSetPrimaryTool: AgentTool<any, any> = {
  name: "email_set_primary",
  label: "Set Primary Email",
  description: "Set an email account as the primary account for syncing.",
  parameters: Type.Object({
    email: Type.String({ description: "Email address to set as primary" }),
  }),
  execute: async (_toolCallId, params, _signal, _onUpdate) => {
    const { email } = params;

    const accounts = await listAccounts();
    const account = accounts.find(a => a.email.toLowerCase() === email.toLowerCase());

    if (!account) {
      return {
        content: [{ 
          type: "text", 
          text: `❌ Account not found: ${email}\n\nUse \`email_accounts_list\` to see available accounts.` 
        }],
        details: { error: "Account not found" },
      };
    }

    await setPrimaryAccount(email);

    return {
      content: [{ type: "text", text: `⭐ Set **${email}** as the primary account.` }],
      details: { email, isPrimary: true },
    };
  },
};

export const emailAccountAddTool: AgentTool<any, any> = {
  name: "email_account_add",
  label: "Add Email Account",
  description: "Add a new email account to the system (does not authorize - use email_setup for that).",
  parameters: Type.Object({
    email: Type.String({ description: "Email address to add" }),
    alias: Type.Optional(Type.String({ description: "Friendly name for this account (e.g., 'Work', 'Personal')" })),
    isPrimary: Type.Optional(Type.Boolean({ description: "Set as primary account (default: false)" })),
  }),
  execute: async (_toolCallId, params, _signal, _onUpdate) => {
    const { email, alias, isPrimary } = params;

    if (!email.includes("@")) {
      return {
        content: [{ type: "text", text: "❌ Please provide a valid email address." }],
        details: { error: "Invalid email" },
      };
    }

    const account = await addAccount(email, { alias, isPrimary });

    return {
      content: [{ 
        type: "text", 
        text: `✅ Added account: **${email}**${alias ? ` (${alias})` : ""}${account.isPrimary ? " ⭐ Primary" : ""}\n\nUse \`email_setup\` to authorize this account for Gmail access.` 
      }],
      details: { account },
    };
  },
};

export const emailAccountRemoveTool: AgentTool<any, any> = {
  name: "email_account_remove",
  label: "Remove Email Account",
  description: "Remove an email account from the system.",
  parameters: Type.Object({
    email: Type.String({ description: "Email address to remove" }),
  }),
  execute: async (_toolCallId, params, _signal, _onUpdate) => {
    const { email } = params;

    await removeAccount(email);

    return {
      content: [{ type: "text", text: `🗑️ Removed account: **${email}**` }],
      details: { email, removed: true },
    };
  },
};

export const accountTools = [
  emailAccountsListTool,
  emailSetPrimaryTool,
  emailAccountAddTool,
  emailAccountRemoveTool,
];
