import { Agent } from "@mariozechner/pi-agent-core";
import { ConfigReader } from "./config-reader";
import { RoutingEngine, type RoutingResult } from "./routing-engine";
import { AgentRegistry } from "./agent-registry";
import type { AgentRoom } from "./agent-room";
import { ContextStore, type ContextRecord } from "./context-store";
import { createEveAgent } from "./agent";
import type { ResolvedModel } from "./model-resolver";
import { ModelResolver } from "./model-resolver";
import type { EveConfig } from "./config-schema";

export type OrchestratorMode = "direct" | "orchestrator";

export interface OrchestratorTask {
  id: string;
  tag: string;
  payload?: unknown;
  contextIds?: string[];
  outputContextType?: string;
  outputContextTtlHours?: number;
}

export interface OrchestratorRequest {
  id?: string;
  text?: string;
  taskTags?: string[];
  tasks?: OrchestratorTask[];
  payload?: unknown;
  contextIds?: string[];
}

export interface OrchestratorResponse {
  requestId: string;
  mode: OrchestratorMode;
  results: TaskResult[];
  output: unknown;
}

export interface TaskResult {
  taskId: string;
  tag: string;
  routedAgentId: string;
  executedAgentId: string;
  output?: unknown;
  outputContextId?: string;
  route: RoutingResult;
  error?: OrchestratorError;
  allowEveFallback?: boolean;
}

export interface OrchestratorError {
  message: string;
  type: ErrorType;
  cause?: unknown;
}

export type ErrorType =
  | "rate_limit"
  | "timeout"
  | "connection_error"
  | "overloaded"
  | "invalid_api_key"
  | "content_policy"
  | "context_length_exceeded"
  | "unknown";

export interface AgentExecutionRequest {
  agentId: string;
  task: OrchestratorTask;
  model: ResolvedModel;
  systemPrompt: string;
  contexts: ContextRecord[];
}

export interface AgentExecutionResult {
  output: unknown;
}

export interface AgentExecutor {
  run(request: AgentExecutionRequest): Promise<AgentExecutionResult>;
}

export interface OrchestratorOptions {
  routingEngine?: RoutingEngine;
  agentRegistry?: AgentRegistry;
  contextStore?: ContextStore;
  executor?: AgentExecutor;
  config?: EveConfig;
  modelResolver?: ModelResolver;
  now?: () => Date;
  sleep?: (ms: number) => Promise<void>;
}

interface RetryPolicy {
  maxRetries: number;
  retryDelayMs: number;
  backoffMultiplier: number;
  maxDelayMs: number;
}

const DEFAULT_EVE_PROMPT = "You are Eve, a personal AI orchestrator.";

class DefaultAgentExecutor implements AgentExecutor {
  private agents = new Map<string, Agent>();

  async run(request: AgentExecutionRequest): Promise<AgentExecutionResult> {
    const agent = await this.getAgent(request);
    const prompt = this.buildPrompt(request);
    const output = await this.promptAgent(agent, prompt);
    return { output };
  }

  private async getAgent(request: AgentExecutionRequest): Promise<Agent> {
    const key = `${request.agentId}:${request.model.provider}:${request.model.modelId}`;
    const cached = this.agents.get(key);
    if (cached) return cached;

    const agent = await createEveAgent({
      systemPrompt: request.systemPrompt,
      provider: request.model.provider,
      model: request.model.modelId,
    });
    this.agents.set(key, agent);
    return agent;
  }

  private buildPrompt(request: AgentExecutionRequest): string {
    const payload = this.formatPayload(request.task.payload);
    const contextSection = request.contexts.length
      ? `\n\nContext:\n${JSON.stringify(request.contexts.map((ctx) => ({
          id: ctx.id,
          type: ctx.type,
          content: ctx.content,
        })), null, 2)}`
      : "";

    return [
      `Task: ${request.task.tag}`,
      payload ? `Payload:\n${payload}` : "",
      contextSection ? contextSection : "",
    ]
      .filter(Boolean)
      .join("\n\n");
  }

