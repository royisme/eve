# Eve Jobs Streaming Chat API Design

> **Status**: Draft (Reviewed by Oracle)  
> **Author**: AI Assistant  
> **Date**: 2026-01-22  
> **Version**: 0.3.0  
> **Reviewed**: 2026-01-22 by Oracle Agent

## Oracle Review Summary

### Overall Assessment
> 设计整体合理，Session/Adapter/Agent 分离清晰。主要风险在于协议版本：AI SDK v5+ 使用 UI Message Stream Protocol，与当前设计的 Data Stream Protocol 不同。需要确认 Wall-E 使用的 AI SDK 版本并相应调整。

### Key Recommendations Applied
1. **协议版本明确**: 明确标注支持的 AI SDK 版本
2. **完整 Headers**: 添加所有必需的响应头
3. **事件 ID 字段**: 为 text/reasoning 事件添加 ID
4. **增量持久化**: 避免断开连接时丢失数据
5. **Non-streaming 响应**: 定义 `stream=false` 时的响应格式

---

## 1. Overview

本文档定义 Eve 的 **Jobs Capability 专用** 流式聊天 API，支持类似 Claude Code 的交互体验：

- **专用 Jobs Agent**: 针对求职场景优化的独立 Agent
- **模块化端点**: `/jobs/chat` 而非通用 `/chat`，支持未来扩展
- **Vercel AI SDK 兼容**: 前端 (Wall-E) 使用 AI SDK，后端适配其协议
- **多轮对话上下文管理**
- **Thinking 可折叠/隐藏**
- **并行工具调用支持**
- **流式渲染优先**

### 1.1 Protocol Version

> **重要**: 本 API 针对 **Vercel AI SDK v6 UI Message Stream Protocol**。

| AI SDK Version | Protocol | Header |
|----------------|----------|--------|
| v4.x | Data Stream Protocol | `x-vercel-ai-data-stream: v1` |
| **v5.x+ / v6** | **UI Message Stream Protocol** | `x-vercel-ai-ui-message-stream: v1` |

Wall-E 使用 AI SDK v6，因此后端必须实现 UI Message Stream Protocol。

### 1.2 Design Rationale

| 决策 | 理由 |
|------|------|
| `/jobs/chat` 而非 `/chat` | 每个 Capability 有专用端点，语义清晰，便于扩展 |
| Jobs Agent 独立配置 | 专用系统提示词、工具集、模型设置 |
| Vercel AI SDK 协议 | Wall-E 使用 AI SDK，减少适配工作 |

**未来扩展**:
```
/jobs/chat     → Jobs Agent
/email/chat    → Email Agent (future)
/calendar/chat → Calendar Agent (future)
```

---

## 2. Jobs Agent Configuration

### 2.1 Agent Definition

Jobs Agent 是专门处理求职相关任务的 Agent，拥有优化的系统提示词和专用工具集。

```json
// ~/.config/eve/agents/jobs/agent.json
{
  "id": "jobs",
  "name": "Jobs Agent",
  "version": "1.0.0",
  "role": {
    "description": "Expert job hunting assistant that helps users find, analyze, and apply to jobs",
    "system_prompt": "You are an expert job hunting assistant. Your role is to help users:\n\n1. **Analyze Jobs**: Evaluate job postings against user's skills and experience\n2. **Search & Filter**: Find relevant opportunities based on preferences\n3. **Resume Tailoring**: Customize resumes for specific job applications\n4. **Provide Insights**: Offer strategic advice on job fit, compensation, and career growth\n\nYou have access to the user's resume and job history. Be direct, actionable, and data-driven.\n\nWhen analyzing a job:\n- Start with a quick fit assessment (High/Medium/Low)\n- Identify key matching skills and gaps\n- Provide specific resume tailoring suggestions\n- Note any red flags or highlights\n\nAlways be honest about poor fits - the user's time is valuable."
  },
  "model": {
    "primary": "sonnet",
    "fallback": "haiku",
    "temperature": 0.7,
    "thinking": "medium"
  },
  "responsibilities": ["jobs:*", "resume:tailor"],
  "permissions": {
    "tools": {
      "allow": ["jobs_*", "resume_*"],
      "deny": ["system_*", "email_*"]
    },
    "capabilities": ["jobs"],
    "can_delegate": false,
    "can_access_context": true
  }
}
```

### 2.2 Jobs Agent Tools

Jobs Agent 拥有以下工具：

