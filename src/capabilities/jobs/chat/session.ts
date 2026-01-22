import type { Agent } from "@mariozechner/pi-agent-core";
import { createJobsAgent } from "../agent";
import type { JobsChatRequest, ToolInvocation } from "./types";
import type { AISDKStreamAdapter } from "./stream-adapter";
import { JobsChatHistory } from "./history";

const PERSIST_INTERVAL_MS = 5000;

function generateId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

const activeSessions = new Map<string, JobsChatSession>();

export class JobsChatSession {
  private request: JobsChatRequest;
  private agent: Agent | null = null;
  private messageId: string;
  private conversationId: string;
  private abortController: AbortController;

  private isReasoning = false;
  private reasoningContent = "";
  private textContent = "";
  private toolInvocations: ToolInvocation[] = [];

  private persistInterval: ReturnType<typeof setInterval> | null = null;

  constructor(request: JobsChatRequest) {
    this.request = request;
    this.messageId = generateId("msg");
    this.conversationId = request.options?.conversationId || generateId("conv");
    this.abortController = new AbortController();

    activeSessions.set(this.messageId, this);
  }

  static stop(messageId: string): boolean {
    const session = activeSessions.get(messageId);
    if (session) {
      session.abort();
      return true;
    }
    return false;
  }

  abort(): void {
    this.abortController.abort();
  }

  getMessageId(): string {
    return this.messageId;
  }

  getConversationId(): string {
    return this.conversationId;
  }

  async run(adapter: AISDKStreamAdapter): Promise<void> {
    try {
      this.agent = await createJobsAgent({
        showThinking: this.request.options?.showThinking !== false,
      });

      await adapter.sendMessageStart(this.messageId);

      const prompt = this.buildPrompt();

      this.startPeriodicPersist();

      const unsubscribe = this.agent.subscribe((event: unknown) => {
        this.handleAgentEvent(event as AgentEvent, adapter);
      });

      await this.agent.prompt(prompt);

      unsubscribe();

      if (adapter.isTextOpen) {
        await adapter.sendTextEnd();
      }
      if (adapter.isReasoningOpen) {
        await adapter.sendReasoningEnd();
      }

      await adapter.sendMessageEnd(this.messageId, "stop");

      await this.persistMessage("stop");
    } catch (error) {
      if (this.abortController.signal.aborted) {
        await adapter.sendMessageEnd(this.messageId, "stop");
        await this.persistMessage("stop");
      } else {
        await adapter.sendError(
          "internal_error",
          error instanceof Error ? error.message : "Unknown error"
        );
        await this.persistMessage("error");
      }
    } finally {
      this.stopPeriodicPersist();
      activeSessions.delete(this.messageId);
      adapter.close();
    }
  }

  private startPeriodicPersist(): void {
    this.persistInterval = setInterval(async () => {
      await this.persistPartialMessage();
    }, PERSIST_INTERVAL_MS);
  }

  private stopPeriodicPersist(): void {
    if (this.persistInterval) {
      clearInterval(this.persistInterval);
      this.persistInterval = null;
    }
  }

  private async persistPartialMessage(): Promise<void> {
    if (!this.textContent && !this.reasoningContent) return;

    await JobsChatHistory.upsert(this.conversationId, {
      id: this.messageId,
      role: "assistant",
      content: this.textContent,
      reasoning: this.reasoningContent || undefined,
      toolCalls: this.toolInvocations.length > 0 ? this.toolInvocations : undefined,
      timestamp: new Date().toISOString(),
    });
  }

  private async persistMessage(finishReason: "stop" | "error"): Promise<void> {
    await JobsChatHistory.save(this.conversationId, {
      id: this.messageId,
      role: "assistant",
      content: this.textContent,
      reasoning: this.reasoningContent || undefined,
      toolCalls: this.toolInvocations.length > 0 ? this.toolInvocations : undefined,
      timestamp: new Date().toISOString(),
      finishReason,
    });
  }

