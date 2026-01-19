import { Type } from "@sinclair/typebox";
import type { AgentTool } from "@mariozechner/pi-agent-core";
import { enrichPendingJobs } from "../services/jobs-service";

export const enrichJobsTool: AgentTool<any, any> = {
  name: "jobs_enrich",
  label: "Enrich Jobs",
  description: "Fetch full job descriptions from job URLs using Firecrawl. This enriches jobs that don't have descriptions yet.",
  parameters: Type.Object({
    limit: Type.Optional(Type.Number({ description: "Maximum number of jobs to enrich (processes all if not specified)" })),
  }),
  execute: async (_toolCallId, params, _signal, onUpdate) => {
    onUpdate?.({
      content: [{ type: "text", text: "Starting job enrichment with Firecrawl..." }],
      details: { status: "starting" }
    });

    const result = await enrichPendingJobs(params.limit);

    onUpdate?.({
      content: [{ type: "text", text: `Enriched ${result.enriched} of ${result.processed} jobs` }],
      details: result
    });

    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      details: result,
    };
  },
};
