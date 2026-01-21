import { Type } from "@sinclair/typebox";
import type { AgentTool } from "@mariozechner/pi-agent-core";
import { analyzePendingJobs } from "../services/jobs-service";
import { analyzeJobWithResume, getCachedAnalysis, getKeywordPreScore } from "../services/analysis-cache";
import { db } from "../../../db";
import { resumes } from "../../../db/schema";
import { eq } from "drizzle-orm";

export const analyzeJobsTool: AgentTool<any, any> = {
  name: "jobs_analyze",
  label: "Analyze Jobs",
  description: "Analyze job descriptions against the user's resume using LLM. Generates match scores and recommendations.",
  parameters: Type.Object({
    limit: Type.Optional(Type.Number({ description: "Maximum number of jobs to analyze (processes all if not specified)" })),
  }),
  execute: async (_toolCallId, params, _signal, onUpdate) => {
    onUpdate?.({
      content: [{ type: "text", text: "Starting AI analysis of jobs..." }],
      details: { status: "starting" }
    });

    const result = await analyzePendingJobs(params.limit);

    onUpdate?.({
      content: [{ type: "text", text: `Analyzed ${result.analyzed} of ${result.processed} jobs` }],
      details: result
    });

    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      details: result,
    };
  },
};

export const analyzeJobTool: AgentTool<any, any> = {
  name: "job_analyze",
  label: "Analyze Single Job",
  description: "Analyze a specific job against a specific resume. Uses cached analysis if available.",
  parameters: Type.Object({
    jobId: Type.Number({ description: "The job ID to analyze" }),
    resumeId: Type.Optional(Type.Number({ description: "Resume ID to compare against (uses default resume if not specified)" })),
    forceRefresh: Type.Optional(Type.Boolean({ description: "Force re-analysis even if cached (default: false)" })),
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
          content: [{ type: "text", text: "No default resume set. Please import a resume first or specify a resumeId." }],
          details: { error: "no_default_resume" },
        };
      }
      effectiveResumeId = defaultResume.id;
    }

    if (!params.forceRefresh) {
      const cached = await getCachedAnalysis(params.jobId, effectiveResumeId);
      if (cached) {
        return {
          content: [{ type: "text", text: cached.rawAnalysis }],
          details: { 
            ...cached,
            source: "cache",
            resumeId: effectiveResumeId,
          },
        };
      }
    }

    onUpdate?.({
      content: [{ type: "text", text: "Analyzing job with LLM..." }],
      details: { status: "analyzing", jobId: params.jobId, resumeId: effectiveResumeId }
    });

    try {
      const analysis = await analyzeJobWithResume(params.jobId, effectiveResumeId, params.forceRefresh ?? false);
      
      return {
        content: [{ type: "text", text: analysis.rawAnalysis }],
        details: {
          ...analysis,
          source: "llm",
          resumeId: effectiveResumeId,
        },
      };
    } catch (e) {
      return {
        content: [{ type: "text", text: `Analysis failed: ${(e as Error).message}` }],
        details: { error: (e as Error).message },
      };
    }
  },
};

export const jobPreScoreTool: AgentTool<any, any> = {
  name: "job_prescore",
  label: "Quick Score Job",
  description: "Get a quick keyword-based match score without using LLM. Useful for quick filtering.",
  parameters: Type.Object({
    jobId: Type.Number({ description: "The job ID to score" }),
    resumeId: Type.Optional(Type.Number({ description: "Resume ID to compare against (uses default resume if not specified)" })),
  }),
  execute: async (_toolCallId, params) => {
    let effectiveResumeId = params.resumeId;

    if (!effectiveResumeId) {
      const defaultResume = await db
        .select()
        .from(resumes)
        .where(eq(resumes.isDefault, 1))
        .get();
      
      if (!defaultResume) {
        return {
          content: [{ type: "text", text: "No default resume set." }],
          details: { error: "no_default_resume" },
        };
      }
      effectiveResumeId = defaultResume.id;
    }

    const result = await getKeywordPreScore(params.jobId, effectiveResumeId);

    return {
      content: [{ type: "text", text: `Quick match score: ${result.score}% (keyword-based, not AI analysis)` }],
      details: { score: result.score, keywords: result.keywords, resumeId: effectiveResumeId, method: "keyword" },
    };
  },
};
