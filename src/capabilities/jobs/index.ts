import type { Capability } from "../types";
import { searchJobsTool } from "./tools/search";
import { enrichJobsTool } from "./tools/enrich";
import { analyzeJobsTool, analyzeJobTool, jobPreScoreTool } from "./tools/analyze";
import { listJobsTool } from "./tools/list";

export const jobsCapability: Capability = {
  name: "jobs",
  description: "Job hunting capabilities - search, analyze, and track job opportunities",
  tools: [searchJobsTool, listJobsTool, enrichJobsTool, analyzeJobsTool, analyzeJobTool, jobPreScoreTool],
};
