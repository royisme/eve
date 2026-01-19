import { Hono } from "hono";
import type { Context } from "hono";
import { cors } from "hono/cors";
import { streamSSE } from "hono/streaming";
import { bodyLimit } from "hono/body-limit";
import { AgentManager } from "./agents/manager";
import { getCapabilities } from "./capabilities";
import { Dispatcher } from "./core/dispatcher";
import { authMiddleware, validateToken } from "./core/auth";
import * as jobsApi from "./core/jobs-api";
import * as resumeApi from "./core/resume-api";
import { syncEmails } from "./capabilities/email/services/email-service";

const DEFAULT_PORT = 3033;
const MAX_CONTENT_SIZE = 20 * 1024 * 1024; // 20MB limit for PDFs

type IngestPayload = {
  url: string;
  content: string;
  timestamp: string;
};

export async function startServer(port: number = DEFAULT_PORT): Promise<void> {
  const app = new Hono();
  const agentManager = new AgentManager();
  const dispatcher = new Dispatcher();

  await agentManager.init();

  app.use("/*", cors());

  // Apply body limit globally for all POST/PUT/PATCH requests (pre-parse protection)
  app.use("/*", bodyLimit({
    maxSize: MAX_CONTENT_SIZE,
    onError: (c) => c.json({ error: `Request body too large (max ${MAX_CONTENT_SIZE / 1024 / 1024}MB)` }, 413),
  }));

  // Public health check
  app.get("/health", (c: Context) => {
    const agent = agentManager.getAgent();
    return c.json({
      status: "ok",
      version: "0.3.0",
      agent: {
        tools: agent.state.tools.map(t => t.name),
      }
    });
  });

  // Special case for SSE
  app.get("/jobs/sync", async (c: Context) => {
    const token = c.req.query("token");
    if (!token || !(await validateToken(token))) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    return streamSSE(c, async (stream) => {
      try {
        await syncEmails("from:linkedin OR from:indeed", 20, (progress) => {
          stream.writeSSE({
            data: JSON.stringify(progress),
            event: "message",
          });
        });
      } catch (e) {
        stream.writeSSE({
          data: JSON.stringify({ status: "error", message: (e as Error).message }),
          event: "message",
        });
      }
    });
  });

  // Protected routes
  const protectedApp = new Hono();
  protectedApp.use("/*", authMiddleware);

  protectedApp.get("/agent/status", (c: Context) => {
    return c.json({
      core: "Eve Agent v0.3",
      capabilities: getCapabilities().map(cap => ({
        name: cap.name,
        description: cap.description,
        tools: cap.tools.map(t => t.name)
      })),
    });
  });

  protectedApp.post("/chat", async (c: Context) => {
    const { prompt, agentName } = await c.req.json();
    const response = await agentManager.prompt(agentName, prompt);
    return c.json({ response });
  });

  protectedApp.post("/ingest", async (c: Context) => {
    let payload: IngestPayload;
    try {
      payload = await c.req.json() as IngestPayload;
    } catch {
      return c.json({ error: "Invalid JSON" }, 400);
    }
    
    if (!payload.url || typeof payload.url !== "string") return c.json({ error: "Missing url" }, 400);
    if (!payload.content || typeof payload.content !== "string") return c.json({ error: "Missing content" }, 400);
    
    const contentByteSize = Buffer.byteLength(payload.content, "utf8");
    if (contentByteSize > MAX_CONTENT_SIZE) {
      return c.json({ error: `Content too large (max ${MAX_CONTENT_SIZE / 1024 / 1024}MB)` }, 413);
    }
    
    const email = {
      id: `ext-${Date.now()}`,
      threadId: `thread-ext-${Date.now()}`,
      from: "chrome-extension",
      subject: `Page Ingest: ${payload.url}`,
      snippet: "Ingested via chrome extension",
      body: payload.content,
      date: new Date(payload.timestamp),
    };

    if (payload.url.includes("indeed.com")) {
      email.from = "alerts@indeed.com";
      email.subject = "Indeed Job Alert";
    } else if (payload.url.includes("linkedin.com")) {
      email.from = "jobs-listings@linkedin.com";
      email.subject = "LinkedIn Job Alert";
    }

    await dispatcher.dispatch(email);
    return c.json({ status: "ok" });
  });

  // Jobs API
  protectedApp.get("/jobs", async (c: Context) => {
    const params = {
      status: c.req.query("status"),
      starred: c.req.query("starred") === "true",
      limit: parseInt(c.req.query("limit") || "20"),
      offset: parseInt(c.req.query("offset") || "0"),
      search: c.req.query("search")
    };
    return c.json(await jobsApi.getJobs(params));
  });

  protectedApp.get("/jobs/stats", async (c: Context) => {
    return c.json(await jobsApi.getJobStats());
  });

  protectedApp.patch("/jobs/:id", async (c: Context) => {
    const id = parseInt(c.req.param("id"));
    const body = await c.req.json();
    return c.json({ job: await jobsApi.updateJob(id, body) });
  });

  protectedApp.post("/jobs/:id/star", async (c: Context) => {
    const id = parseInt(c.req.param("id"));
    const { starred } = await c.req.json();
    return c.json({ job: await jobsApi.updateJob(id, { starred }) });
  });

  // Resumes API
  protectedApp.get("/resumes", async (c: Context) => {
    return c.json({ resumes: await resumeApi.listResumes() });
  });

  protectedApp.post("/resumes", async (c: Context) => {
    const body = await c.req.json();
    return c.json({ resume: await resumeApi.createResume(body) });
  });

  protectedApp.get("/resumes/:id", async (c: Context) => {
    const id = parseInt(c.req.param("id"));
    return c.json({ resume: await resumeApi.getResume(id) });
  });

  protectedApp.put("/resumes/:id", async (c: Context) => {
    const id = parseInt(c.req.param("id"));
    const body = await c.req.json();
    return c.json({ resume: await resumeApi.updateResume(id, body) });
  });

  protectedApp.delete("/resumes/:id", async (c: Context) => {
    const id = parseInt(c.req.param("id"));
    return c.json(await resumeApi.deleteResume(id));
  });

  protectedApp.post("/resumes/:id/default", async (c: Context) => {
    const id = parseInt(c.req.param("id"));
    return c.json({ resume: await resumeApi.setDefaultResume(id) });
  });

  // Mount protected routes
  app.route("/", protectedApp);

  console.log(`🔌 Eve HTTP API listening on http://localhost:${port}`);
  console.log(`   Endpoints: /health, /agent/status, /chat, /ingest, /jobs, /resumes`);

  Bun.serve({
    port,
    fetch: app.fetch,
  });
}

if (import.meta.main) {
  const port = parseInt(process.env.PORT || String(DEFAULT_PORT), 10);
  await startServer(port);
}
