import { Type } from "@sinclair/typebox";
import type { AgentTool } from "@mariozechner/pi-agent-core";
import { GmailSource } from "../../../core/gmail";
import { JobModule } from "../../../modules/jobs";
import { getFullAuthStatus } from "../services/email-service";

export const emailSyncTool: AgentTool<any, any> = {
  name: "email_sync",
  label: "Sync Emails",
  description: "Sync job-related emails from Gmail. Searches for recruitment emails and extracts job opportunities.",
  parameters: Type.Object({
    query: Type.Optional(Type.String({ 
      description: "Gmail search query (default: 'from:linkedin OR from:indeed')" 
    })),
    maxThreads: Type.Optional(Type.Number({ 
      description: "Maximum threads to fetch per account (default: 20)" 
    })),
  }),
  execute: async (_toolCallId, params, _signal, onUpdate) => {
    const status = await getFullAuthStatus();
    
    if (!status.installed) {
      return {
        content: [{ type: "text", text: "❌ gog CLI is not installed. Please install it first." }],
        details: { error: "gog_not_installed" },
      };
    }

    const authorizedAccounts = status.accounts.filter(a => a.authorized);
    if (authorizedAccounts.length === 0) {
      return {
        content: [{ 
          type: "text", 
          text: "❌ No authorized Gmail accounts. Please run email_setup first to authorize an account." 
        }],
        details: { error: "no_authorized_accounts" },
      };
    }

    onUpdate?.({
      content: [{ type: "text", text: `Syncing emails from ${authorizedAccounts.length} account(s)...` }],
      details: { status: "syncing", accounts: authorizedAccounts.map(a => a.email) }
    });

    const query = params.query || "from:linkedin OR from:indeed";
    const maxThreads = params.maxThreads || 20;

    try {
      const gmail = new GmailSource();
      const emails = await gmail.search(query, maxThreads);

      onUpdate?.({
        content: [{ type: "text", text: `Found ${emails.length} emails. Processing...` }],
        details: { status: "processing", emailCount: emails.length }
      });

      const jobModule = new JobModule();
      let processed = 0;
      let saved = 0;

      for (const email of emails) {
        try {
          await jobModule.handle(email);
          saved++;
        } catch (e) {
          console.error(`Error processing email: ${e}`);
        }
        processed++;
      }

      const summary = `✅ Sync complete!\n\n- Emails found: ${emails.length}\n- Jobs saved: ${saved}\n\nRun 'jobs_list' to see your job opportunities.`;

      return {
        content: [{ type: "text", text: summary }],
        details: { 
          status: "complete",
          emailsFound: emails.length,
          jobsSaved: saved,
        },
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `❌ Sync failed: ${(error as Error).message}` }],
        details: { error: (error as Error).message },
      };
    }
  },
};
