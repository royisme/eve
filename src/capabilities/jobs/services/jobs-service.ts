import { db } from "../../../db";
import { jobs } from "../../../db/schema";
import { eq, and, isNull, isNotNull, desc } from "drizzle-orm";
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

export async function searchJobs(params: JobSearchParams): Promise<JobSearchResult[]> {
  const { query, status, limit = 20 } = params;

  let results = await db
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
    .orderBy(desc(jobs.receivedAt))
    .limit(limit);

  if (status) {
    results = results.filter((j) => j.status === status);
  }

  if (query) {
    const q = query.toLowerCase();
    results = results.filter(
      (j) =>
        j.company?.toLowerCase().includes(q) ||
        j.title?.toLowerCase().includes(q)
    );
  }

  return results;
}

export interface JobStats {
  total: number;
  new: number;
  enriched: number;
  analyzed: number;
  applied: number;
}

export async function getJobStats(): Promise<JobStats> {
  const all = await db.select().from(jobs).all();
  return {
    total: all.length,
    new: all.filter((j) => j.status === "New").length,
    enriched: all.filter((j) => j.description !== null).length,
    analyzed: all.filter((j) => j.analysis !== null).length,
    applied: all.filter((j) => j.status === "Applied").length,
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