| Tool | Description | Category |
|------|-------------|----------|
| `jobs_search` | Search job database by keywords, location, etc. | Discovery |
| `jobs_list` | List jobs with filters (status, date, etc.) | Discovery |
| `jobs_enrich` | Scrape and enrich job posting with full JD | Enrichment |
| `jobs_analyze` | Batch LLM analysis of multiple jobs | Analysis |
| `jobs_analyze_single` | Deep analysis of a single job | Analysis |
| `jobs_prescore` | Quick compatibility check (fast, cheap) | Analysis |
| `jobs_tailor` | Generate tailored resume for a job | Action |
| `jobs_get_tailored_versions` | Get version history of tailored resumes | Action |

### 2.3 Agent Factory

```typescript
// src/capabilities/jobs/agent.ts

import { createAgent, type AgentConfig } from "@mariozechner/pi-agent-core";
import { jobsCapability } from "./index";
import { resumeCapability } from "../resume";
import { LLMService } from "../../services/llm";
import { ConfigReader } from "../../core/config";

export interface JobsAgentOptions {
  showThinking?: boolean;
}

export async function createJobsAgent(options: JobsAgentOptions = {}) {
  const config = ConfigReader.get();
  const llm = new LLMService();
  
  // Load Jobs Agent config from filesystem or use defaults
  const agentConfig = await loadJobsAgentConfig();
  
  const systemPrompt = agentConfig.role.system_prompt;
  
  // Combine tools from jobs and resume capabilities
  const tools = [
    ...jobsCapability.tools,
    ...resumeCapability.tools.filter(t => 
      ["resume_get", "resume_list", "resume_get_default"].includes(t.name)
    ),
  ];
  
  return createAgent({
    name: "jobs",
    systemPrompt,
    tools,
    llm: llm.getProvider(agentConfig.model.primary),
    thinking: options.showThinking !== false,
    thinkingLevel: agentConfig.model.thinking || "medium",
  });
}

async function loadJobsAgentConfig(): Promise<AgentConfig> {
  // Try loading from ~/.config/eve/agents/jobs/agent.json
  // Fall back to embedded defaults
  // ...
}
```

---

## 3. API Endpoints

### 3.1 Complete Jobs API Structure

所有求职相关功能统一在 `/jobs/*` 路径下：

```typescript
// Wall-E frontend endpoints configuration
export const endpoints = {
  // 聊天
  chat: "/jobs/chat",
  chatStop: "/jobs/chat/stop",
  chatHistory: "/jobs/chat/history",
  
  // 职位
  jobs: {
    list: "/jobs",
    create: "/jobs",
    byId: (id: number) => `/jobs/${id}`,
    update: (id: number) => `/jobs/${id}`,
    delete: (id: number) => `/jobs/${id}`,
    stats: "/jobs/stats",
    sync: "/jobs/sync",
    ingest: "/jobs/ingest",
    analyze: (id: number) => `/jobs/${id}/analyze`,
  },
  
  // 简历
  resumes: {
    list: "/jobs/resumes",
    create: "/jobs/resumes",
    byId: (id: number) => `/jobs/resumes/${id}`,
    update: (id: number) => `/jobs/resumes/${id}`,
    delete: (id: number) => `/jobs/resumes/${id}`,
    setDefault: (id: number) => `/jobs/resumes/${id}/set-default`,
  },
  
  // 定制简历
  tailor: {
    create: (jobId: number) => `/jobs/tailor/${jobId}`,
    versions: (jobId: number) => `/jobs/tailor/${jobId}/versions`,
    pdf: (jobId: number) => `/jobs/tailor/${jobId}/pdf`,
  },
  
  // Agent 状态
  agent: {
    status: "/jobs/agent/status",
  },
  
  // 分析
  analytics: {
    funnel: "/jobs/analytics/funnel",
    skills: "/jobs/analytics/skills",
  },
};
```

### 3.2 Design Rationale

| 优势 | 说明 |
|------|------|
| **语义清晰** | 所有路径明确表示"求职相关功能" |
| **后端简化** | 不需要路由层判断上下文，`/jobs/*` 自动加载求职工具 |
| **权限统一** | 可以在 `/jobs` 层面统一鉴权 |
| **可扩展** | 未来其他能力可用 `/email/*`, `/calendar/*` 等 |

### 3.3 Chat Endpoints (本文档重点)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/jobs/chat` | POST | 流式聊天（SSE），与 Jobs Agent 对话 |
| `/jobs/chat/history` | GET | 获取历史对话 |
| `/jobs/chat/stop` | POST | 停止当前生成 |
| `/jobs/agent/status` | GET | 获取 Jobs Agent 状态和可用工具 |