  private formatPayload(payload: unknown): string {
    if (payload === undefined) return "";
    if (typeof payload === "string") return payload;
    return JSON.stringify(payload, null, 2);
  }

  private async promptAgent(agent: Agent, prompt: string): Promise<string> {
    let fullResponse = "";

    const unsubscribe = agent.subscribe((event) => {
      if (
        event.type === "message_update" &&
        event.assistantMessageEvent?.type === "text_delta"
      ) {
        fullResponse += event.assistantMessageEvent.delta;
      }
    });

    await agent.prompt(prompt);
    unsubscribe();

    return fullResponse;
  }
}

export class EveOrchestrator {
  private routingEngine: RoutingEngine;
  private agentRegistry: AgentRegistry;
  private contextStore: ContextStore;
  private executor: AgentExecutor;
  private config: EveConfig;
  private modelResolver: ModelResolver;
  private now: () => Date;
  private sleep: (ms: number) => Promise<void>;

  constructor(options: OrchestratorOptions = {}) {
    this.routingEngine = options.routingEngine ?? new RoutingEngine();
    this.agentRegistry = options.agentRegistry ?? new AgentRegistry();
    this.config = options.config ?? ConfigReader.get();
    this.modelResolver = options.modelResolver ?? ConfigReader.getModelResolver();
    this.contextStore =
      options.contextStore ??
      new ContextStore({
        now: options.now,
        defaultExpiryHours: this.config.defaults?.context?.default_expiry_hours,
      });
    this.executor = options.executor ?? new DefaultAgentExecutor();
    this.now = options.now ?? (() => new Date());
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));

    this.routingEngine.setAgentRegistry(this.agentRegistry);
  }

  init(): void {
    this.agentRegistry.discoverAndLoad();
  }

  async handle(request: OrchestratorRequest): Promise<OrchestratorResponse> {
    const mode = this.config.eve.role;
    const tasks = this.buildTasks(request);

    const results = await Promise.all(
      tasks.map((task) => this.dispatchTask(task, request.text, mode))
    );

    return {
      requestId: request.id ?? `req_${this.now().getTime()}`,
      mode,
      results,
      output: this.aggregateResults(results),
    };
  }

  private buildTasks(request: OrchestratorRequest): OrchestratorTask[] {
    if (request.tasks && request.tasks.length > 0) {
      return request.tasks;
    }

    const tag = request.taskTags?.[0] ?? "generic:request";
    return [
      {
        id: `task_${this.now().getTime()}`,
        tag,
        payload: request.payload,
        contextIds: request.contextIds,
      },
    ];
  }

  private async dispatchTask(
    task: OrchestratorTask,
    text: string | undefined,
    mode: OrchestratorMode
  ): Promise<TaskResult> {
    const route = this.routingEngine.route(task.tag, text);
    const routedAgentId = route.agentId;

    if (mode === "direct" || routedAgentId === "eve") {
      return this.dispatchToEve(task, route);
    }

    if (!this.agentRegistry.hasAgent(routedAgentId)) {
      return this.dispatchToEve(task, route);
    }

    const result = await this.dispatchToAgent(routedAgentId, task, route);
    if (!result.error) return result;

    if (!this.config.eve.fallback || result.allowEveFallback === false) {
      return result;
    }

    return this.dispatchToEve(task, route, result.error);
  }

  private async dispatchToAgent(
    agentId: string,
    task: OrchestratorTask,
    route: RoutingResult
  ): Promise<TaskResult> {
    const agent = this.agentRegistry.getAgent(agentId);
    if (!agent) {
      return {
        taskId: task.id,
        tag: task.tag,
        routedAgentId: agentId,
        executedAgentId: "eve",
        route,
        error: {
          message: `Agent not found: ${agentId}`,
          type: "unknown",
        },
      };
    }

    const errorHandling = agent.config.error_handling;
    const modelCandidates =
      errorHandling.fallback_strategy === "use_fallback_model"
        ? this.getAgentModels(agent)
        : [agent.config.model.primary];
    const retryPolicy = this.getRetryPolicy(agent);
    const contexts = this.loadContexts(task.contextIds);

    if (errorHandling.fallback_strategy === "delegate_to_eve") {
      return {
        taskId: task.id,
        tag: task.tag,
        routedAgentId: agentId,
        executedAgentId: "eve",
        route,
        error: {
          message: `Agent ${agentId} configured to delegate to Eve`,
          type: "unknown",
        },
        allowEveFallback: true,
      };
    }

    for (const model of modelCandidates) {
      try {
        const output = await this.executeWithRetry(
          {
            agentId,
            task,
            model,
            systemPrompt: agent.systemPrompt,
            contexts,
          },
          retryPolicy,
          errorHandling.on_timeout
        );

        const outputContextId = task.outputContextType
          ? this.contextStore.create({
              type: task.outputContextType,
              content: output,
              agentId,
              parentIds: task.contextIds,
              ttlHours: task.outputContextTtlHours,
            }).id
          : undefined;

        return {
          taskId: task.id,
          tag: task.tag,
          routedAgentId: agentId,
          executedAgentId: agentId,
          route,
          output,
          outputContextId,
          allowEveFallback: errorHandling.fallback_strategy !== "fail",
        };
      } catch (error) {
        if (model !== modelCandidates[modelCandidates.length - 1]) {
          continue;
        }

        return {
          taskId: task.id,
          tag: task.tag,
          routedAgentId: agentId,
          executedAgentId: agentId,
          route,
          error: this.normalizeError(error),
          allowEveFallback: errorHandling.fallback_strategy !== "fail",
        };
      }
    }

    return {
      taskId: task.id,
      tag: task.tag,
      routedAgentId: agentId,
      executedAgentId: agentId,
      route,
      error: {
        message: `Agent ${agentId} failed without a result`,
        type: "unknown",
      },
      allowEveFallback: errorHandling.fallback_strategy !== "fail",
    };
  }

  private async dispatchToEve(
    task: OrchestratorTask,
    route: RoutingResult,
    error?: OrchestratorError
  ): Promise<TaskResult> {
    const models = this.modelResolver.resolveWithFallbacks(this.config.eve.model);
    const retryPolicy: RetryPolicy = {
      maxRetries: this.config.defaults?.retry?.max_retries ?? 3,
      retryDelayMs: this.config.defaults?.retry?.retry_delay_ms ?? 1000,
      backoffMultiplier: this.config.defaults?.retry?.backoff_multiplier ?? 2,
      maxDelayMs: this.config.defaults?.retry?.max_delay_ms ?? 30000,
    };

    const contexts = this.loadContexts(task.contextIds);
    const evePrompt = this.config.eve.system_prompt ?? DEFAULT_EVE_PROMPT;

    for (const model of models) {
      try {
        const output = await this.executeWithRetry(
          {
            agentId: "eve",
            task,
            model,
            systemPrompt: evePrompt,
            contexts,
          },
          retryPolicy,
          "retry"
        );

        return {
          taskId: task.id,
          tag: task.tag,
          routedAgentId: route.agentId,
          executedAgentId: "eve",
          route,
          output,
        };
      } catch (err) {
        if (model !== models[models.length - 1]) {
          continue;
        }

        return {
          taskId: task.id,
          tag: task.tag,
          routedAgentId: route.agentId,
          executedAgentId: "eve",
          route,
          error: error ?? this.normalizeError(err),
        };
      }
    }

    return {
      taskId: task.id,
      tag: task.tag,
      routedAgentId: route.agentId,
      executedAgentId: "eve",
      route,
      error: error ?? { message: "Eve failed to produce a result", type: "unknown" },
    };
  }

  private async executeWithRetry(
    request: AgentExecutionRequest,
    policy: RetryPolicy,
    onTimeout: "delegate_to_eve" | "retry" | "fail"
  ): Promise<unknown> {
    const maxAttempts = policy.maxRetries + 1;
    let attempt = 0;

    while (attempt < maxAttempts) {
      try {
        const result = await this.executor.run(request);
        return result.output;
      } catch (error) {
        const normalized = this.normalizeError(error);
        const isTimeout = normalized.type === "timeout";
        const retryable = this.isRetryable(normalized.type, onTimeout, isTimeout);

        attempt += 1;
        if (!retryable || attempt >= maxAttempts) {
          throw error;
        }

        const delay = this.calculateDelay(policy, attempt);
        await this.sleep(delay);
      }
    }

    throw new Error("Retry attempts exhausted");
  }

  private calculateDelay(policy: RetryPolicy, attempt: number): number {
    const baseDelay = policy.retryDelayMs * Math.pow(policy.backoffMultiplier, attempt - 1);
    return Math.min(baseDelay, policy.maxDelayMs);
  }

  private isRetryable(
    type: ErrorType,
    onTimeout: "delegate_to_eve" | "retry" | "fail",
    isTimeout: boolean
  ): boolean {
    if (isTimeout && onTimeout !== "retry") {
      return false;
    }

    return ["rate_limit", "timeout", "connection_error", "overloaded"].includes(type);
  }

  private normalizeError(error: unknown): OrchestratorError {
    if (typeof error === "string") {
      return { message: error, type: this.classifyError(error) };
    }

    if (error && typeof error === "object") {
      const candidate = error as { message?: string; code?: string; type?: string };
      const message = candidate.message ?? "Unknown error";
      const type = this.classifyError(candidate.type ?? candidate.code ?? message);
      return { message, type, cause: error };
    }

    return { message: "Unknown error", type: "unknown", cause: error };
  }

  private classifyError(value: string): ErrorType {
    const normalized = value.toLowerCase();
    if (normalized.includes("rate")) return "rate_limit";
    if (normalized.includes("timeout")) return "timeout";
    if (normalized.includes("connection")) return "connection_error";
    if (normalized.includes("overload")) return "overloaded";
    if (normalized.includes("invalid") || normalized.includes("auth")) return "invalid_api_key";
    if (normalized.includes("policy")) return "content_policy";
    if (normalized.includes("context") && normalized.includes("length")) return "context_length_exceeded";
    return "unknown";
  }

  private loadContexts(ids?: string[]): ContextRecord[] {
    if (!ids || ids.length === 0) return [];
    return ids
      .map((id) => this.contextStore.get(id))
      .filter((record): record is ContextRecord => record !== null);
  }

  private getAgentModels(agent: AgentRoom): ResolvedModel[] {
    const primaryAlias = agent.config.model.primary.alias;
    const models: ResolvedModel[] = [agent.config.model.primary];

    if (agent.config.model.fallback && agent.config.model.fallback.alias !== primaryAlias) {
      models.push(agent.config.model.fallback);
    }

    for (const fallbackAlias of this.modelResolver.getFallbackChain(primaryAlias)) {
      if (models.some((model) => model.alias === fallbackAlias)) {
        continue;
      }

      try {
        models.push(this.modelResolver.resolve(fallbackAlias));
      } catch (error) {
        console.warn(
          `⚠️ Fallback model "${fallbackAlias}" for agent "${agent.id}" failed to resolve: ` +
            (error instanceof Error ? error.message : String(error))
        );
      }
    }

    return models;
  }

  private getRetryPolicy(agent: AgentRoom): RetryPolicy {
    const defaults = this.config.defaults?.retry;
    return {
      maxRetries: agent.config.error_handling.max_retries,
      retryDelayMs: agent.config.error_handling.retry_delay_ms,
      backoffMultiplier: defaults?.backoff_multiplier ?? 2,
      maxDelayMs: defaults?.max_delay_ms ?? 30000,
    };
  }

  private aggregateResults(results: TaskResult[]): unknown {
    if (results.length === 1) {
      return results[0].output ?? results[0].error;
    }

    const merged: Record<string, unknown> = {};
    for (const result of results) {
      merged[result.taskId] = result.output ?? result.error;
    }
    return merged;
  }
}
