import { Type } from "@sinclair/typebox";
import type { AgentTool } from "@mariozechner/pi-agent-core";
import { syncEmails } from "../services/email-service";

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
    try {
      const query = params.query || "from:linkedin OR from:indeed";
      const maxThreads = params.maxThreads || 20;

      const result = await syncEmails(query, maxThreads, (progress) => {
        let text = "";
        if (progress.status === 'searching') text = "Searching for emails...";
        else if (progress.status === 'processing') text = `Processing emails: ${progress.synced}/${progress.total}`;
        
        if (text) {
          onUpdate?.({
            content: [{ type: "text", text }],
            details: progress
          });
        }
      });

      const summary = `✅ Sync complete!\n\n- Emails found: ${result.synced}\n- Jobs saved: ${result.newJobs}\n\nRun 'jobs_list' to see your job opportunities.`;

      return {
        content: [{ type: "text", text: summary }],
        details: { 
          status: "complete",
          emailsFound: result.synced,
          jobsSaved: result.newJobs,
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