---

## 4. Request Format

### POST `/jobs/chat`

```typescript
interface JobsChatRequest {
  messages: ChatMessage[];      // 完整的对话历史
  context?: JobsContext;        // 可选，求职相关上下文
  options?: ChatOptions;        // 可选，用户偏好
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: string;            // ISO 8601
}

interface JobsContext {
  jobId?: number;               // 当前关注的职位 ID
  resumeId?: number;            // 使用的简历 ID
  detectedJob?: {               // 从页面检测到的职位信息
    title: string;
    company: string;
    url: string;
    source?: string;            // LinkedIn, Indeed, etc.
  };
  activeFilters?: {             // 当前的筛选条件
    location?: string;
    salary?: string;
    remote?: boolean;
  };
}

interface ChatOptions {
  showThinking?: boolean;       // 默认 true
  stream?: boolean;             // 默认 true
  conversationId?: string;      // 可选，用于恢复对话
}
```

**示例请求:**

```json
{
  "messages": [
    {
      "role": "user",
      "content": "帮我分析这个职位是否适合我",
      "timestamp": "2024-01-22T10:00:00Z"
    }
  ],
  "context": {
    "detectedJob": {
      "title": "Senior Software Engineer",
      "company": "Google",
      "url": "https://careers.google.com/jobs/123",
      "source": "LinkedIn"
    }
  },
  "options": {
    "showThinking": true,
    "stream": true
  }
}
```

---

## 5. Response Format - SSE Stream

### 5.1 Required Headers

```typescript
// All required response headers for SSE streaming (AI SDK v6)
c.header("Content-Type", "text/event-stream");
c.header("Cache-Control", "no-cache");
c.header("Connection", "keep-alive");
c.header("x-vercel-ai-ui-message-stream", "v1");  // AI SDK v6 UI Message Stream
c.header("x-accel-buffering", "no");              // Prevent proxy buffering (nginx)
```

| Header | Purpose |
|--------|---------|
| `Content-Type: text/event-stream` | SSE 标准 MIME 类型 |
| `Cache-Control: no-cache` | 禁止缓存流式响应 |
| `Connection: keep-alive` | 保持长连接 |
| `x-vercel-ai-ui-message-stream: v1` | **AI SDK v6 协议版本标识** |
| `x-accel-buffering: no` | 禁止 nginx 等反向代理缓冲 |

### 5.2 Vercel AI SDK v6 Compatibility

Wall-E 使用 Vercel AI SDK v6 的 `useChat` hook。后端需要适配 **UI Message Stream Protocol**。

**AI SDK v6 Event Format:**
```
data: {"type":"<event_type>", "id":"<part_id>", ...payload}\n\n
```

> **Note**: UI Message Stream Protocol 要求每个 text/reasoning part 都有唯一的 `id` 字段。

### 5.3 Event Types (UI Message Stream Protocol)

| Eve Internal Event | AI SDK v6 Event Type | Description |
|-------------------|----------------------|-------------|
| message_start | `start` | 消息开始 |
| thinking_start | `reasoning-start` | 思考开始 |
| thinking_delta | `reasoning-delta` | 思考内容增量 |
| thinking_done | `reasoning-end` | 思考结束 |
| content_start | `text-start` | 文本块开始 |
| content_delta | `text-delta` | 文本内容增量 |
| content_done | `text-end` | 文本块结束 |
| tool_calls | `tool-call` | 工具调用 |
| tool_result | `tool-result` | 工具执行结果 |
| message_done | `finish` | 消息完成 |
| error | `error` | 错误 |

---

## 6. Event Definitions (AI SDK v6 UI Message Stream)

> **重要**: AI SDK v6 的 UI Message Stream Protocol 要求 text/reasoning 事件包含 `id` 字段。

### 6.1 `start` - 消息开始

```json
{
  "type": "start",
  "messageId": "msg_abc123"
}
```

### 6.2 `reasoning-start` - 思考开始

```json
{
  "type": "reasoning-start",
  "id": "reasoning_1"
}
```

### 6.3 `reasoning-delta` - 思考内容增量

```json
{
  "type": "reasoning-delta",
  "id": "reasoning_1",
  "delta": "我需要先查看用户的简历，然后分析职位要求..."
}
```

### 6.4 `reasoning-end` - 思考结束

```json
{
  "type": "reasoning-end",
  "id": "reasoning_1"
}
```

