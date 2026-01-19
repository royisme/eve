import { db } from "../db";
import { jobs } from "../db/schema";
import { desc, eq, like, and, or, sql } from "drizzle-orm";

export async function getJobs(params: {
  status?: string;
  starred?: boolean;
  limit?: number;
  offset?: number;
  search?: string;
}) {
  const { status, starred, limit = 20, offset = 0, search } = params;
  
  let conditions = [];
  
  if (status && status !== "all") {
    conditions.push(eq(jobs.status, status));
  }
  
  if (starred) {
    conditions.push(eq(jobs.starred, 1));
  }
  
  if (search) {
    conditions.push(
      or(
        like(jobs.title, `%${search}%`),
        like(jobs.company, `%${search}%`),
        like(jobs.snippet, `%${search}%`)
      )
    );
  }
  
  const queryBase = db.select().from(jobs);
  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
  
  const result = await queryBase
    .where(whereClause)
    .orderBy(desc(jobs.receivedAt))
    .limit(limit)
    .offset(offset);
    
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
  const updateData: any = {};
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
