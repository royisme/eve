import { Hono } from "hono";
import type { Context } from "hono";
import { cors } from "hono/cors";
import { AgentManager } from "./agents/manager";
import { getCapabilities } from "./capabilities";
import { Dispatcher } from "./core/dispatcher";

const DEFAULT_PORT = 3033;

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

  app.get("/agent/status", (c: Context) => {
    return c.json({
      core: "Eve Agent v0.3",
      capabilities: getCapabilities().map(cap => ({
        name: cap.name,
        description: cap.description,
        tools: cap.tools.map(t => t.name)
      })),
    });
  });

  app.post("/chat", async (c: Context) => {
    const { prompt, agentName } = await c.req.json();
    const response = await agentManager.prompt(agentName, prompt);
    return c.json({ response });
  });

  app.post("/ingest", async (c: Context) => {
    const payload = await c.req.json() as IngestPayload;
    console.log(`[server] ingest url=${payload.url}`);

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

  app.post("/ui", async (c: Context) => {
    return c.json({
      components: [
        { type: "Button", label: "Analyze Job", action: "analyze" }
      ]
    });
  });

  app.post("/generate-resume", async (c: Context) => {
    const body = await c.req.json();
    return c.json({
      status: "success",
      pdfUrl: `http://localhost:${port}/download/resume.pdf`,
      markdown: body.markdown + "\n\n(Tailored by Eve)"
    });
  });

  console.log(`🔌 Eve HTTP API listening on http://localhost:${port}`);
  console.log(`   Endpoints: /health, /agent/status, /chat, /ingest`);
  console.log(`   For direct interaction, use: eve (TUI) or eve <command> (CLI)`);

  Bun.serve({
    port,
    fetch: app.fetch,
  });
}

if (import.meta.main) {
  const port = parseInt(process.env.PORT || String(DEFAULT_PORT), 10);
  await startServer(port);
}