### 6.5 `text-start` - 文本块开始

```json
{
  "type": "text-start",
  "id": "text_1"
}
```

### 6.6 `text-delta` - 文本内容增量

```json
{
  "type": "text-delta",
  "id": "text_1",
  "delta": "我为你找到了 12 个匹配的职位。"
}
```

### 6.7 `text-end` - 文本块结束

```json
{
  "type": "text-end",
  "id": "text_1"
}
```

### 6.8 `tool-call` - 工具调用

```json
{
  "type": "tool-call",
  "toolCallId": "call_1",
  "toolName": "jobs_search",
  "args": {
    "keywords": "software engineer",
    "location": "San Francisco"
  }
}
```

### 6.9 `tool-result` - 工具执行结果

```json
{
  "type": "tool-result",
  "toolCallId": "call_1",
  "result": "找到 12 个匹配的软件工程师职位"
}
```

### 6.10 `finish` - 消息完成

```json
{
  "type": "finish",
  "finishReason": "stop",
  "usage": {
    "promptTokens": 150,
    "completionTokens": 280
  }
}
```

### 6.11 `error` - 错误

```json
{
  "type": "error",
  "error": "Rate limit exceeded. Please wait 30 seconds."
}
```

### 6.12 `ping` - 心跳

```json
{
  "type": "ping"
}
```

> 心跳事件每 15 秒发送一次，防止连接超时。

---

## 7. TypeScript Type Definitions

### 7.1 Server-Side Types

```typescript
// src/capabilities/jobs/chat/types.ts

// ===== Request Types =====

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

// ===== AI SDK v6 Event Types (UI Message Stream Protocol) =====

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

export interface FinishEvent {
  type: "finish";
  finishReason: "stop" | "tool-calls" | "length" | "content-filter" | "error";
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
```

### 7.2 Frontend Types (Wall-E)

```typescript
// For Wall-E frontend using Vercel AI SDK v6

import { useChat } from "ai/react";

// Wall-E can use useChat directly with minimal configuration
const { messages, input, handleSubmit, isLoading, stop } = useChat({
  api: "http://localhost:3033/jobs/chat",
  headers: {
    Authorization: `Bearer ${token}`,
  },
  body: {
    context: jobsContext, // JobsContext
  },
  onToolCall: async ({ toolCall }) => {
    // Handle tool calls if needed
    console.log("Tool called:", toolCall.toolName);
  },
});

// Extended message type with thinking
interface ExtendedMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  reasoning?: string;           // Thinking content
  toolInvocations?: ToolInvocation[];
  createdAt?: Date;
}

interface ToolInvocation {
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
  state: "pending" | "running" | "result" | "error";
  result?: string;
}
```

---

## 8. Implementation Architecture

### 8.1 Component Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        Hono HTTP Server                          │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                 POST /jobs/chat Handler                    │  │
│  │                                                            │  │
│  │  1. Parse request                                          │  │
│  │  2. Create SSE stream with AI SDK headers                  │  │
│  │  3. Initialize JobsChatSession                             │  │
│  │  4. Subscribe to Jobs Agent events                         │  │
│  │  5. Transform events to AI SDK format                      │  │
│  └────────────────────────┬──────────────────────────────────┘  │
│                           │                                      │
│  ┌────────────────────────▼──────────────────────────────────┐  │
│  │                   JobsChatSession                          │  │
│  │                                                            │  │
│  │  - Manages conversation state                              │  │
│  │  - Tracks active message/thinking/tool states              │  │
│  │  - Handles stop requests                                   │  │
│  │  - Persists to SQLite                                      │  │
│  │  - Sends heartbeat pings                                   │  │
│  └────────────────────────┬──────────────────────────────────┘  │
│                           │                                      │
│  ┌────────────────────────▼──────────────────────────────────┐  │
│  │                     Jobs Agent                             │  │
│  │                  (pi-agent-core)                           │  │
│  │                                                            │  │
│  │  - Specialized system prompt for job hunting               │  │
│  │  - Jobs + Resume tools only                                │  │
│  │  - Events: message_update, tool_call, tool_result, etc.    │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### 8.2 File Structure

