import { db } from "../../../db";
import { jobAnalysis, jobs, resumes } from "../../../db/schema";
import { eq, and, desc } from "drizzle-orm";
import { LLMService } from "../../../services/llm";
import { ConfigManager } from "../../../core/config";
import crypto from "crypto";

const PROMPT_VERSION = "jobs-v1";

export interface AnalysisResult {
  overallScore: number;
  skillsMatch: string[];
  skillsGap: string[];
  suggestions: string[];
  rawAnalysis: string;
  cached: boolean;
  cachedAt?: string;
  model?: string;
}

function generatePromptHash(jobDescription: string, resumeContent: string, model: string): string {
  const combined = `${PROMPT_VERSION}::${model}::${jobDescription}::${resumeContent}`;
  return crypto.createHash("sha256").update(combined).digest("hex").substring(0, 32);
}

function parseAnalysisResult(rawAnalysis: string): Omit<AnalysisResult, "cached" | "cachedAt" | "model"> {
  let overallScore = 0;
  const skillsMatch: string[] = [];
  const skillsGap: string[] = [];
  const suggestions: string[] = [];

  const scoreMatch = rawAnalysis.match(/\*?\*?Match Score\*?\*?:?\s*\[?(\d+)/i);
  if (scoreMatch) {
    overallScore = parseInt(scoreMatch[1], 10);
  }

  const matchSection = rawAnalysis.match(/\*?\*?Matching Skills\*?\*?:?\s*\[?([^\]\n]+)/i);
  if (matchSection) {
    const skills = matchSection[1].split(/[,;]/).map(s => s.trim()).filter(Boolean);
    skillsMatch.push(...skills);
  }

  const gapSection = rawAnalysis.match(/\*?\*?Missing Skills\*?\*?:?\s*\[?([^\]\n]+)/i);
  if (gapSection) {
    const skills = gapSection[1].split(/[,;]/).map(s => s.trim()).filter(Boolean);
    skillsGap.push(...skills);
  }

  const strategySection = rawAnalysis.match(/\*?\*?Strategy\*?\*?:?\s*([^\n]+(?:\n(?!\*\*)[^\n]+)*)/i);
  if (strategySection) {
    suggestions.push(strategySection[1].trim());
  }

  return { overallScore, skillsMatch, skillsGap, suggestions, rawAnalysis };
}

export async function getCachedAnalysis(
  jobId: number,
  resumeId: number
): Promise<AnalysisResult | null> {
  const job = await db.select().from(jobs).where(eq(jobs.id, jobId)).get();
  const resume = await db.select().from(resumes).where(eq(resumes.id, resumeId)).get();

  if (!job || !resume || !job.description) {
    return null;
  }

  const model = await ConfigManager.get<string>("services.llm.model") ?? "unknown";
  const promptHash = generatePromptHash(job.description, resume.content, model);

  const cached = await db
    .select()
    .from(jobAnalysis)
    .where(
      and(
        eq(jobAnalysis.jobId, jobId),
        eq(jobAnalysis.resumeId, resumeId),
        eq(jobAnalysis.promptHash, promptHash)
      )
    )
    .limit(1)
    .get();

  if (!cached) {
    return null;
  }

  const parsed = parseAnalysisResult(cached.result);
  return {
    ...parsed,
    cached: true,
    cachedAt: cached.createdAt ?? undefined,
    model: cached.model,
  };
}

export async function getLatestAnalysis(
  jobId: number,
  resumeId: number
): Promise<AnalysisResult | null> {
  const cached = await db
    .select()
    .from(jobAnalysis)
    .where(
      and(
        eq(jobAnalysis.jobId, jobId),
        eq(jobAnalysis.resumeId, resumeId)
      )
    )
    .orderBy(desc(jobAnalysis.createdAt))
    .limit(1)
    .get();

  if (!cached) {
    return null;
  }

  const parsed = parseAnalysisResult(cached.result);
  return {
    ...parsed,
    cached: true,
    cachedAt: cached.createdAt ?? undefined,
    model: cached.model,
  };
}

export async function analyzeJobWithResume(
  jobId: number,
  resumeId: number,
  forceRefresh = false
): Promise<AnalysisResult> {
  const job = await db.select().from(jobs).where(eq(jobs.id, jobId)).get();
  const resume = await db.select().from(resumes).where(eq(resumes.id, resumeId)).get();

  if (!job) {
    throw new Error(`Job not found: ${jobId}`);
  }
  if (!resume) {
    throw new Error(`Resume not found: ${resumeId}`);
  }
  if (!job.description) {
    throw new Error(`Job ${jobId} has no description. Run enrichment first.`);
  }

  const model = await ConfigManager.get<string>("services.llm.model") ?? "unknown";
  const promptHash = generatePromptHash(job.description, resume.content, model);

  if (!forceRefresh) {
    const cached = await getCachedAnalysis(jobId, resumeId);
    if (cached) {
      return cached;
    }
  }

  const llm = new LLMService();
  const rawAnalysis = await llm.analyzeJob(job.description, resume.content);
  const parsed = parseAnalysisResult(rawAnalysis);

  await db.transaction(async (tx) => {
    if (parsed.overallScore > 0) {
      await tx
        .update(jobs)
        .set({ score: parsed.overallScore, analysis: rawAnalysis })
        .where(eq(jobs.id, jobId));
    }

    await tx
      .delete(jobAnalysis)
      .where(and(eq(jobAnalysis.jobId, jobId), eq(jobAnalysis.resumeId, resumeId)));

    await tx.insert(jobAnalysis).values({
      jobId,
      resumeId,
      model,
      promptHash,
      result: rawAnalysis,
    });

    await tx
      .update(resumes)
      .set({ useCount: (resume.useCount ?? 0) + 1 })
      .where(eq(resumes.id, resumeId));
  });

  return { ...parsed, cached: false, model };
}

export async function getOrAnalyzeJob(
  jobId: number,
  resumeId?: number
): Promise<{ analysis: AnalysisResult | null; resumeId: number | null }> {
  let effectiveResumeId = resumeId;
  if (!effectiveResumeId) {
    const defaultResume = await db
      .select()
      .from(resumes)
      .where(eq(resumes.isDefault, 1))
      .get();
    
    if (defaultResume) {
      effectiveResumeId = defaultResume.id;
    }
  }

  if (!effectiveResumeId) {
    return { analysis: null, resumeId: null };
  }

  const cached = await getCachedAnalysis(jobId, effectiveResumeId);
  if (cached) {
    return { analysis: cached, resumeId: effectiveResumeId };
  }

  return { analysis: null, resumeId: effectiveResumeId };
}

export async function getKeywordPreScore(
  jobId: number,
  resumeId: number
): Promise<number> {
  const job = await db.select().from(jobs).where(eq(jobs.id, jobId)).get();
  const resume = await db.select().from(resumes).where(eq(resumes.id, resumeId)).get();

  if (!job || !resume) {
    return 0;
  }

  const jobText = (job.description || `${job.subject} ${job.snippet || ""}`).toLowerCase();
  const resumeText = resume.content.toLowerCase();

  const techKeywords = [
    "typescript", "javascript", "react", "node", "python", "java", "go", "rust",
    "aws", "gcp", "azure", "kubernetes", "docker", "terraform",
    "postgres", "mongodb", "redis", "graphql", "rest", "api",
    "machine learning", "ml", "ai", "data science", "analytics",
    "agile", "scrum", "ci/cd", "devops", "sre",
    "senior", "staff", "lead", "principal", "architect",
  ];

  let matchCount = 0;
  let totalRelevant = 0;

  for (const keyword of techKeywords) {
    const inJob = jobText.includes(keyword);
    const inResume = resumeText.includes(keyword);

    if (inJob) {
      totalRelevant++;
      if (inResume) {
        matchCount++;
      }
    }
  }

  if (totalRelevant === 0) {
    return 50;
  }

  return Math.round((matchCount / totalRelevant) * 100);
}
