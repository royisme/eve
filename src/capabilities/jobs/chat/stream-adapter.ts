import type { SSEStreamingApi } from "hono/streaming";
import type { AISDKEvent, FinishReason } from "./types";

const HEARTBEAT_INTERVAL_MS = 15000;

function generateId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

export class AISDKStreamAdapter {
  private stream: SSEStreamingApi;
  private closed = false;
  private pingInterval: ReturnType<typeof setInterval> | null = null;

  private currentReasoningId: string | null = null;
  private currentTextId: string | null = null;

  constructor(stream: SSEStreamingApi) {
    this.stream = stream;
    this.startHeartbeat();
  }

  private startHeartbeat(): void {
    this.pingInterval = setInterval(async () => {
      if (!this.closed) {
        await this.send({ type: "ping" });
      }
    }, HEARTBEAT_INTERVAL_MS);
  }

  async send(event: AISDKEvent): Promise<void> {
    if (this.closed) return;

    await this.stream.writeSSE({
      data: JSON.stringify(event),
    });
  }

  async sendStart(messageId: string): Promise<void> {
    await this.send({
      type: "start",
      messageId,
    });
  }

  async sendReasoningStart(): Promise<void> {
    this.currentReasoningId = generateId("reasoning");
    await this.send({
      type: "reasoning-start",
      id: this.currentReasoningId,
    });
  }

  async sendReasoningDelta(delta: string): Promise<void> {
    if (!this.currentReasoningId) {
      await this.sendReasoningStart();
    }
    await this.send({
      type: "reasoning-delta",
      id: this.currentReasoningId!,
      delta,
    });
  }

  async sendReasoningEnd(): Promise<void> {
    if (this.currentReasoningId) {
      await this.send({
        type: "reasoning-end",
        id: this.currentReasoningId,
      });
      this.currentReasoningId = null;
    }
  }

  async sendTextStart(): Promise<void> {
    this.currentTextId = generateId("text");
    await this.send({
      type: "text-start",
      id: this.currentTextId,
    });
  }

  async sendTextDelta(delta: string): Promise<void> {
    if (!this.currentTextId) {
      await this.sendTextStart();
    }
    await this.send({
      type: "text-delta",
      id: this.currentTextId!,
      delta,
    });
  }

  async sendTextEnd(): Promise<void> {
    if (this.currentTextId) {
      await this.send({
        type: "text-end",
        id: this.currentTextId,
      });
      this.currentTextId = null;
    }
  }

  async sendToolCall(
    toolCallId: string,
    toolName: string,
    args: Record<string, unknown>
  ): Promise<void> {
    await this.send({
      type: "tool-call",
      toolCallId,
      toolName,
      args,
    });
  }

  async sendToolResult(toolCallId: string, result: string): Promise<void> {
    await this.send({
      type: "tool-result",
      toolCallId,
      result,
    });
  }

  async sendFinish(
    finishReason: FinishReason,
    usage?: { promptTokens: number; completionTokens: number }
  ): Promise<void> {
    await this.send({
      type: "finish",
      finishReason,
      usage,
    });
  }

  async sendError(error: string): Promise<void> {
    await this.send({ type: "error", error });
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
