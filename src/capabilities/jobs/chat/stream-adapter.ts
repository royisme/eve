import type { SSEStreamingApi } from "hono/streaming";
import type { AISDKEvent, FinishReason } from "./types";

const HEARTBEAT_INTERVAL_MS = 15000;

function generateId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

function generateEventId(): string {
  return `evt_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

export class AISDKStreamAdapter {
  private stream: SSEStreamingApi;
  private closed = false;
  private pingInterval: ReturnType<typeof setInterval> | null = null;

  private currentReasoningId: string | null = null;
  private currentReasoningContent = "";
  private currentTextId: string | null = null;
  private currentTextContent = "";

  constructor(stream: SSEStreamingApi) {
    this.stream = stream;
    this.startHeartbeat();
  }

  private startHeartbeat(): void {
    this.pingInterval = setInterval(async () => {
      if (!this.closed) {
        await this.send({
          id: generateEventId(),
          type: "ping",
        });
      }
    }, HEARTBEAT_INTERVAL_MS);
  }

  async send(event: AISDKEvent): Promise<void> {
    if (this.closed) return;

    await this.stream.writeSSE({
      data: JSON.stringify(event),
    });
  }

  async sendMessageStart(messageId: string): Promise<void> {
    await this.send({
      id: generateEventId(),
      type: "message-start",
      messageId,
      role: "assistant",
      timestamp: new Date().toISOString(),
    });
  }

  async sendReasoningStart(): Promise<void> {
    this.currentReasoningId = generateId("reason");
    this.currentReasoningContent = "";
    await this.send({
      id: generateEventId(),
      type: "reasoning-start",
      reasoningId: this.currentReasoningId,
    });
  }

  async sendReasoningDelta(delta: string): Promise<void> {
    if (!this.currentReasoningId) {
      await this.sendReasoningStart();
    }
    this.currentReasoningContent += delta;
    await this.send({
      id: generateEventId(),
      type: "reasoning-delta",
      reasoningId: this.currentReasoningId!,
      delta,
    });
  }

  async sendReasoningEnd(): Promise<void> {
    if (this.currentReasoningId) {
      await this.send({
        id: generateEventId(),
        type: "reasoning-end",
        reasoningId: this.currentReasoningId,
        content: this.currentReasoningContent,
      });
      this.currentReasoningId = null;
      this.currentReasoningContent = "";
    }
  }

  async sendTextStart(): Promise<void> {
    this.currentTextId = generateId("text");
    this.currentTextContent = "";
    await this.send({
      id: generateEventId(),
      type: "text-start",
      textId: this.currentTextId,
    });
  }

  async sendTextDelta(delta: string): Promise<void> {
    if (!this.currentTextId) {
      await this.sendTextStart();
    }
    this.currentTextContent += delta;
    await this.send({
      id: generateEventId(),
      type: "text-delta",
      textId: this.currentTextId!,
      delta,
    });
  }

  async sendTextEnd(): Promise<void> {
    if (this.currentTextId) {
      await this.send({
        id: generateEventId(),
        type: "text-end",
        textId: this.currentTextId,
        content: this.currentTextContent,
      });
      this.currentTextId = null;
      this.currentTextContent = "";
    }
  }

  async sendToolCallStart(
    toolCallId: string,
    toolName: string,
    args: Record<string, unknown>
  ): Promise<void> {
    await this.send({
      id: generateEventId(),
      type: "tool-call-start",
      toolCallId,
      toolName,
      arguments: args,
    });
  }

  async sendToolCallDelta(
    toolCallId: string,
    progress?: { current?: number; total?: number; message?: string }
  ): Promise<void> {
    await this.send({
      id: generateEventId(),
      type: "tool-call-delta",
      toolCallId,
      status: "running",
      progress,
    });
  }

  async sendToolCallResult(
    toolCallId: string,
    result: string,
    isError = false,
    data?: Record<string, unknown>
  ): Promise<void> {
    await this.send({
      id: generateEventId(),
      type: "tool-call-result",
      toolCallId,
      result,
      isError,
      data,
    });
  }

  async sendMessageEnd(
    messageId: string,
    finishReason: FinishReason,
    usage?: { inputTokens: number; outputTokens: number }
  ): Promise<void> {
    await this.send({
      id: generateEventId(),
      type: "message-end",
      messageId,
      finishReason,
      usage,
    });
  }

  async sendError(code: string, message: string, retryAfter?: number): Promise<void> {
    await this.send({
      id: generateEventId(),
      type: "error",
      code,
      message,
      retryAfter,
    });
  }

  close(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    this.closed = true;
  }

  get isReasoningOpen(): boolean {
    return this.currentReasoningId !== null;
  }

  get isTextOpen(): boolean {
    return this.currentTextId !== null;
  }
}
