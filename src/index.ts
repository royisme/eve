import { Hono } from "hono";
import type { Context } from "hono";
import { cors } from "hono/cors";
import { AgentManager } from "./agents/manager";
import { getCapabilities } from "./capabilities";

const app = new Hono();
const agentManager = new AgentManager();

// Initialize Agent and Capabilities
await agentManager.init();

app.use("/*", cors());

// --- Health & Identity ---
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

// --- Agent Status ---
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

// --- Chat/Prompt API ---
app.post("/chat", async (c: Context) => {
  const { prompt, agentName } = await c.req.json();
  const response = await agentManager.prompt(agentName, prompt);
  return c.json({ response });
});

// --- Legacy: Module API (Keep for now) ---
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
    pdfUrl: "http://localhost:3033/download/resume.pdf",
    markdown: body.markdown + "\n\n(Tailored by Eve)"
  });
});

export default {
  port: 3033,
  fetch: app.fetch,
};
