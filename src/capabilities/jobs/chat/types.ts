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
  | "message-start"
  | "reasoning-start"
  | "reasoning-delta"
  | "reasoning-end"
  | "text-start"
  | "text-delta"
  | "text-end"
  | "tool-call-start"
  | "tool-call-delta"
  | "tool-call-result"
  | "message-end"
  | "error"
  | "ping";

export interface MessageStartEvent {
  id: string; // Unique event ID
  type: "message-start";
  messageId: string;
  role: "assistant";
  timestamp: string;
}

export interface ReasoningStartEvent {
  id: string; // Unique event ID
  type: "reasoning-start";
  reasoningId: string;
}

export interface ReasoningDeltaEvent {
  id: string; // Unique event ID
  type: "reasoning-delta";
  reasoningId: string;
  delta: string;
}

export interface ReasoningEndEvent {
  id: string; // Unique event ID
  type: "reasoning-end";
  reasoningId: string;
  content: string;
}

export interface TextStartEvent {
  id: string; // Unique event ID
  type: "text-start";
  textId: string;
}

export interface TextDeltaEvent {
  id: string; // Unique event ID
  type: "text-delta";
  textId: string;
  delta: string;
}

export interface TextEndEvent {
  id: string; // Unique event ID
  type: "text-end";
  textId: string;
  content: string;
}

export interface ToolCallStartEvent {
  id: string; // Unique event ID
  type: "tool-call-start";
  toolCallId: string;
  toolName: string;
  arguments: Record<string, unknown>;
}

export interface ToolCallDeltaEvent {
  id: string; // Unique event ID
  type: "tool-call-delta";
  toolCallId: string;
  status: "running";
  progress?: {
    current?: number;
    total?: number;
    message?: string;
  };
}

export interface ToolCallResultEvent {
  id: string; // Unique event ID
  type: "tool-call-result";
  toolCallId: string;
  result: string;
  isError: boolean;
  data?: Record<string, unknown>;
}

export type FinishReason = "stop" | "tool-calls" | "length" | "content-filter" | "error";

export interface MessageEndEvent {
  id: string; // Unique event ID
  type: "message-end";
  messageId: string;
  finishReason: FinishReason;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
}

export interface ErrorEvent {
  id: string; // Unique event ID
  type: "error";
  code: string;
  message: string;
  retryAfter?: number;
}

export interface PingEvent {
  id: string; // Unique event ID
  type: "ping";
}

export type AISDKEvent =
  | MessageStartEvent
  | ReasoningStartEvent
  | ReasoningDeltaEvent
  | ReasoningEndEvent
  | TextStartEvent
  | TextDeltaEvent
  | TextEndEvent
  | ToolCallStartEvent
  | ToolCallDeltaEvent
  | ToolCallResultEvent
  | MessageEndEvent
  | ErrorEvent
  | PingEvent;

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
