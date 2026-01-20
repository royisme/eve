import { db } from "../db";
import { jobs } from "../db/schema";
import { desc, eq, like, and, or, sql } from "drizzle-orm";
import {
  getCachedAnalysis,
  analyzeJobWithResume,
  getKeywordPreScore,
  type AnalysisResult,
} from "../capabilities/jobs/services/analysis-cache";

const VALID_STATUSES = ["inbox", "applied", "interviewing", "offer", "rejected", "skipped"] as const;
const MAX_LIMIT = 100;

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
    if (!VALID_STATUSES.includes(status as typeof VALID_STATUSES[number])) {
      throw new Error(`Invalid status: ${status}. Valid values: ${VALID_STATUSES.join(", ")}`);
    }
    conditions.push(eq(jobs.status, status));
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
    jobs: result,
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
  
  const result: Record<string, number> = {
    inbox: 0,
    applied: 0,
    interviewing: 0,
    offer: 0,
    rejected: 0,
    skipped: 0
  };
  
  stats.forEach(s => {
    if (s.status && result[s.status] !== undefined) {
      result[s.status] = s.count;
    }
  });
  
  return result;
}

export async function updateJob(id: number, data: Partial<{
  status: string;
  starred: boolean;
  score: number;
}>) {
  if (data.status && !VALID_STATUSES.includes(data.status as typeof VALID_STATUSES[number])) {
    throw new Error(`Invalid status: ${data.status}. Valid values: ${VALID_STATUSES.join(", ")}`);
  }
  
  const updateData: Record<string, unknown> = {};
  if (data.status) updateData.status = data.status;
  if (data.starred !== undefined) updateData.starred = data.starred ? 1 : 0;
  if (data.score !== undefined) updateData.score = data.score;
  
  if (data.status === 'applied') {
    updateData.appliedAt = new Date().toISOString();
  }
  
  await db.update(jobs)
    .set(updateData)
    .where(eq(jobs.id, id));
    
  const updated = await db.select().from(jobs).where(eq(jobs.id, id)).limit(1);
  return updated[0];
}

export async function getJobById(id: number) {
  const job = await db.select().from(jobs).where(eq(jobs.id, id)).get();
  return job;
}

export async function getJobAnalysis(
  jobId: number,
  resumeId: number
): Promise<{ analysis: AnalysisResult | null; cached: boolean }> {
  const cached = await getCachedAnalysis(jobId, resumeId);
  if (cached) {
    return { analysis: cached, cached: true };
  }
  return { analysis: null, cached: false };
}

export async function analyzeJob(
  jobId: number,
  resumeId: number,
  forceRefresh = false
): Promise<{ analysis: AnalysisResult }> {
  const analysis = await analyzeJobWithResume(jobId, resumeId, forceRefresh);
  return { analysis };
}

export async function getPreScore(
  jobId: number,
  resumeId: number
): Promise<{ score: number }> {
  const score = await getKeywordPreScore(jobId, resumeId);
  return { score };
}

export async function createJob(data: {
  title: string;
  company: string;
  url: string;
  location?: string;
  source?: string;
}) {
  const now = new Date().toISOString();
  const urlHash = data.url ? Buffer.from(data.url).toString('base64').slice(0, 32) : null;
  
  const result = await db.insert(jobs).values({
    account: 'manual',
    sender: 'manual',
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
  
  return result[0];
}
