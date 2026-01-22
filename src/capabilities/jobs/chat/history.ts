import { db } from "../../../db";
import { conversations, chatMessages } from "../../../db/schema";
import { eq, and, desc } from "drizzle-orm";
import type { StoredMessage, ToolInvocation, FinishReason } from "./types";

export interface ConversationRecord {
  id: string;
  agentId: string;
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
}

export interface MessageRecord {
  id: string;
  conversationId: string;
  role: "user" | "assistant";
  content: string;
  reasoning?: string;
  toolCalls?: ToolInvocation[];
  timestamp: string;
  finishReason?: FinishReason;
  usage?: { inputTokens: number; outputTokens: number };
}

export class JobsChatHistory {
  static async get(conversationId: string): Promise<{
    conversation: ConversationRecord | null;
    messages: MessageRecord[];
  }> {
    const conv = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, conversationId))
      .get();

    if (!conv) {
      return { conversation: null, messages: [] };
    }

    const msgs = await db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.conversationId, conversationId))
      .orderBy(chatMessages.timestamp)
      .all();

    return {
      conversation: {
        id: conv.id,
        agentId: conv.agentId,
        createdAt: conv.createdAt,
        updatedAt: conv.updatedAt,
        metadata: conv.metadata ? JSON.parse(conv.metadata) : undefined,
      },
      messages: msgs.map((m) => ({
        id: m.id,
        conversationId: m.conversationId,
        role: m.role as "user" | "assistant",
        content: m.content,
        reasoning: m.reasoning ?? undefined,
        toolCalls: m.toolCalls ? JSON.parse(m.toolCalls) : undefined,
        timestamp: m.timestamp,
        finishReason: m.finishReason as FinishReason | undefined,
        usage: m.usage ? JSON.parse(m.usage) : undefined,
      })),
    };
  }

  static async save(conversationId: string, message: StoredMessage): Promise<void> {
    await this.ensureConversation(conversationId);

    await db.insert(chatMessages).values({
      id: message.id,
      conversationId,
      role: message.role,
      content: message.content,
      reasoning: message.reasoning ?? null,
      toolCalls: message.toolCalls ? JSON.stringify(message.toolCalls) : null,
      timestamp: message.timestamp,
      finishReason: message.finishReason ?? null,
      usage: message.usage ? JSON.stringify(message.usage) : null,
      createdAt: new Date().toISOString(),
    });

    await db
      .update(conversations)
      .set({ updatedAt: new Date().toISOString() })
      .where(eq(conversations.id, conversationId));
  }

  static async upsert(conversationId: string, message: Partial<StoredMessage> & { id: string }): Promise<void> {
    await this.ensureConversation(conversationId);

    const existing = await db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.id, message.id))
      .get();

    if (existing) {
      await db
        .update(chatMessages)
        .set({
          content: message.content ?? existing.content,
          reasoning: message.reasoning ?? existing.reasoning,
          toolCalls: message.toolCalls ? JSON.stringify(message.toolCalls) : existing.toolCalls,
          finishReason: message.finishReason ?? existing.finishReason,
          usage: message.usage ? JSON.stringify(message.usage) : existing.usage,
        })
        .where(eq(chatMessages.id, message.id));
    } else {
      await db.insert(chatMessages).values({
        id: message.id,
        conversationId,
        role: message.role ?? "assistant",
        content: message.content ?? "",
        reasoning: message.reasoning ?? null,
        toolCalls: message.toolCalls ? JSON.stringify(message.toolCalls) : null,
        timestamp: message.timestamp ?? new Date().toISOString(),
        finishReason: message.finishReason ?? null,
        usage: message.usage ? JSON.stringify(message.usage) : null,
        createdAt: new Date().toISOString(),
      });
    }

    await db
      .update(conversations)
      .set({ updatedAt: new Date().toISOString() })
      .where(eq(conversations.id, conversationId));
  }

  static async listConversations(limit = 50): Promise<ConversationRecord[]> {
    const convs = await db
      .select()
      .from(conversations)
      .where(eq(conversations.agentId, "jobs"))
      .orderBy(desc(conversations.updatedAt))
      .limit(limit)
      .all();

    return convs.map((c) => ({
      id: c.id,
      agentId: c.agentId,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      metadata: c.metadata ? JSON.parse(c.metadata) : undefined,
    }));
  }

  private static async ensureConversation(conversationId: string): Promise<void> {
    const existing = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, conversationId))
      .get();

    if (!existing) {
      const now = new Date().toISOString();
      await db.insert(conversations).values({
        id: conversationId,
        agentId: "jobs",
        createdAt: now,
        updatedAt: now,
      });
    }
  }
}
