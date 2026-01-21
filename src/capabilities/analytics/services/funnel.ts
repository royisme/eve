import { db } from "../../../db";
import { jobs, jobStatusHistory } from "../../../db/schema";
import { eq, and, gte, desc } from "drizzle-orm";

export interface FunnelStage {
  stage: string;
  count: number;
  percentage: number;
}

export interface ConversionRate {
  from: string;
  to: string;
  rate: number;
}

export interface FunnelResponse {
  period: "all" | "7d" | "30d";
  stages: FunnelStage[];
  conversionRates: ConversionRate[];
  periodStart?: string;
  periodEnd?: string;
}

const STAGES = ["inbox", "starred", "applied", "interview", "offer", "rejected"];

function getPeriodStart(period: string): Date | null {
  const now = new Date();
  switch (period) {
    case "7d": return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    case "30d": return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    default: return null;
  }
}

export async function getFunnelMetrics(period: string = "all"): Promise<FunnelResponse> {
  const periodStart = getPeriodStart(period);
  const now = new Date().toISOString();

  const stageCounts: Record<string, number> = {};

  for (const stage of STAGES) {
    let conditions = [eq(jobStatusHistory.newStatus, stage)];

    if (periodStart) {
      conditions.push(gte(jobStatusHistory.changedAt, periodStart.toISOString()));
    }

    const result = await db
      .selectDistinct({ jobId: jobStatusHistory.jobId })
      .from(jobStatusHistory)
      .where(and(...conditions))
      .all();

    stageCounts[stage] = result.length;
  }

  if (!stageCounts["inbox"]) {
    let conditions: any[] = [];

    if (periodStart) {
      conditions.push(gte(jobs.receivedAt, periodStart.toISOString()));
    }

    const allJobsQuery = db
      .select({ id: jobs.id })
      .from(jobs)
      .orderBy(desc(jobs.receivedAt));

    const allJobs = conditions.length > 0
      ? await allJobsQuery.where(and(...conditions)).all()
      : await allJobsQuery.all();

    stageCounts["inbox"] = allJobs.length;
  }

  const total = stageCounts["inbox"] || 1;
  const stages: FunnelStage[] = STAGES.map(stage => ({
    stage,
    count: stageCounts[stage] || 0,
    percentage: Math.round(((stageCounts[stage] || 0) / total) * 100),
  }));

  const conversionRates: ConversionRate[] = [];
  for (let i = 0; i < STAGES.length - 1; i++) {
    const fromCount = stageCounts[STAGES[i]] || 0;
    const toCount = stageCounts[STAGES[i + 1]] || 0;
    conversionRates.push({
      from: STAGES[i],
      to: STAGES[i + 1],
      rate: fromCount > 0 ? Math.round((toCount / fromCount) * 100) : 0,
    });
  }

  return {
    period: period as "all" | "7d" | "30d",
    stages,
    conversionRates,
    periodStart: periodStart?.toISOString(),
    periodEnd: now,
  };
}
