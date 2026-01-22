import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import type { Context } from "hono";
import { JobsChatSession } from "./session";
import { AISDKStreamAdapter } from "./stream-adapter";
import { JobsChatHistory } from "./history";
import type { JobsChatRequest } from "./types";

const jobsChat = new Hono();

jobsChat.post("/", async (c: Context) => {
  const body = await c.req.json<JobsChatRequest>();

  if (!body.messages || body.messages.length === 0) {
    return c.json({ error: "messages is required" }, 400);
  }

  c.header("Content-Type", "text/event-stream");
  c.header("Cache-Control", "no-cache");
  c.header("Connection", "keep-alive");
  c.header("x-vercel-ai-ui-message-stream", "v1");
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
      adapter.close();
    }
  });
});

jobsChat.get("/history", async (c: Context) => {
  const conversationId = c.req.query("conversationId");
  if (!conversationId) {
    return c.json({ error: "conversationId is required" }, 400);
  }

  const history = await JobsChatHistory.get(conversationId);
  return c.json(history);
});

jobsChat.get("/conversations", async (c: Context) => {
  const limitStr = c.req.query("limit");
  const limit = limitStr ? parseInt(limitStr, 10) : 50;

  const conversations = await JobsChatHistory.listConversations(limit);
  return c.json({ conversations });
});

jobsChat.post("/stop", async (c: Context) => {
  const { messageId } = await c.req.json<{ messageId: string }>();

  if (!messageId) {
    return c.json({ error: "messageId is required" }, 400);
  }

  const stopped = JobsChatSession.stop(messageId);
  return c.json({ stopped });
});

export { jobsChat };