```
src/
├── capabilities/
│   └── jobs/
│       ├── index.ts              # Jobs capability definition
│       ├── agent.ts              # Jobs Agent factory (NEW)
│       ├── chat/                 # Jobs Chat (NEW)
│       │   ├── index.ts          # Route handlers
│       │   ├── session.ts        # JobsChatSession class
│       │   ├── stream-adapter.ts # pi-agent → AI SDK event adapter
│       │   ├── types.ts          # Type definitions
│       │   └── history.ts        # Conversation history service
│       ├── tools/                # Existing tools
│       └── services/             # Existing services
├── server.ts                     # Add /jobs routes
└── db/
    └── schema.ts                 # Add conversations/messages tables
```

---

## 9. Database Schema

### 9.1 New Tables

```sql
-- 对话表
CREATE TABLE conversations (
  id TEXT PRIMARY KEY,              -- conv_xxx
  agent_id TEXT NOT NULL,           -- 'jobs', 'email', etc.
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  metadata TEXT                     -- JSON: { contextJobId, contextResumeId, etc. }
);

-- 消息表
CREATE TABLE chat_messages (
  id TEXT PRIMARY KEY,              -- msg_xxx
  conversation_id TEXT NOT NULL,
  role TEXT NOT NULL,               -- 'user' | 'assistant'
  content TEXT NOT NULL,            -- 最终文本内容
  reasoning TEXT,                   -- Thinking content (AI SDK: reasoning)
  tool_calls TEXT,                  -- JSON: ToolInvocation[]
  timestamp TEXT NOT NULL,
  finish_reason TEXT,               -- 'stop' | 'tool-calls' | 'error' | etc.
  usage TEXT,                       -- JSON: { promptTokens, completionTokens }
  created_at TEXT NOT NULL,
  
  FOREIGN KEY (conversation_id) REFERENCES conversations(id)
);

CREATE INDEX idx_messages_conversation ON chat_messages(conversation_id);
CREATE INDEX idx_messages_timestamp ON chat_messages(timestamp);
CREATE INDEX idx_conversations_agent ON conversations(agent_id);
```

### 9.2 Drizzle Schema

```typescript
// src/db/schema.ts - 新增

export const conversations = sqliteTable("conversations", {
  id: text("id").primaryKey(),
  agentId: text("agent_id").notNull(),           // NEW: support multi-agent
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  metadata: text("metadata"),
});

export const chatMessages = sqliteTable("chat_messages", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id")
    .notNull()
    .references(() => conversations.id),
  role: text("role").notNull(),
  content: text("content").notNull(),
  reasoning: text("reasoning"),                  // Renamed from 'thinking'
  toolCalls: text("tool_calls"),
  timestamp: text("timestamp").notNull(),
  finishReason: text("finish_reason"),
  usage: text("usage"),
  createdAt: text("created_at").notNull(),
});
```

---

## 10. Core Implementation

### 10.1 Jobs Chat Route Handler

```typescript
// src/capabilities/jobs/chat/index.ts

import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { JobsChatSession } from "./session";
import { AISDKStreamAdapter } from "./stream-adapter";
import type { JobsChatRequest } from "./types";
import { createJobsAgent } from "../agent";

const jobsChat = new Hono();

jobsChat.post("/", async (c) => {
  const body = await c.req.json<JobsChatRequest>();
  
  // Validate request
  if (!body.messages || body.messages.length === 0) {
    return c.json({ error: "messages is required" }, 400);
  }
  
  // Non-streaming response (optional)
  if (body.options?.stream === false) {
    return handleNonStreaming(c, body);
  }
  
  // SSE streaming response with all required headers (AI SDK v6)
  c.header("Content-Type", "text/event-stream");
  c.header("Cache-Control", "no-cache");
  c.header("Connection", "keep-alive");
  c.header("x-vercel-ai-ui-message-stream", "v1");  // AI SDK v6
  c.header("x-accel-buffering", "no");
  
  return streamSSE(c, async (stream) => {
    const session = new JobsChatSession(body);
    const adapter = new AISDKStreamAdapter(stream);
    
    try {
      await session.run(adapter);
    } catch (error) {
      await adapter.sendError(
        error instanceof Error ? error.message : "Unknown error"
      );
    }
  });
});

jobsChat.get("/history", async (c) => {
  const conversationId = c.req.query("conversationId");
  if (!conversationId) {
    return c.json({ error: "conversationId is required" }, 400);
  }
  
  const history = await JobsChatHistory.get(conversationId);
  return c.json(history);
});

jobsChat.post("/stop", async (c) => {
  const { messageId } = await c.req.json<{ messageId: string }>();
  
  const stopped = JobsChatSession.stop(messageId);
  return c.json({ stopped });
});

export { jobsChat };
```

