import { Type } from "@sinclair/typebox";
import type { AgentTool } from "@mariozechner/pi-agent-core";
import { tailorResumeForJob, getTailoredVersions } from "../services/tailor.js";
import { db } from "../../../db/index.js";
import { resumes } from "../../../db/schema.js";
import { eq } from "drizzle-orm";

export const tailorResumeTool: AgentTool<any, any> = {
  name: "job_tailor_resume",
  label: "Tailor Resume for Job",
  description: "Generate a tailored version of a resume optimized for a specific job posting using AI. Creates or retrieves cached tailored resume.",
  parameters: Type.Object({
    jobId: Type.Number({ description: "The job ID to tailor the resume for" }),
    resumeId: Type.Optional(Type.Number({ description: "Resume ID to tailor (uses default resume if not specified)" })),
    forceNew: Type.Optional(Type.Boolean({ description: "Force creation of new version even if one exists (default: false)" })),
  }),
  execute: async (_toolCallId, params, _signal, onUpdate) => {
    let effectiveResumeId = params.resumeId;

    if (!effectiveResumeId) {
      const defaultResume = await db
        .select()
        .from(resumes)
        .where(eq(resumes.isDefault, 1))
        .get();

      if (!defaultResume) {
        return {
          content: [{ type: "text", text: "No default resume found. Please import a resume first or specify a resumeId." }],
          details: { error: "no_default_resume" },
        };
      }

      effectiveResumeId = defaultResume.id;
    }

    onUpdate?.({
      content: [{ type: "text", text: `Tailoring resume for job ${params.jobId}...` }],
      details: { status: "tailoring", jobId: params.jobId, resumeId: effectiveResumeId },
    });

    try {
      const result = await tailorResumeForJob(params.jobId, effectiveResumeId, params.forceNew ?? false);

      const statusMsg = result.isNew
        ? `Created new tailored resume (version ${result.version})`
        : `Retrieved existing tailored resume (version ${result.version})`;

      onUpdate?.({
        content: [{ type: "text", text: statusMsg }],
        details: { ...result, status: "complete" },
      });

      return {
        content: [
          { type: "text", text: `${statusMsg}\n\nSuggestions:\n${result.suggestions.map((s, i) => `${i + 1}. ${s}`).join("\n")}` },
        ],
        details: result,
      };
    } catch (e) {
      const errorMsg = `Failed to tailor resume: ${(e as Error).message}`;
      return {
        content: [{ type: "text", text: errorMsg }],
        details: { error: (e as Error).message },
      };
    }
  },
};

export const getTailoredVersionsTool: AgentTool<any, any> = {
  name: "job_get_tailored_versions",
  label: "Get Tailored Resume Versions",
  description: "Retrieve all tailored resume versions for a specific job",
  parameters: Type.Object({
    jobId: Type.Number({ description: "The job ID" }),
    resumeId: Type.Optional(Type.Number({ description: "Optional: filter by specific resume ID" })),
  }),
  execute: async (_toolCallId, params) => {
    const versions = await getTailoredVersions(params.jobId, params.resumeId);

    if (versions.length === 0) {
      return {
        content: [{ type: "text", text: "No tailored resume versions found for this job." }],
        details: { versions: [] },
      };
    }

    const summary = versions
      .map((v) => `Version ${v.version}: Created ${v.createdAt}${v.isLatest ? " (latest)" : ""}`)
      .join("\n");

    return {
      content: [{ type: "text", text: `Found ${versions.length} tailored version(s):\n${summary}` }],
      details: { versions },
    };
  },
};
