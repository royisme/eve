import { db } from "../db";
import { jobs, jobStatusHistory } from "../db/schema";
import { desc, eq, like, and, or, sql } from "drizzle-orm";
import {
  getCachedAnalysis,
  analyzeJobWithResume,
  getKeywordPreScore,
  type AnalysisResult,
} from "../capabilities/jobs/services/analysis-cache";
import { generateUrlHash } from "../capabilities/jobs/services/dedup";

const VALID_STATUSES = ["inbox", "applied", "interviewing", "offer", "rejected", "skipped"] as const;
const MAX_LIMIT = 100;

const LEGACY_STATUS_MAP: Record<typeof VALID_STATUSES[number], string[]> = {
  inbox: ["New"],
  applied: ["Applied"],
  interviewing: ["Interview"],
  offer: ["Offer"],
  rejected: ["Rejected"],
  skipped: ["Skipped"],
};

const ALL_VALID_STATUS_VALUES = new Set([
  ...VALID_STATUSES,
  ...Object.values(LEGACY_STATUS_MAP).flat(),
].map((s) => s.toLowerCase()));

function isValidRawStatus(status: string): boolean {
  return ALL_VALID_STATUS_VALUES.has(status.toLowerCase());
}

function normalizeStatus(status?: string | null): typeof VALID_STATUSES[number] {
  if (!status) return "inbox";
  const lower = status.toLowerCase();
  if (VALID_STATUSES.includes(lower as typeof VALID_STATUSES[number])) {
    return lower as typeof VALID_STATUSES[number];
  }
  const legacyEntry = Object.entries(LEGACY_STATUS_MAP).find(([, values]) =>
    values.map((value) => value.toLowerCase()).includes(lower)
  );
  return (legacyEntry?.[0] ?? "inbox") as typeof VALID_STATUSES[number];
}

function getStatusVariants(status: string): string[] {
  const normalized = normalizeStatus(status);
  const legacy = LEGACY_STATUS_MAP[normalized] ?? [];
  return [normalized, ...legacy];
}

function inferSource(job: typeof jobs.$inferSelect): "linkedin" | "indeed" | "email" | "manual" {
  const sender = (job.sender || "").toLowerCase();
  const url = (job.url || "").toLowerCase();

  if (sender === "manual") return "manual";
  if (sender.includes("linkedin") || url.includes("linkedin.com")) return "linkedin";
  if (sender.includes("indeed") || url.includes("indeed.com")) return "indeed";
  if (sender === "manual" || sender === "") return "manual";
  return "email";
}

function toJobResponse(job: typeof jobs.$inferSelect) {
  return {
    id: job.id,
    title: job.title ?? "Unknown",
    company: job.company ?? "Unknown",
    location: job.snippet ?? "",
    url: job.url ?? "",
    status: normalizeStatus(job.status),
    matchScore: job.score ?? undefined,
    source: inferSource(job),
    jdMarkdown: job.description ?? undefined,
    createdAt: job.createdAt ?? job.receivedAt,
    appliedAt: job.appliedAt ?? undefined,
    starred: job.starred === 1,
  };
}

function toJobAnalysisResponse(result: AnalysisResult, jobId: number, resumeId: number) {
  return {
    id: result.analysisId ?? null,
    jobId,
    resumeId,
    overallScore: result.overallScore,
    strengths: result.skillsMatch,
    gaps: result.skillsGap,
    suggestions: result.suggestions,
    createdAt: result.createdAt ?? result.cachedAt ?? new Date().toISOString(),
    cached: result.cached,
  };
}

function escapeSearchPattern(search: string): string {
  return search.replace(/%/g, "\\%").replace(/_/g, "\\_");
}

export async function getJobs(params: {
  status?: string;
  starred?: boolean;
  limit?: number;
  offset?: number;
  search?: string;
}) {
  const { status, starred, search } = params;
  const safeLimit = Math.min(Math.max(params.limit ?? 20, 1), MAX_LIMIT);
  const safeOffset = Math.max(params.offset ?? 0, 0);
  
  let conditions = [];
  
  if (status && status !== "all") {
    if (!isValidRawStatus(status)) {
      throw new Error(`Invalid status: ${status}. Valid values: ${Array.from(ALL_VALID_STATUS_VALUES).join(", ")}`);
    }
    const normalized = normalizeStatus(status);
    const variants = getStatusVariants(normalized);
    if (variants.length === 1) {
      conditions.push(eq(jobs.status, variants[0]));
    } else {
      conditions.push(or(...variants.map((value) => eq(jobs.status, value))));
    }
  }
  
  if (starred) {
    conditions.push(eq(jobs.starred, 1));
  }
  
  if (search) {
    const escapedSearch = escapeSearchPattern(search);
    conditions.push(
      or(
        like(jobs.title, `%${escapedSearch}%`),
        like(jobs.company, `%${escapedSearch}%`),
        like(jobs.snippet, `%${escapedSearch}%`)
      )
    );
  }
  
  const queryBase = db.select().from(jobs);
  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
  
  const result = await queryBase
    .where(whereClause)
    .orderBy(desc(jobs.receivedAt))
    .limit(safeLimit)
    .offset(safeOffset);
    
  const countResult = await db.select({ count: sql<number>`count(*)` })
    .from(jobs)
    .where(whereClause);
    
  return {
    jobs: result.map(toJobResponse),
    total: countResult[0]?.count || 0
  };
}

