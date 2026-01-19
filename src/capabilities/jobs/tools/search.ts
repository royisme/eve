import { Type } from "@sinclair/typebox";
import type { AgentTool } from "@mariozechner/pi-agent-core";
import { searchJobs } from "../services/jobs-service";

export const searchJobsTool: AgentTool<any, any> = {
  name: "jobs_search",
  label: "Search Jobs",
  description: "Search for job opportunities by keyword, company name, or role. Returns matching jobs from the database.",
  parameters: Type.Object({
    query: Type.Optional(Type.String({ description: "Search terms to match against company or role" })),
    status: Type.Optional(Type.String({ description: "Filter by job status: New, Applied, Interview, Rejected, Offer" })),
    limit: Type.Optional(Type.Number({ description: "Maximum number of results to return (default: 20)" })),
  }),
  execute: async (_toolCallId, params, _signal, onUpdate) => {
    onUpdate?.({
      content: [{ type: "text", text: "Searching jobs..." }],
      details: { status: "searching" }
    });

    const results = await searchJobs({
      query: params.query,
      status: params.status,
      limit: params.limit,
    });

    return {
      content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
      details: { count: results.length, results },
    };
  },
};
