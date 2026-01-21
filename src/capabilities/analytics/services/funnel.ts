import { db } from "../../../db";
import { jobs } from "../../../db/schema";
import { and, gte, sql } from "drizzle-orm";

export interface FunnelMetrics {
  inbox: number;
  applied: number;
  interview: number;
  offer: number;
  conversionRates: {
    applyRate: number;
    interviewRate: number;
    offerRate: number;
  };
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

function getPeriodStart(period: string): Date | null {
  const now = new Date();
  switch (period) {
    case "7d":
    case "week":
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    case "30d":
    case "month":
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    default:
      return null;
  }
}

export async function getFunnelMetrics(period: string = "all"): Promise<FunnelMetrics> {
  const periodStart = getPeriodStart(period);
  const conditions = [] as any[];

  if (periodStart) {
    conditions.push(gte(jobs.receivedAt, periodStart.toISOString()));
  }

  const baseQuery = db
    .select({
      status: jobs.status,
      count: sql<number>`count(*)`,
    })
    .from(jobs);

  const statusCounts = conditions.length
    ? await baseQuery.where(and(...conditions)).groupBy(jobs.status)
    : await baseQuery.groupBy(jobs.status);

  const counts = {
    inbox: 0,
    applied: 0,
    interview: 0,
    offer: 0,
  };

  statusCounts.forEach((row) => {
    const normalized = normalizeStatus(row.status);
    if (normalized === "interviewing") {
      counts.interview += row.count;
      return;
    }
    if (normalized === "inbox") counts.inbox += row.count;
    if (normalized === "applied") counts.applied += row.count;
    if (normalized === "offer") counts.offer += row.count;
  });

  const applyRate = counts.inbox ? counts.applied / counts.inbox : 0;
  const interviewRate = counts.applied ? counts.interview / counts.applied : 0;
  const offerRate = counts.interview ? counts.offer / counts.interview : 0;

  return {
    inbox: counts.inbox,
    applied: counts.applied,
    interview: counts.interview,
    offer: counts.offer,
    conversionRates: {
      applyRate,
      interviewRate,
      offerRate,
    },
  };
}