### 10.2 AI SDK v6 Stream Adapter

```typescript
// src/capabilities/jobs/chat/stream-adapter.ts

import type { SSEStreamingApi } from "hono/streaming";
import type { AISDKEvent } from "./types";
import { nanoid } from "nanoid";

export class AISDKStreamAdapter {
  private stream: SSEStreamingApi;
  private closed = false;
  private pingInterval: Timer | null = null;
  
  // Track current part IDs for AI SDK v6
  private currentReasoningId: string | null = null;
  private currentTextId: string | null = null;
  
  constructor(stream: SSEStreamingApi) {
    this.stream = stream;
    this.startHeartbeat();
  }
  
  private startHeartbeat(): void {
    // Send ping every 15 seconds to prevent timeout
    this.pingInterval = setInterval(async () => {
      if (!this.closed) {
        await this.send({ type: "ping" });
      }
    }, 15000);
  }
  
  async send(event: AISDKEvent): Promise<void> {
    if (this.closed) return;
    
    // AI SDK v6 format: data: {json}\n\n
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
    this.currentReasoningId = `reasoning_${nanoid(8)}`;
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
    this.currentTextId = `text_${nanoid(8)}`;
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
    finishReason: FinishEvent["finishReason"],
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
}
```

### 10.3 Jobs Chat Session

```typescript
// src/capabilities/jobs/chat/session.ts

import { createJobsAgent } from "../agent";
import type { Agent } from "@mariozechner/pi-agent-core";
import type { JobsChatRequest, JobsContext } from "./types";
import type { AISDKStreamAdapter } from "./stream-adapter";
import { nanoid } from "nanoid";
import { JobsChatHistory } from "./history";

// Active sessions for stop functionality
const activeSessions = new Map<string, JobsChatSession>();

export class JobsChatSession {
  private request: JobsChatRequest;
  private agent: Agent | null = null;
  private messageId: string;
  private conversationId: string;
  private abortController: AbortController;
  
  // State tracking
  private isReasoning = false;
  private reasoningContent = "";
  private textContent = "";
  
  constructor(request: JobsChatRequest) {
    this.request = request;
    this.messageId = `msg_${nanoid(12)}`;
    this.conversationId = request.options?.conversationId || `conv_${nanoid(12)}`;
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
  
  async run(adapter: AISDKStreamAdapter): Promise<void> {
    try {
      // Create Jobs Agent
      this.agent = await createJobsAgent({
        showThinking: this.request.options?.showThinking !== false,
      });
      
      // Send start event (AI SDK v6)
      await adapter.sendStart(this.messageId);
      
      // Build prompt from messages and context
      const prompt = this.buildPrompt();
      
      // Subscribe to agent events
      const unsubscribe = this.agent.subscribe((event) => {
        this.handleAgentEvent(event, adapter);
      });
      
      // Run agent
      await this.agent.prompt(prompt, { signal: this.abortController.signal });
      
      unsubscribe();
      
      // Close any open text/reasoning blocks
      await adapter.sendTextEnd();
      await adapter.sendReasoningEnd();
      
      // Send finish
      await adapter.sendFinish("stop");
      
      // Persist message
      await this.persistMessage();
      
    } finally {
      activeSessions.delete(this.messageId);
      adapter.close();
    }
  }
  
  private buildPrompt(): string {
    const messages = this.request.messages;
    const context = this.request.context;
    
    let prompt = "";
    
    // Add Jobs-specific context
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
    
    // Add conversation history
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
        await this.handleMessageUpdate(event, adapter);
        break;
        
      case "tool_call_start":
        await this.handleToolCallStart(event, adapter);
        break;
        
      case "tool_call_result":
        await this.handleToolCallResult(event, adapter);
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
        // Start reasoning block if needed
        if (!this.isReasoning) {
          this.isReasoning = true;
          await adapter.sendReasoningStart();
        }
        
        this.reasoningContent += assistantMessageEvent.delta;
        await adapter.sendReasoningDelta(assistantMessageEvent.delta);
        break;
        
      case "text_delta":
        // Close reasoning if open
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
    // Close text block if open
    await adapter.sendTextEnd();
    
    // Close reasoning if open
    if (this.isReasoning) {
      await adapter.sendReasoningEnd();
      this.isReasoning = false;
    }
    
    // Send tool call event
    await adapter.sendToolCall(
      event.toolCallId,
      event.toolName,
      event.arguments
    );
  }
  
  private async handleToolCallResult(
    event: ToolCallResultEvent,
    adapter: AISDKStreamAdapter
  ): Promise<void> {
    const { toolCallId, result, error } = event;
    
    if (error) {
      await adapter.sendToolResult(toolCallId, `Error: ${error.message}`);
    } else {
      const resultText = this.extractResultText(result);
      await adapter.sendToolResult(toolCallId, resultText);
    }
  }
  
  private extractResultText(result: ToolResult): string {
    if (result.content && result.content.length > 0) {
      const textContent = result.content.find((c) => c.type === "text");
      if (textContent && "text" in textContent) {
        return textContent.text;
      }
    }
    return "Tool executed successfully";
  }
  
  private async persistMessage(): Promise<void> {
    await JobsChatHistory.save(this.conversationId, {
      id: this.messageId,
      role: "assistant",
      content: this.textContent,
      reasoning: this.reasoningContent || undefined,
      timestamp: new Date().toISOString(),
      finishReason: "stop",
    });
  }
}
```

