import { Type } from "@sinclair/typebox";
import type { AgentTool } from "@mariozechner/pi-agent-core";
import { searchJobs, getJobStats } from "../services/jobs-service";

export const listJobsTool: AgentTool<any, any> = {
  name: "jobs_list",
  label: "List Jobs",
  description: "List recent job opportunities with optional status filter. Also returns overall statistics.",
  parameters: Type.Object({
    status: Type.Optional(Type.String({ description: "Filter by status: inbox, applied, interviewing, rejected, offer, skipped" })),
    limit: Type.Optional(Type.Number({ description: "Maximum jobs to list (default: 20)" })),
  }),
  execute: async (_toolCallId, params, _signal, onUpdate) => {
    onUpdate?.({
      content: [{ type: "text", text: "Fetching job list..." }],
      details: { status: "fetching" }
    });

    const [jobs, stats] = await Promise.all([
      searchJobs({ status: params.status, limit: params.limit }),
      getJobStats(),
    ]);

    return {
      content: [{ type: "text", text: JSON.stringify({ stats, jobs }, null, 2) }],
      details: { jobCount: jobs.length, stats, jobs },
    };
  },
};