export async function getJobStats() {
  const stats = await db.select({
    status: jobs.status,
    count: sql<number>`count(*)`
  })
  .from(jobs)
  .groupBy(jobs.status);

  const result: Record<typeof VALID_STATUSES[number], number> = {
    inbox: 0,
    applied: 0,
    interviewing: 0,
    offer: 0,
    rejected: 0,
    skipped: 0
  };

  stats.forEach(s => {
    const normalized = normalizeStatus(s.status);
    if (result[normalized] !== undefined) {
      result[normalized] += s.count;
    }
  });

  return result;
}

export async function updateJob(id: number, data: Partial<{
  status: string;
  starred: boolean;
  score: number;
}>) {
  const existing = await db.select().from(jobs).where(eq(jobs.id, id)).get();
  if (!existing) {
    throw new Error("Job not found");
  }

  // Validate raw input before normalization to reject invalid statuses
  if (data.status !== undefined && !isValidRawStatus(data.status)) {
    throw new Error(`Invalid status: ${data.status}. Valid values: ${Array.from(ALL_VALID_STATUS_VALUES).join(", ")}`);
  }

  const nextStatus = data.status ? normalizeStatus(data.status) : null;

  const updateData: Record<string, unknown> = {};
  if (nextStatus) updateData.status = nextStatus;
  if (data.starred !== undefined) updateData.starred = data.starred ? 1 : 0;
  if (data.score !== undefined) updateData.score = data.score;

  if (nextStatus === "applied") {
    updateData.appliedAt = new Date().toISOString();
  }

  await db.update(jobs)
    .set(updateData)
    .where(eq(jobs.id, id));

  if (nextStatus && normalizeStatus(existing.status) !== nextStatus) {
    await db.insert(jobStatusHistory).values({
      jobId: id,
      oldStatus: normalizeStatus(existing.status),
      newStatus: nextStatus,
      changedAt: new Date().toISOString(),
    });
  }

  const updated = await db.select().from(jobs).where(eq(jobs.id, id)).limit(1);
  return updated[0] ? toJobResponse(updated[0]) : null;
}

export async function getJobById(id: number) {
  const job = await db.select().from(jobs).where(eq(jobs.id, id)).get();
  return job ? toJobResponse(job) : null;
}

export async function getJobAnalysis(
  jobId: number,
  resumeId: number
): Promise<{ analysis: ReturnType<typeof toJobAnalysisResponse> | null }> {
  const cached = await getCachedAnalysis(jobId, resumeId);
  if (cached) {
    return { analysis: toJobAnalysisResponse(cached, jobId, resumeId) };
  }
  return { analysis: null };
}

export async function analyzeJob(
  jobId: number,
  resumeId: number,
  forceRefresh = false
): Promise<{ analysis: ReturnType<typeof toJobAnalysisResponse> }> {
  const analysis = await analyzeJobWithResume(jobId, resumeId, forceRefresh);
  return { analysis: toJobAnalysisResponse(analysis, jobId, resumeId) };
}

export async function getPreScore(
  jobId: number,
  resumeId: number
): Promise<{ score: number; keywords: string[] }> {
  const result = await getKeywordPreScore(jobId, resumeId);
  return result;
}

export async function createJob(data: {
  title: string;
  company: string;
  url: string;
  location?: string;
  source?: string;
}) {
  const now = new Date().toISOString();
  const urlHash = data.url ? generateUrlHash(data.url) : null;
  const sender = data.source ?? "manual";

  const result = await db.insert(jobs).values({
    account: 'manual',
    sender: sender,
    subject: `${data.title} at ${data.company}`,
    snippet: data.location || '',
    receivedAt: now,
    company: data.company,
    title: data.title,
    url: data.url,
    urlHash,
    status: 'inbox',
    firstSeenAt: now,
    lastSeenAt: now,
    createdAt: now,
  }).returning();

  const created = result[0];
  if (created) {
    await db.insert(jobStatusHistory).values({
      jobId: created.id,
      oldStatus: null,
      newStatus: "inbox",
      changedAt: now,
    });
  }

  return created ? toJobResponse(created) : null;
}
