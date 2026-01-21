import { db } from "../../../db";
import { jobs } from "../../../db/schema";
import { eq, and, or, like, isNull, isNotNull, desc } from "drizzle-orm";
import { FirecrawlService } from "../../../services/firecrawl";
import { LLMService } from "../../../services/llm";
import { ConfigManager } from "../../../core/config";

export interface JobSearchParams {
  query?: string;
  status?: string;
  limit?: number;
}

export interface JobSearchResult {
  id: number;
  company: string | null;
  title: string | null;
  status: string | null;
  score: number | null;
  url: string | null;
  receivedAt: string;
}

const VALID_STATUSES = ["inbox", "applied", "interviewing", "offer", "rejected", "skipped"] as const;
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

function escapeSearchPattern(search: string): string {
  return search.replace(/%/g, "\\%").replace(/_/g, "\\_");
}

export async function searchJobs(params: JobSearchParams): Promise<JobSearchResult[]> {
  const { query, status, limit = 20 } = params;

  const conditions: any[] = [];

  if (status) {
    if (!isValidRawStatus(status)) {
      throw new Error(`Invalid status: ${status}. Valid values: ${Array.from(ALL_VALID_STATUS_VALUES).join(", ")}`);
    }
    const normalized = normalizeStatus(status);
    const variants = LEGACY_STATUS_MAP[normalized] ?? [];
    const allStatuses = [normalized, ...variants];
    if (allStatuses.length === 1) {
      conditions.push(eq(jobs.status, allStatuses[0]));
    } else {
      conditions.push(or(...allStatuses.map((s) => eq(jobs.status, s))));
    }
  }

  if (query) {
    const q = escapeSearchPattern(query.toLowerCase());
    conditions.push(
      or(
        like(jobs.company, `%${q}%`),
        like(jobs.title, `%${q}%`)
      )
    );
  }

  let baseQuery = db
    .select({
      id: jobs.id,
      company: jobs.company,
      title: jobs.title,
      status: jobs.status,
      score: jobs.score,
      url: jobs.url,
      receivedAt: jobs.receivedAt,
    })
    .from(jobs)
    .orderBy(desc(jobs.receivedAt));

  const finalQuery = conditions.length > 0
    ? baseQuery.where(and(...conditions)).limit(limit)
    : baseQuery.limit(limit);

  const results = await finalQuery;

  return results.map((job) => ({
    ...job,
    status: normalizeStatus(job.status),
  }));
}

export interface JobStats {
  total: number;
  inbox: number;
  enriched: number;
  analyzed: number;
  applied: number;
}

export async function getJobStats(): Promise<JobStats> {
  const all = await db.select().from(jobs).all();
  return {
    total: all.length,
    inbox: all.filter((j) => normalizeStatus(j.status) === "inbox").length,
    enriched: all.filter((j) => j.description !== null).length,
    analyzed: all.filter((j) => j.analysis !== null).length,
    applied: all.filter((j) => normalizeStatus(j.status) === "applied").length,
  };
}

export interface EnrichResult {
  processed: number;
  enriched: number;
  skipped: number;
  errors: string[];
}

export async function enrichPendingJobs(limit?: number): Promise<EnrichResult> {
  const firecrawl = new FirecrawlService();
  let targets = await db
    .select()
    .from(jobs)
    .where(isNull(jobs.description))
    .all();

  if (limit) {
    targets = targets.slice(0, limit);
  }

  const result: EnrichResult = {
    processed: targets.length,
    enriched: 0,
    skipped: 0,
    errors: [],
  };

  for (const job of targets) {
    if (
      job.url &&
      job.url.startsWith("http") &&
      !job.url.includes("google.com/mail")
    ) {
      try {
        const markdown = await firecrawl.crawl(job.url);
        if (markdown) {
          await db
            .update(jobs)
            .set({ description: markdown, crawledAt: new Date().toISOString() })
            .where(eq(jobs.id, job.id));
          result.enriched++;
        }
        await new Promise((resolve) => setTimeout(resolve, 2000));
      } catch (error) {
        result.errors.push(`${job.company}: ${(error as Error).message}`);
      }
    } else {
      result.skipped++;
    }
  }

  return result;
}

export interface AnalyzeResult {
  processed: number;
  analyzed: number;
  errors: string[];
}

export async function analyzePendingJobs(limit?: number): Promise<AnalyzeResult> {
  const llm = new LLMService();
  let targets = await db
    .select()
    .from(jobs)
    .where(and(isNotNull(jobs.description), isNull(jobs.analysis)))
    .all();

  if (limit) {
    targets = targets.slice(0, limit);
  }

  const resume = await ConfigManager.get<string>("jobs.resume");

  const result: AnalyzeResult = {
    processed: targets.length,
    analyzed: 0,
    errors: [],
  };

  for (const job of targets) {
    try {
      const analysis = await llm.analyzeJob(job.description!, resume);

      let score = 0;
      const scoreMatch = analysis.match(/\*\*Match Score\*\*:\s*[*[]?(\d+)/);
      if (scoreMatch) {
        score = parseInt(scoreMatch[1]);
      }

      await db
        .update(jobs)
        .set({
          analysis: analysis,
          score: score > 0 ? score : null,
        })
        .where(eq(jobs.id, job.id));

      result.analyzed++;
    } catch (error) {
      result.errors.push(`${job.company}: ${(error as Error).message}`);
    }
  }

  return result;
}

export async function getJobById(id: number) {
  return db.select().from(jobs).where(eq(jobs.id, id)).get();
}
