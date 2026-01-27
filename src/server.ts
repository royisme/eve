import { Hono } from "hono";
import type { Context } from "hono";
import { cors } from "hono/cors";
import { streamSSE } from "hono/streaming";
import { bodyLimit } from "hono/body-limit";
import { getEveService } from "./core/eve-service";
import { getCapabilities } from "./capabilities";
import { Dispatcher } from "./core/dispatcher";
import { authMiddleware, validateToken } from "./core/auth";
import * as jobsApi from "./core/jobs-api";
import * as resumeApi from "./core/resume-api";
import * as tailorApi from "./core/tailor-api";
import { syncEmails, getFullAuthStatus } from "./capabilities/email/services/email-service";
import { Scheduler } from "./core/scheduler";
import { getFunnelMetrics } from "./capabilities/analytics/services/funnel";
import { getSkillsAnalytics } from "./capabilities/analytics/services/skills";
import { jobsChat } from "./capabilities/jobs/chat";
import "./core/scheduler-executors";

const DEFAULT_PORT = 3033;
const MAX_CONTENT_SIZE = 20 * 1024 * 1024;

type IngestPayload = {
  url: string;
  content: string;
  timestamp: string;
};

export async function createApp(): Promise<Hono> {
  const app = new Hono();
  const eveService = getEveService();
  const dispatcher = new Dispatcher();

  await eveService.init();
  
  await Scheduler.start();

  app.use("/*", cors());

  app.use("/*", bodyLimit({
    maxSize: MAX_CONTENT_SIZE,
    onError: (c) => c.json({ error: `Request body too large (max ${MAX_CONTENT_SIZE / 1024 / 1024}MB)` }, 413),
  }));

  app.get("/health", async (c: Context) => {
    const caps = await getCapabilities();
    return c.json({
      status: "ok",
      version: "0.3.0",
      capabilities: caps.map((cap) => cap.name),
    });
  });

  app.get("/auth/verify", async (c: Context) => {
    const token = c.req.header("x-eve-token");
    
    if (!token) {
      return c.json({ valid: false, reason: "no_token" });
    }
    
    const isValid = await validateToken(token);
    return c.json({ 
      valid: isValid, 
      reason: isValid ? undefined : "invalid_token" 
    });
  });

  // Special case for SSE
  app.get("/jobs/sync", async (c: Context) => {
    const token = c.req.header("x-eve-token") || c.req.query("token");
    if (!token || !(await validateToken(token))) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    return streamSSE(c, async (stream) => {
      try {
        await syncEmails(
          "from:linkedin OR from:indeed OR from:glassdoor OR from:greenhouse OR from:lever",
          20,
          (progress) => {
          stream.writeSSE({
            data: JSON.stringify(progress),
            event: "message",
          });
          }
        );
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

  protectedApp.get("/agent/status", async (c: Context) => {
    const caps = await getCapabilities();
    return c.json({
      core: "Eve Agent v0.3",
      capabilities: caps.map(cap => ({
        name: cap.name,
        description: cap.description,
        tools: cap.tools.map(t => t.name)
      })),
    });
  });

  protectedApp.get("/email/status", async (c: Context) => {
    const status = await getFullAuthStatus();
    return c.json(status);
  });

  protectedApp.post("/chat", async (c: Context) => {
    const { prompt } = await c.req.json();
    const response = await eveService.prompt(prompt);
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

  protectedApp.post("/jobs", async (c: Context) => {
    const body = await c.req.json();
    if (!body.title || typeof body.title !== "string") {
      return c.json({ error: "title is required" }, 400);
    }
    if (!body.company || typeof body.company !== "string") {
      return c.json({ error: "company is required" }, 400);
    }
    if (!body.url || typeof body.url !== "string") {
      return c.json({ error: "url is required" }, 400);
    }
    try {
      const job = await jobsApi.createJob({
        title: body.title,
        company: body.company,
        url: body.url,
        location: body.location,
        source: body.source || "manual",
      });
      return c.json({ job });
    } catch (e) {
      return c.json({ error: (e as Error).message }, 400);
    }
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
    const id = Number(c.req.param("id"));
    if (!Number.isFinite(id)) return c.json({ error: "Invalid job id" }, 400);
    const { starred } = await c.req.json();
    return c.json({ job: await jobsApi.updateJob(id, { starred }) });
  });

  protectedApp.get("/jobs/:id", async (c: Context) => {
    const id = Number(c.req.param("id"));
    if (!Number.isFinite(id)) return c.json({ error: "Invalid job id" }, 400);
    const job = await jobsApi.getJobById(id);
    if (!job) {
      return c.json({ error: "Job not found" }, 404);
    }
    const resumeIdRaw = c.req.query("resumeId");
    let analysis = null;
    if (resumeIdRaw) {
      const resumeId = Number(resumeIdRaw);
      if (!Number.isFinite(resumeId)) return c.json({ error: "Invalid resumeId" }, 400);
      const result = await jobsApi.getJobAnalysis(id, resumeId);
      analysis = result.analysis;
    }
    return c.json({ job, analysis });
  });

  protectedApp.get("/jobs/:id/analysis", async (c: Context) => {
    const id = Number(c.req.param("id"));
    if (!Number.isFinite(id)) return c.json({ error: "Invalid job id" }, 400);
    const resumeIdRaw = c.req.query("resumeId");
    if (!resumeIdRaw) {
      return c.json({ error: "resumeId query parameter required" }, 400);
    }
    const resumeId = Number(resumeIdRaw);
    if (!Number.isFinite(resumeId)) return c.json({ error: "Invalid resumeId" }, 400);
    return c.json(await jobsApi.getJobAnalysis(id, resumeId));
  });

  protectedApp.post("/jobs/:id/analyze", async (c: Context) => {
    const id = Number(c.req.param("id"));
    if (!Number.isFinite(id)) return c.json({ error: "Invalid job id" }, 400);
    const { resumeId, forceRefresh } = await c.req.json();
    if (!resumeId || typeof resumeId !== "number" || !Number.isFinite(resumeId)) {
      return c.json({ error: "resumeId (number) required in body" }, 400);
    }
    try {
      const result = await jobsApi.analyzeJob(id, resumeId, forceRefresh ?? false);
      return c.json(result);
    } catch (e) {
      return c.json({ error: (e as Error).message }, 400);
    }
  });

  protectedApp.get("/jobs/:id/prescore", async (c: Context) => {
    const id = Number(c.req.param("id"));
    if (!Number.isFinite(id)) return c.json({ error: "Invalid job id" }, 400);
    const resumeIdRaw = c.req.query("resumeId");
    if (!resumeIdRaw) {
      return c.json({ error: "resumeId query parameter required" }, 400);
    }
    const resumeId = Number(resumeIdRaw);
    if (!Number.isFinite(resumeId)) return c.json({ error: "Invalid resumeId" }, 400);
    return c.json(await jobsApi.getPreScore(id, resumeId));
  });

  // Analytics API
  protectedApp.get("/analytics/funnel", async (c: Context) => {
    const period = c.req.query("period") || "all";
    return c.json(await getFunnelMetrics(period));
  });

  protectedApp.get("/analytics/skills", async (c: Context) => {
    const result = await getSkillsAnalytics();
    return c.json({
      top: result.topSkills.map((skill) => ({
        skill: skill.skill,
        matchCount: skill.jobCount,
      })),
      gaps: result.skillGaps.map((gap) => ({
        skill: gap.skill,
        mentionCount: gap.inJobs,
        inResume: gap.inResume,
      })),
    });
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

  protectedApp.get("/resumes/:id/status", async (c: Context) => {
    const id = parseInt(c.req.param("id"));
    if (!Number.isFinite(id)) return c.json({ error: "Invalid resume id" }, 400);
    try {
      const status = await resumeApi.getResumeStatus(id);
      return c.json(status);
    } catch (e) {
      return c.json({ error: (e as Error).message }, 404);
    }
  });

  protectedApp.get("/resumes/:id/versions", async (c: Context) => {
    const id = parseInt(c.req.param("id"));
    if (!Number.isFinite(id)) return c.json({ error: "Invalid resume id" }, 400);
    const result = await resumeApi.getResumeVersions(id);
    return c.json(result);
  });

  protectedApp.post("/resumes/tailored/:id/pdf", async (c: Context) => {
    const id = Number(c.req.param("id"));
    if (!Number.isFinite(id)) return c.json({ error: "Invalid tailored resume id" }, 400);
    
    try {
      const formData = await c.req.formData();
      const file = formData.get("file") as File | null;
      
      if (!file) {
        return c.json({ error: "No file provided" }, 400);
      }
      
      const buffer = Buffer.from(await file.arrayBuffer());
      const result = await resumeApi.uploadTailoredPdf(id, buffer, file.name);
      return c.json(result);
    } catch (e) {
      return c.json({ error: (e as Error).message }, 400);
    }
  });

  // Tailor API
  protectedApp.post("/tailor/:jobId", async (c: Context) => {
    const jobId = Number(c.req.param("jobId"));
    if (!Number.isFinite(jobId)) return c.json({ error: "Invalid job id" }, 400);
    const body = await c.req.json();
    const resumeId = Number(body.resumeId);
    if (!Number.isFinite(resumeId)) return c.json({ error: "Invalid resumeId" }, 400);
    const forceNew = body.forceNew === true;
    try {
      const result = await tailorApi.tailorResume(jobId, resumeId, forceNew);
      return c.json(result);
    } catch (e) {
      return c.json({ error: (e as Error).message }, 400);
    }
  });

  protectedApp.get("/tailor/:jobId", async (c: Context) => {
    const jobId = Number(c.req.param("jobId"));
    if (!Number.isFinite(jobId)) return c.json({ error: "Invalid job id" }, 400);
    const resumeIdRaw = c.req.query("resumeId");
    const resumeId = resumeIdRaw ? Number(resumeIdRaw) : undefined;
    if (resumeId !== undefined && !Number.isFinite(resumeId)) {
      return c.json({ error: "Invalid resumeId" }, 400);
    }
    const versions = await tailorApi.getTailoredVersions(jobId, resumeId);
    return c.json({ versions });
  });

  protectedApp.put("/tailor/:id", async (c: Context) => {
    const id = Number(c.req.param("id"));
    if (!Number.isFinite(id)) return c.json({ error: "Invalid tailor id" }, 400);
    const body = await c.req.json();
    if (!body.content || typeof body.content !== "string") {
      return c.json({ error: "content is required" }, 400);
    }
    try {
      const result = await tailorApi.updateTailoredResume(id, body.content);
      return c.json({ tailoredResume: result });
    } catch (e) {
      return c.json({ error: (e as Error).message }, 400);
    }
  });

  // Mount protected routes
  protectedApp.route("/jobs/chat", jobsChat);
  app.route("/", protectedApp);

  app.get("/api/scheduler/status", async (c: Context) => {
    return c.json(await Scheduler.getStatus());
  });

  app.post("/api/scheduler/jobs/:jobId/run", async (c: Context) => {
    const jobId = parseInt(c.req.param("jobId"));
    await Scheduler.runNow(jobId);
    return c.json({ success: true });
  });

  app.get("/api/scheduler/events", (c: Context) => {
    const events = Scheduler.consumeMainSessionEvents();
    return c.json({ events });
  });

  return app;
}

export async function startServer(port: number = DEFAULT_PORT): Promise<void> {
  const app = await createApp();

  console.log(`🔌 Eve HTTP API listening on http://localhost:${port}`);
  console.log(`   Endpoints: /health, /agent/status, /chat, /jobs/chat, /ingest, /jobs, /resumes, /tailor`);
  const schedulerStatus = await Scheduler.getStatus();
  console.log(`📅 Gateway Scheduler: ${schedulerStatus.jobCount} jobs active`);

  Bun.serve({
    port,
    fetch: app.fetch,
  });
}


if (import.meta.main) {
  const port = parseInt(process.env.PORT || String(DEFAULT_PORT), 10);
  await startServer(port);
}
