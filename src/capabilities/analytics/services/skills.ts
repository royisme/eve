import { db } from "../../../db";
import { jobs, resumes } from "../../../db/schema";
import { SKILLS, SkillDefinition } from "../data/skills";
import { eq, gte, isNotNull, desc, and } from "drizzle-orm";

export interface SkillMatch {
  skill: string;
  category: string;
  count: number;
  matchedAs: string;
}

export interface SkillsAnalyticsResponse {
  topSkills: { skill: string; category: string; jobCount: number }[];
  skillGaps: { skill: string; category: string; inJobs: number; inResume: boolean }[];
  byCategory: { category: string; skills: string[] }[];
  period: string;
}

function getPeriodStart(period: string): Date | null {
  const now = new Date();
  switch (period) {
    case "7d": return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    case "30d": return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    default: return null;
  }
}

export function extractSkills(text: string): SkillMatch[] {
  if (!text) return [];

  const normalized = text.toLowerCase();
  const matches: Map<string, SkillMatch> = new Map();

  for (const skillDef of SKILLS) {
    for (const alias of skillDef.aliases) {
      const escapedAlias = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`\\b${escapedAlias}\\b`, "gi");
      const found = normalized.match(regex);

      if (found && found.length > 0) {
        const existing = matches.get(skillDef.canonical);
        if (existing) {
          existing.count += found.length;
        } else {
          matches.set(skillDef.canonical, {
            skill: skillDef.canonical,
            category: skillDef.category,
            count: found.length,
            matchedAs: alias,
          });
        }
      }
    }
  }

  return Array.from(matches.values()).sort((a, b) => b.count - a.count);
}

export async function getSkillsAnalytics(
  resumeId?: number,
  period: string = "all"
): Promise<SkillsAnalyticsResponse> {
  const periodStart = getPeriodStart(period);

  let conditions: any[] = [isNotNull(jobs.description)];

  if (periodStart) {
    conditions.push(gte(jobs.receivedAt, periodStart.toISOString()));
  }

  const allJobs = await db
    .select()
    .from(jobs)
    .where(and(...conditions))
    .orderBy(desc(jobs.receivedAt))
    .all();

  const skillCounts: Map<string, { count: number; category: string }> = new Map();
  for (const job of allJobs) {
    const skills = extractSkills(job.description || "");
    const seenSkills = new Set<string>();
    for (const { skill, category } of skills) {
      if (!seenSkills.has(skill)) {
        seenSkills.add(skill);
        const existing = skillCounts.get(skill);
        if (existing) {
          existing.count += 1;
        } else {
          skillCounts.set(skill, { count: 1, category });
        }
      }
    }
  }

  const topSkills = Array.from(skillCounts.entries())
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 20)
    .map(([skill, { count, category }]) => ({ skill, category, jobCount: count }));

  let skillGaps: SkillsAnalyticsResponse["skillGaps"] = [];
  if (resumeId) {
    const resume = await db.select().from(resumes).where(eq(resumes.id, resumeId)).get();
    if (resume) {
      const resumeSkills = new Set(extractSkills(resume.content).map(s => s.skill));
      skillGaps = topSkills.map(({ skill, category, jobCount }) => ({
        skill,
        category,
        inJobs: jobCount,
        inResume: resumeSkills.has(skill),
      })).filter(s => !s.inResume);
    }
  }

  const byCategory = Object.entries(
    topSkills.reduce((acc, { skill, category }) => {
      if (!acc[category]) acc[category] = [];
      acc[category].push(skill);
      return acc;
    }, {} as Record<string, string[]>)
  ).map(([category, skills]) => ({ category, skills }));

  return { topSkills, skillGaps, byCategory, period };
}