---

## 11. Server Integration

### 11.1 Mount Jobs Chat Routes

```typescript
// src/server.ts

import { Hono } from "hono";
import { jobsChat } from "./capabilities/jobs/chat";

const app = new Hono();

// Existing routes...

// Mount Jobs chat routes under /jobs
app.route("/jobs/chat", jobsChat);

// Jobs status endpoint
app.get("/jobs/status", async (c) => {
  const agent = await createJobsAgent();
  
  return c.json({
    status: "ready",
    agent: "jobs",
    model: agent.config.model,
    tools: agent.tools.map((t) => ({
      name: t.name,
      description: t.description,
    })),
  });
});

export { app };
```

---

## 12. Error Handling

### 12.1 Error Types

| Code | Description | Retry |
|------|-------------|-------|
| `rate_limit` | Provider rate limit | Yes, with backoff |
| `auth_error` | Invalid API key | No |
| `agent_error` | Jobs Agent internal error | Maybe |
| `tool_error` | Tool execution failed | No (continue flow) |

### 12.2 Tool Error Handling

工具失败 **不应该** 中断整个响应流：

```typescript
// In handleToolCallResult
if (error) {
  // Send error result but continue
  await adapter.sendToolResult(toolCallId, `Error: ${error.message}`);
  
  // Agent will see the error and adapt its response
  // DO NOT throw or stop the stream
}
```

### 12.3 Cancellation Semantics

当用户调用 `/jobs/chat/stop` 时：

1. 设置 `abortController.abort()`
2. 传播取消到正在执行的工具
3. 发送 `finish` 事件 with `finishReason: "stop"`
4. 持久化已生成的部分内容

---

## 13. Implementation Plan

### Phase 1: Core Streaming (P0) - 5h

| Task | Effort |
|------|--------|
| Create `src/capabilities/jobs/agent.ts` | 1h |
| Create `src/capabilities/jobs/chat/types.ts` | 0.5h |
| Create `src/capabilities/jobs/chat/stream-adapter.ts` | 1.5h |
| Create `src/capabilities/jobs/chat/session.ts` | 1.5h |
| Create `src/capabilities/jobs/chat/index.ts` routes | 0.5h |

### Phase 2: Database Integration (P0) - 2h

| Task | Effort |
|------|--------|
| Add schema to `src/db/schema.ts` | 0.5h |
| Generate migration | 0.5h |
| Create `src/capabilities/jobs/chat/history.ts` | 1h |

### Phase 3: Wall-E Integration (P1) - 2h

| Task | Effort |
|------|--------|
| Update Wall-E to use `/jobs/chat` | 1h |
| Test with Vercel AI SDK `useChat` | 1h |

### Phase 4: Tool Progress & Stop (P2) - 2h

| Task | Effort |
|------|--------|
| Add `tool-call-delta` progress events | 1h |
| Implement `/jobs/chat/stop` endpoint | 1h |

---

## 14. Testing

### 14.1 Manual Testing

```bash
# Test streaming
curl -N -X POST http://localhost:3033/jobs/chat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "messages": [{"role": "user", "content": "帮我搜索软件工程师职位", "timestamp": "2024-01-22T10:00:00Z"}],
    "context": {
      "activeFilters": {
        "location": "San Francisco",
        "remote": true
      }
    }
  }'
```

### 14.2 Expected Output (AI SDK v6)

