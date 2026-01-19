import { Type } from "@sinclair/typebox";
import type { AgentTool } from "@mariozechner/pi-agent-core";
import { analyzePendingJobs } from "../services/jobs-service";

export const analyzeJobsTool: AgentTool<any, any> = {
  name: "jobs_analyze",
  label: "Analyze Jobs",
  description: "Analyze job descriptions against the user's resume using LLM. Generates match scores and recommendations.",
  parameters: Type.Object({
    limit: Type.Optional(Type.Number({ description: "Maximum number of jobs to analyze (processes all if not specified)" })),
  }),
  execute: async (_toolCallId, params, _signal, onUpdate) => {
    onUpdate?.({
      content: [{ type: "text", text: "Starting AI analysis of jobs..." }],
      details: { status: "starting" }
    });

    const result = await analyzePendingJobs(params.limit);

    onUpdate?.({
      content: [{ type: "text", text: `Analyzed ${result.analyzed} of ${result.processed} jobs` }],
      details: result
    });

    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      details: result,
    };
  },
};
