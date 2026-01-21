import type { EveConfig } from "./src/core/config-schema";
import type { AgentRoom } from "./src/core/agent-room";
import type {
  AgentExecutor,
  AgentExecutionRequest,
  OrchestratorTask,
} from "./src/core/orchestrator";
import { EveOrchestrator } from "./src/core/orchestrator";
import { RoutingEngine } from "./src/core/routing-engine";
import { ContextStore } from "./src/core/context-store";
import { ProviderRegistry } from "./src/core/provider-registry";
import { ModelResolver } from "./src/core/model-resolver";
import type { AgentRegistry } from "./src/core/agent-registry";

const config: EveConfig = {
  providers: {
    test: {
      base_url: "http://localhost:1234",
    },
  },
  models: {
    fast: { provider: "test", model: "fast-model" },
    smart: { provider: "test", model: "smart-model" },
  },
  model_fallback_chain: {
    smart: ["fast"],
  },
  agents: {
    enabled: ["analyst"],
    auto_discover: false,
  },
  routing: {
    tasks: [
      { pattern: "jobs:*", agent: "analyst", priority: 90 },
      { pattern: "generic:*", agent: "eve", priority: 10 },
    ],
  },
  eve: {
    model: "smart",
    role: "orchestrator",
    fallback: true,
    system_prompt: "You are Eve in test mode.",
  },
  defaults: {
    retry: {
      max_retries: 1,
      retry_delay_ms: 5,
      backoff_multiplier: 1,
      max_delay_ms: 10,
    },
    memory: {
      short_term_retention_days: 7,
      long_term_max_size_kb: 512,
    },
    context: {
      default_expiry_hours: 1,
      compression: "json",
    },
  },
};

const providerRegistry = new ProviderRegistry(config);
const modelResolver = new ModelResolver(config, providerRegistry);

const analystRoom = {
  id: "analyst",
  name: "Analyst",
  systemPrompt: "You are a test analyst.",
  hasResponsibility: (taskTag: string) => taskTag.startsWith("jobs:"),
  config: {
    id: "analyst",
    name: "Analyst",
    responsibilities: ["jobs:*"],
    model: {
      primary: modelResolver.resolve("smart"),
      fallback: modelResolver.resolve("fast"),
      temperature: 0.2,
      thinking: "low",
    },
    error_handling: {
      max_retries: 1,
      retry_delay_ms: 5,
      fallback_strategy: "use_fallback_model",
      on_timeout: "retry",
    },
  },
} as AgentRoom;

class InMemoryAgentRegistry {
  private agents = new Map<string, AgentRoom>();

  constructor(agentRooms: AgentRoom[]) {
    for (const room of agentRooms) {
      this.agents.set(room.id, room);
    }
  }

  discoverAndLoad(): void {}

  getAgent(id: string): AgentRoom | undefined {
    return this.agents.get(id);
  }

  hasAgent(id: string): boolean {
    return this.agents.has(id);
  }

  getAllAgents(): AgentRoom[] {
    return Array.from(this.agents.values());
  }

  listAgents(): string[] {
    return Array.from(this.agents.keys());
  }
}

class FakeExecutor implements AgentExecutor {
  private attempts = new Map<string, number>();

  async run(request: AgentExecutionRequest) {
    const key = `${request.agentId}:${request.task.id}`;
    const count = this.attempts.get(key) ?? 0;
    this.attempts.set(key, count + 1);

    if (request.agentId === "analyst" && request.task.id === "task_retry" && count === 0) {
      throw { type: "rate_limit", message: "rate limit" };
    }

    if (request.agentId === "analyst" && request.task.id === "task_fallback") {
      throw { type: "content_policy", message: "policy" };
    }

    return {
      output: {
        agent: request.agentId,
        model: request.model.alias,
        task: request.task.tag,
        contexts: request.contexts.map((ctx) => ctx.id),
      },
    };
  }
}

const routingEngine = new RoutingEngine();
const contextStore = new ContextStore({ defaultExpiryHours: 1 });
const registry = new InMemoryAgentRegistry([analystRoom]) as unknown as AgentRegistry;

const orchestrator = new EveOrchestrator({
  routingEngine,
  agentRegistry: registry,
  contextStore,
  executor: new FakeExecutor(),
  config,
  modelResolver,
});

orchestrator.init();

const context = contextStore.create({
  type: "job",
  content: { title: "Test Engineer" },
});

const tasks: OrchestratorTask[] = [
  {
    id: "task_retry",
    tag: "jobs:analyze",
    payload: { jobId: 1 },
    contextIds: [context.id],
  },
  {
    id: "task_fallback",
    tag: "jobs:tailor",
    payload: { resumeId: 2 },
  },
];

const response = await orchestrator.handle({
  id: "req_test",
  text: "analyze and tailor",
  tasks,
});

console.log(JSON.stringify(response, null, 2));
