export interface JobsChatRequest {
  messages: ChatMessage[];
  context?: JobsContext;
  options?: ChatOptions;
}

export interface ChatMessage {
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
  | "tool-call"
  | "tool-result"
  | "finish"
  | "error"
  | "ping";

export interface StartEvent {
  type: "start";
  messageId: string;
}

export interface ReasoningStartEvent {
  type: "reasoning-start";
  id: string;
}

export interface ReasoningDeltaEvent {
  type: "reasoning-delta";
  id: string;
  delta: string;
}

export interface ReasoningEndEvent {
  type: "reasoning-end";
  id: string;
}

export interface TextStartEvent {
  type: "text-start";
  id: string;
}

export interface TextDeltaEvent {
  type: "text-delta";
  id: string;
  delta: string;
}

export interface TextEndEvent {
  type: "text-end";
  id: string;
}

export interface ToolCallEvent {
  type: "tool-call";
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
}

export interface ToolResultEvent {
  type: "tool-result";
  toolCallId: string;
  result: string;
}

export type FinishReason = "stop" | "tool-calls" | "length" | "content-filter" | "error";

export interface FinishEvent {
  type: "finish";
  finishReason: FinishReason;
  usage?: {
    promptTokens: number;
    completionTokens: number;
  };
}

export interface ErrorEvent {
  type: "error";
  error: string;
}

export interface PingEvent {
  type: "ping";
}

export type AISDKEvent =
  | StartEvent
  | ReasoningStartEvent
  | ReasoningDeltaEvent
  | ReasoningEndEvent
  | TextStartEvent
  | TextDeltaEvent
  | TextEndEvent
  | ToolCallEvent
  | ToolResultEvent
  | FinishEvent
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
    promptTokens: number;
    completionTokens: number;
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
    promptTokens: number;
    completionTokens: number;
  };
}
