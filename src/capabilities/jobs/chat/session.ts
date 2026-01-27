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
  private eventQueue: Array<{ event: any; adapter: AISDKStreamAdapter }> = [];
  private isProcessingQueue = false;

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

      const unsubscribe = this.agent.subscribe((event: any) => {
        this.enqueueEvent(event, adapter);
      });

      this.abortController.signal.addEventListener("abort", () => {
        this.agent?.abort();
      });

      await this.agent.prompt(prompt);

      await this.drainEventQueue();

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
    await JobsChatHistory.upsert(this.conversationId, {
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
    event: any,
    adapter: AISDKStreamAdapter
  ): Promise<void> {
    if (this.abortController.signal.aborted) return;

    switch (event.type) {
      case "message_update":
        if (event.assistantMessageEvent) {
          await this.handleOldFormatMessageUpdate(event, adapter);
        } else if (event.message?.role === "assistant") {
          await this.handleNewFormatMessageUpdate(event, adapter);
        }
        break;

      case "text_delta":
        this.textContent += event.delta;
        await adapter.sendTextDelta(event.delta);
        break;

      case "message_end":
        if (event.message?.stopReason === "error") {
          const errorMsg = event.message.errorMessage || "Unknown agent error";
          await adapter.sendError("agent_error", errorMsg);
        }
        break;

      case "tool_execution_start":
        await this.handleToolExecutionStart(event, adapter);
        break;

      case "tool_execution_end":
        await this.handleToolExecutionEnd(event, adapter);
        break;
    }
  }

  private async handleOldFormatMessageUpdate(
    event: any,
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

  private async handleNewFormatMessageUpdate(
    event: any,
    adapter: AISDKStreamAdapter
  ): Promise<void> {
    const delta = event.delta || event.message?.delta;
    if (delta) {
      if (this.isReasoning) {
        await adapter.sendReasoningEnd();
        this.isReasoning = false;
      }
      this.textContent += delta;
      await adapter.sendTextDelta(delta);
    }
  }

  private async handleToolExecutionStart(
    event: any,
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
      args: (event.args ?? {}) as Record<string, unknown>,
      state: "running",
    };
    this.toolInvocations.push(invocation);

    await adapter.sendToolCallStart(event.toolCallId, event.toolName, (event.args ?? {}) as Record<string, unknown>);
  }

  private async handleToolExecutionEnd(
    event: any,
    adapter: AISDKStreamAdapter
  ): Promise<void> {
    const { toolCallId, result, isError } = event;

    const invocation = this.toolInvocations.find((t) => t.toolCallId === toolCallId);
    if (invocation) {
      invocation.state = isError ? "error" : "result";
      invocation.result = isError ? `Error: ${String(result)}` : this.extractResultText(result);
    }

    if (isError) {
      await adapter.sendToolCallResult(toolCallId, `Error: ${String(result)}`, true);
    } else {
      const resultText = this.extractResultText(result);
      await adapter.sendToolCallResult(toolCallId, resultText, false);
    }
  }

  private extractResultText(result?: unknown): string {
    if (result && typeof result === "object" && "content" in result) {
      const content = (result as { content?: Array<{ type: string; text?: string }> }).content;
      if (content && Array.isArray(content) && content.length > 0) {
        const textContent = content.find((c) => c.type === "text");
        if (textContent && "text" in textContent && typeof textContent.text === "string") {
          return textContent.text;
        }
      }
    }
    return "Tool executed successfully";
  }

  private enqueueEvent(event: any, adapter: AISDKStreamAdapter): void {
    this.eventQueue.push({ event, adapter });
    this.processEventQueue();
  }

  private async processEventQueue(): Promise<void> {
    if (this.isProcessingQueue) return;
    this.isProcessingQueue = true;

    while (this.eventQueue.length > 0) {
      const item = this.eventQueue.shift();
      if (!item) break;

      try {
        await this.handleAgentEvent(item.event, item.adapter);
      } catch (error) {
        console.error("[JobsChatSession] Event processing error:", error);
      }
    }

    this.isProcessingQueue = false;
  }

  private async drainEventQueue(): Promise<void> {
    while (this.eventQueue.length > 0 || this.isProcessingQueue) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
}
