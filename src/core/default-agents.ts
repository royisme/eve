import { existsSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { getDataDir } from "./data-dir";

interface DefaultAgentConfig {
  id: string;
  name: string;
  version: string;
  role: {
    description: string;
    personality?: string;
    system_prompt?: string;
  };
  model: {
    primary: string;
    fallback?: string;
    temperature?: number;
    thinking?: string;
  };
  responsibilities: string[];
  permissions?: {
    tools?: {
      allow?: string[];
      deny?: string[];
    };
    capabilities?: string[];
    can_delegate?: boolean;
    can_access_context?: boolean;
  };
}

const DEFAULT_AGENTS: DefaultAgentConfig[] = [
  {
    id: "analyst",
    name: "Job Analyst",
    version: "1.0.0",
    role: {
      description: "Analyzes job postings and evaluates candidate fit",
      personality: "Analytical, thorough, honest about gaps",
      system_prompt:
        "You are a senior recruiter and career coach. Analyze job postings thoroughly and provide honest feedback about candidate fit.",
    },
    model: {
      primary: "smart",
      fallback: "fast",
      temperature: 0.3,
      thinking: "medium",
    },
    responsibilities: [
      "jobs:analyze",
      "jobs:analyze-single",
      "jobs:prescore",
      "jobs:tailor",
    ],
    permissions: {
      tools: {
        allow: ["jobs_*", "resume_get"],
        deny: ["email_*", "system_*"],
      },
      capabilities: ["jobs", "resume"],
      can_delegate: false,
      can_access_context: true,
    },
  },
  {
    id: "extractor",
    name: "Data Extractor",
    version: "1.0.0",
    role: {
      description: "Extracts and normalizes data from various sources",
      system_prompt:
        "You are a data extraction specialist. Parse and extract structured information from unstructured text quickly and accurately.",
    },
    model: {
      primary: "fast",
    },
    responsibilities: [
      "jobs:search",
      "jobs:list",
      "jobs:enrich",
      "jobs:extract",
      "email:*",
    ],
    permissions: {
      tools: {
        allow: ["jobs_*", "email_*"],
      },
      capabilities: ["jobs", "email"],
      can_delegate: false,
    },
  },
];

export function ensureDefaultAgents(): void {
  const agentsDir = join(getDataDir(), "agents");

  if (!existsSync(agentsDir)) {
    mkdirSync(agentsDir, { recursive: true });
    console.log(`📁 Created agents directory: ${agentsDir}`);
  }

  for (const agent of DEFAULT_AGENTS) {
    const agentDir = join(agentsDir, agent.id);
    const agentConfigPath = join(agentDir, "agent.json");

    if (!existsSync(agentConfigPath)) {
      if (!existsSync(agentDir)) {
        mkdirSync(agentDir, { recursive: true });
      }
      writeFileSync(agentConfigPath, JSON.stringify(agent, null, 2), "utf-8");
      console.log(`📝 Created default agent: ${agent.id}`);
    }
  }
}

export function getDefaultAgentIds(): string[] {
  return DEFAULT_AGENTS.map((a) => a.id);
}