  private buildPrompt(): string {
    const messages = this.request.messages;
    const context = this.request.context;

    let prompt = "";

    if (context?.detectedJob) {
      prompt += `[Context: User is viewing a job posting]\n`;
      prompt += `Title: ${context.detectedJob.title}\n`;
      prompt += `Company: ${context.detectedJob.company}\n`;
      prompt += `URL: ${context.detectedJob.url}\n`;
      if (context.detectedJob.source) {
        prompt += `Source: ${context.detectedJob.source}\n`;
      }
      prompt += `\n`;
    }

    if (context?.jobId) {
      prompt += `[Context: Discussing job ID #${context.jobId}]\n\n`;
    }

    if (context?.resumeId) {
      prompt += `[Context: Using resume ID #${context.resumeId}]\n\n`;
    }

    for (const msg of messages) {
      if (msg.role === "user") {
        prompt += `User: ${msg.content}\n\n`;
      } else {
        prompt += `Assistant: ${msg.content}\n\n`;
      }
    }

    return prompt.trim();
  }

  private async handleAgentEvent(
    event: AgentEvent,
    adapter: AISDKStreamAdapter
  ): Promise<void> {
    if (this.abortController.signal.aborted) return;

    switch (event.type) {
      case "message_update":
        await this.handleMessageUpdate(event as MessageUpdateEvent, adapter);
        break;

      case "tool_call_start":
        await this.handleToolCallStart(event as ToolCallStartEvent, adapter);
        break;

      case "tool_call_result":
        await this.handleToolCallResult(event as ToolCallResultEvent, adapter);
        break;
    }
  }

  private async handleMessageUpdate(
    event: MessageUpdateEvent,
    adapter: AISDKStreamAdapter
  ): Promise<void> {
    const { assistantMessageEvent } = event;

    if (!assistantMessageEvent) return;

    switch (assistantMessageEvent.type) {
      case "thinking_delta":
        if (!this.isReasoning) {
          this.isReasoning = true;
          await adapter.sendReasoningStart();
        }

        this.reasoningContent += assistantMessageEvent.delta;
        await adapter.sendReasoningDelta(assistantMessageEvent.delta);
        break;

      case "text_delta":
        if (this.isReasoning) {
          await adapter.sendReasoningEnd();
          this.isReasoning = false;
        }

        this.textContent += assistantMessageEvent.delta;
        await adapter.sendTextDelta(assistantMessageEvent.delta);
        break;
    }
  }

  private async handleToolCallStart(
    event: ToolCallStartEvent,
    adapter: AISDKStreamAdapter
  ): Promise<void> {
    if (adapter.isTextOpen) {
      await adapter.sendTextEnd();
    }

    if (this.isReasoning) {
      await adapter.sendReasoningEnd();
      this.isReasoning = false;
    }

    const invocation: ToolInvocation = {
      toolCallId: event.toolCallId,
      toolName: event.toolName,
      args: event.arguments ?? {},
      state: "running",
    };
    this.toolInvocations.push(invocation);

    await adapter.sendToolCallStart(event.toolCallId, event.toolName, event.arguments ?? {});
  }

  private async handleToolCallResult(
    event: ToolCallResultEvent,
    adapter: AISDKStreamAdapter
  ): Promise<void> {
    const { toolCallId, result, error } = event;

    const invocation = this.toolInvocations.find((t) => t.toolCallId === toolCallId);
    if (invocation) {
      invocation.state = error ? "error" : "result";
      invocation.result = error ? `Error: ${error.message}` : this.extractResultText(result);
    }

    if (error) {
      await adapter.sendToolCallResult(toolCallId, `Error: ${error.message}`, true);
    } else {
      const resultText = this.extractResultText(result);
      await adapter.sendToolCallResult(toolCallId, resultText, false);
    }
  }

  private extractResultText(result?: ToolResult): string {
    if (result?.content && result.content.length > 0) {
      const textContent = result.content.find((c: ContentBlock) => c.type === "text");
      if (textContent && "text" in textContent) {
        return textContent.text as string;
      }
    }
    return "Tool executed successfully";
  }
}

interface AgentEvent {
  type: string;
  assistantMessageEvent?: {
    type: string;
    delta?: string;
  };
  toolCallId?: string;
  toolName?: string;
  arguments?: Record<string, unknown>;
  result?: ToolResult;
  error?: { message: string };
}

interface MessageUpdateEvent {
  type: "message_update";
  assistantMessageEvent: {
    type: "thinking_delta" | "text_delta";
    delta: string;
  };
}

interface ToolCallStartEvent {
  type: "tool_call_start";
  toolCallId: string;
  toolName: string;
  arguments?: Record<string, unknown>;
}

interface ToolCallResultEvent {
  type: "tool_call_result";
  toolCallId: string;
  result?: ToolResult;
  error?: { message: string };
}

interface ToolResult {
  content?: ContentBlock[];
}

interface ContentBlock {
  type: string;
  text?: string;
}
