export interface JobsChatRequest {
  messages: JobsChatMessage[];
  context?: JobsContext;
  options?: ChatOptions;
}

export interface JobsChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

export interface JobsContext {
  jobId?: number;
  resumeId?: number;
  detectedJob?: {
    title: string;
    company: string;
    url: string;
    source?: string;
  };
  activeFilters?: {
    location?: string;
    salary?: string;
    remote?: boolean;
  };
}

export interface ChatOptions {
  showThinking?: boolean;
  stream?: boolean;
  conversationId?: string;
}

export type AISDKEventType =
  | "start"
  | "reasoning-start"
  | "reasoning-delta"
  | "reasoning-end"
  | "text-start"
  | "text-delta"
  | "text-end"
  | "tool-input-start"
  | "tool-input-delta"
  | "tool-input-available"
  | "tool-output-available"
  | "tool-approval-request"
  | "finish"
  | "error";

export interface StartEvent {
  id: string; // Unique event ID
  type: "start";
  messageId: string;
}

export interface ReasoningStartEvent {
  id: string; // Unique part ID
  type: "reasoning-start";
}

export interface ReasoningDeltaEvent {
  id: string; // Unique part ID
  type: "reasoning-delta";
  delta: string;
}

export interface ReasoningEndEvent {
  id: string; // Unique part ID
  type: "reasoning-end";
}

export interface TextStartEvent {
  id: string; // Unique part ID
  type: "text-start";
}

export interface TextDeltaEvent {
  id: string; // Unique part ID
  type: "text-delta";
  delta: string;
}

export interface TextEndEvent {
  id: string; // Unique part ID
  type: "text-end";
}

export interface ToolInputStartEvent {
  id: string; // Unique part ID
  type: "tool-input-start";
  toolCallId: string;
  toolName: string;
}

export interface ToolInputDeltaEvent {
  id: string; // Unique part ID
  type: "tool-input-delta";
  toolCallId: string;
  inputTextDelta: string;
}

export interface ToolInputAvailableEvent {
  id: string; // Unique part ID
  type: "tool-input-available";
  toolCallId: string;
  toolName: string;
  input: Record<string, unknown>;
}

export interface ToolOutputAvailableEvent {
  id: string; // Unique part ID
  type: "tool-output-available";
  toolCallId: string;
  toolName: string;
  output: Record<string, unknown> | string;
}

export interface ToolApprovalRequestEvent {
  id: string; // Unique part ID
  type: "tool-approval-request";
  approvalId: string;
  toolCallId: string;
  toolName: string;
  reason?: string;
}

export type FinishReason = "stop" | "tool-calls" | "length" | "content-filter" | "error";

export interface FinishEvent {
  id: string; // Unique event ID
  type: "finish";
  finishReason?: FinishReason;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
}

export interface ErrorEvent {
  id: string; // Unique event ID
  type: "error";
  errorText: string;
}

export type AISDKEvent =
  | StartEvent
  | ReasoningStartEvent
  | ReasoningDeltaEvent
  | ReasoningEndEvent
  | TextStartEvent
  | TextDeltaEvent
  | TextEndEvent
  | ToolInputStartEvent
  | ToolInputDeltaEvent
  | ToolInputAvailableEvent
  | ToolOutputAvailableEvent
  | ToolApprovalRequestEvent
  | FinishEvent
  | ErrorEvent;

export interface JobsChatResponse {
  messageId: string;
  conversationId: string;
  content: string;
  reasoning?: string;
  toolCalls?: ToolInvocation[];
  finishReason: FinishReason;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
}

export interface ToolInvocation {
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
  state: "pending" | "running" | "result" | "error";
  result?: string;
}

export interface StoredMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  reasoning?: string;
  toolCalls?: ToolInvocation[];
  timestamp: string;
  finishReason?: FinishReason;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
}
