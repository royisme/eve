import type { SSEStreamingApi } from "hono/streaming";
import type { AISDKEvent, FinishReason } from "./types";

function generateId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

export class AISDKStreamAdapter {
  private stream: SSEStreamingApi;
  private closed = false;

  private currentReasoningId: string | null = null;
  private currentTextId: string | null = null;
  private currentToolInputId: string | null = null;
  private currentToolInputBuffer = "";
  private currentToolInputMeta: { toolCallId: string; toolName: string } | null = null;

  constructor(stream: SSEStreamingApi) {
    this.stream = stream;
  }

  async send(event: AISDKEvent): Promise<void> {
    if (this.closed) return;

    await this.stream.writeSSE({
      data: JSON.stringify(event),
    });
  }

  async sendStart(messageId: string): Promise<void> {
    await this.send({
      id: generateId("start"),
      type: "start",
      messageId,
    });
  }

  async sendReasoningStart(): Promise<void> {
    this.currentReasoningId = generateId("reason");
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

  async sendToolInputStart(toolCallId: string, toolName: string): Promise<void> {
    this.currentToolInputId = generateId("tool");
    this.currentToolInputBuffer = "";
    this.currentToolInputMeta = { toolCallId, toolName };
    await this.send({
      id: this.currentToolInputId,
      type: "tool-input-start",
      toolCallId,
      toolName,
    });
  }

  async sendToolInputDelta(delta: string): Promise<void> {
    if (!this.currentToolInputId || !this.currentToolInputMeta) {
      return;
    }
    this.currentToolInputBuffer += delta;
    await this.send({
      id: this.currentToolInputId,
      type: "tool-input-delta",
      toolCallId: this.currentToolInputMeta.toolCallId,
      inputTextDelta: delta,
    });
  }

  async sendToolInputAvailable(input: Record<string, unknown>): Promise<void> {
    if (!this.currentToolInputId || !this.currentToolInputMeta) {
      return;
    }
    await this.send({
      id: this.currentToolInputId,
      type: "tool-input-available",
      toolCallId: this.currentToolInputMeta.toolCallId,
      toolName: this.currentToolInputMeta.toolName,
      input,
    });
    this.currentToolInputId = null;
    this.currentToolInputBuffer = "";
    this.currentToolInputMeta = null;
  }

  async sendToolOutputAvailable(
    toolCallId: string,
    toolName: string,
    output: Record<string, unknown> | string
  ): Promise<void> {
    await this.send({
      id: generateId("tool-output"),
      type: "tool-output-available",
      toolCallId,
      toolName,
      output,
    });
  }

  async sendMessageEnd(
    messageId: string,
    finishReason: FinishReason,
    usage?: { inputTokens: number; outputTokens: number }
  ): Promise<void> {
    await this.send({
      id: generateId("finish"),
      type: "finish",
      finishReason,
      usage,
    });
  }

  async sendError(code: string, message: string, retryAfter?: number): Promise<void> {
    await this.send({
      id: generateId("error"),
      type: "error",
      errorText: retryAfter ? `${message} (retry after ${retryAfter}s)` : message,
    });
  }

  close(): void {
    this.closed = true;
  }

  get isReasoningOpen(): boolean {
    return this.currentReasoningId !== null;
  }

  get isTextOpen(): boolean {
    return this.currentTextId !== null;
  }

  get hasOpenToolInput(): boolean {
    return this.currentToolInputId !== null;
  }
}