```
data: {"type":"start","messageId":"msg_abc123"}

data: {"type":"reasoning-start","id":"reasoning_1"}

data: {"type":"reasoning-delta","id":"reasoning_1","delta":"用户想要在旧金山搜索远程软件工程师职位..."}

data: {"type":"reasoning-end","id":"reasoning_1"}

data: {"type":"tool-call","toolCallId":"call_1","toolName":"jobs_search","args":{"keywords":"software engineer","location":"San Francisco","remote":true}}

data: {"type":"tool-result","toolCallId":"call_1","result":"找到 15 个匹配的职位"}

data: {"type":"text-start","id":"text_1"}

data: {"type":"text-delta","id":"text_1","delta":"我为你找到了 15 个"}

data: {"type":"text-delta","id":"text_1","delta":"匹配的远程软件工程师职位。"}

data: {"type":"text-end","id":"text_1"}

data: {"type":"finish","finishReason":"stop","usage":{"promptTokens":150,"completionTokens":280}}
```

---

## 15. Non-Streaming Response

当 `options.stream = false` 时，返回 JSON 响应而非 SSE：

```typescript
// POST /jobs/chat with stream=false

interface JobsChatResponse {
  messageId: string;
  conversationId: string;
  content: string;
  reasoning?: string;
  toolCalls?: ToolInvocation[];
  finishReason: "stop" | "tool-calls" | "length" | "error";
  usage?: {
    promptTokens: number;
    completionTokens: number;
  };
}
```

**示例响应:**

```json
{
  "messageId": "msg_abc123",
  "conversationId": "conv_xyz789",
  "content": "我为你找到了 15 个匹配的远程软件工程师职位。",
  "reasoning": "用户想要在旧金山搜索远程软件工程师职位...",
  "toolCalls": [
    {
      "toolCallId": "call_1",
      "toolName": "jobs_search",
      "args": {"keywords": "software engineer", "location": "San Francisco"},
      "result": "找到 15 个匹配的职位"
    }
  ],
  "finishReason": "stop",
  "usage": {
    "promptTokens": 150,
    "completionTokens": 280
  }
}
```

---

## 16. Persistence Strategy

### 16.1 Incremental Persistence

为避免连接断开时丢失数据，采用增量持久化策略：

| 时机 | 持久化内容 |
|------|------------|
| 每个工具执行完成后 | 工具调用记录 |
| 每 N 秒 (可配置) | 部分 text/reasoning 内容 |
| 连接断开/abort 时 | 当前已生成的所有内容 |
| 正常完成时 | 完整消息记录 |

### 16.2 Implementation

```typescript
class JobsChatSession {
  private persistInterval: Timer | null = null;
  
  private startPeriodicPersist(): void {
    // Persist partial content every 5 seconds
    this.persistInterval = setInterval(async () => {
      await this.persistPartialMessage();
    }, 5000);
  }
  
  private async persistPartialMessage(): Promise<void> {
    await JobsChatHistory.upsert(this.conversationId, {
      id: this.messageId,
      role: "assistant",
      content: this.textContent,
      reasoning: this.reasoningContent || undefined,
      timestamp: new Date().toISOString(),
      finishReason: "incomplete",  // Mark as incomplete
    });
  }
}
```

---

## 17. Appendix

### A. pi-agent-core → AI SDK v6 Event Mapping

| pi-agent Event | AI SDK v6 Event |
|----------------|-----------------|
| (session start) | `start` |
| `message_update` + `thinking_delta` | `reasoning-start` → `reasoning-delta` → `reasoning-end` |
| `message_update` + `text_delta` | `text-start` → `text-delta` → `text-end` |
| `tool_call_start` | `tool-call` |
| `tool_call_result` | `tool-result` |
| `message_done` | `finish` |

### B. Related Files

| File | Description |
|------|-------------|
| `src/capabilities/jobs/agent.ts` | Jobs Agent factory |
| `src/capabilities/jobs/chat/index.ts` | Route handlers |
| `src/capabilities/jobs/chat/session.ts` | Chat session management |
| `src/capabilities/jobs/chat/stream-adapter.ts` | AI SDK v6 event adapter |
| `src/capabilities/jobs/chat/history.ts` | Conversation persistence |
| `src/capabilities/jobs/chat/types.ts` | Type definitions |
| `src/db/schema.ts` | Database schema |

### C. References

- [Vercel AI SDK v6 Documentation](https://ai-sdk.dev/docs)
- [AI SDK UI Message Stream Protocol](https://ai-sdk.dev/docs/ai-sdk-ui/stream-protocol)
- [pi-agent-core](https://github.com/mariozechner/pi-agent)
