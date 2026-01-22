import { Agent } from "@mariozechner/pi-agent-core";
import { getModel } from "@mariozechner/pi-ai";
import { jobsCapability } from "./index";
import { resumeCapability } from "../resume";
import { AuthStore } from "../../core/auth-store";

export interface JobsAgentConfig {
  showThinking?: boolean;
}

const JOBS_SYSTEM_PROMPT = `You are an expert job hunting assistant. Your role is to help users:

1. **Analyze Jobs**: Evaluate job postings against user's skills and experience
2. **Search & Filter**: Find relevant opportunities based on preferences
3. **Resume Tailoring**: Customize resumes for specific job applications
4. **Provide Insights**: Offer strategic advice on job fit, compensation, and career growth

You have access to the user's resume and job history. Be direct, actionable, and data-driven.

When analyzing a job:
- Start with a quick fit assessment (High/Medium/Low)
- Identify key matching skills and gaps
- Provide specific resume tailoring suggestions
- Note any red flags or highlights

Always be honest about poor fits - the user's time is valuable.`;

const DEFAULT_PROVIDER = "anthropic";
const DEFAULT_MODEL = "claude-sonnet-4-20250514";

async function getApiKey(provider: string): Promise<string | undefined> {
  const authStore = AuthStore.getInstance();
  const fromAuth = authStore.getApiKey(provider.toLowerCase());
  if (fromAuth) return fromAuth;

  const envKeys: Record<string, string[]> = {
    anthropic: ["ANTHROPIC_API_KEY"],
    openai: ["OPENAI_API_KEY"],
    google: ["GOOGLE_API_KEY"],
  };

  for (const envKey of envKeys[provider.toLowerCase()] || []) {
    if (process.env[envKey]) return process.env[envKey];
  }

  return undefined;
}

export async function createJobsAgent(config: JobsAgentConfig = {}): Promise<Agent> {
  const resumeReadTools = resumeCapability.tools.filter((t) =>
    ["resume_get", "resume_list", "resume_set_default"].includes(t.name)
  );

  const tools = [...jobsCapability.tools, ...resumeReadTools];

  console.log(`[JobsAgent] Creating agent with ${tools.length} tools`);

  const agent = new Agent({
    getApiKey,
    initialState: {
      systemPrompt: JOBS_SYSTEM_PROMPT,
      model: getModel(
        DEFAULT_PROVIDER as Parameters<typeof getModel>[0],
        DEFAULT_MODEL as Parameters<typeof getModel>[1]
      ),
      tools,
    },
  });

  return agent;
}
