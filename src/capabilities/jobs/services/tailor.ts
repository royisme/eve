import { db } from "../../../core/db.js";
import { tailoredResumes, jobs, resumes } from "../../../db/schema.js";
import { eq, and, desc } from "drizzle-orm";
import { LLMService } from "../../../services/llm.js";

interface TailorResult {
  content: string;
  suggestions: string[];
}

export async function tailorResumeForJob(
  jobId: number,
  resumeId: number,
  forceNew = false
): Promise<{ id: number; content: string; suggestions: string[]; version: number; isNew: boolean }> {
  const job = await db.query.jobs.findFirst({
    where: eq(jobs.id, jobId),
  });

  if (!job) {
    throw new Error(`Job ${jobId} not found`);
  }

  const resume = await db.query.resumes.findFirst({
    where: eq(resumes.id, resumeId),
  });

  if (!resume) {
    throw new Error(`Resume ${resumeId} not found`);
  }

  if (!forceNew) {
    const existingTailored = await db.query.tailoredResumes.findFirst({
      where: and(
        eq(tailoredResumes.jobId, jobId),
        eq(tailoredResumes.resumeId, resumeId),
        eq(tailoredResumes.isLatest, 1)
      ),
      orderBy: [desc(tailoredResumes.version)],
    });

    if (existingTailored) {
      return {
        id: existingTailored.id,
        content: existingTailored.content,
        suggestions: existingTailored.suggestions ? JSON.parse(existingTailored.suggestions) : [],
        version: existingTailored.version ?? 1,
        isNew: false,
      };
    }
  }

  const tailored = await generateTailoredResume(job, resume);

  const version = forceNew ? await getNextVersion(jobId, resumeId) : 1;

  if (forceNew) {
    await db
      .update(tailoredResumes)
      .set({ isLatest: 0 })
      .where(and(eq(tailoredResumes.jobId, jobId), eq(tailoredResumes.resumeId, resumeId)));
  }

  const [inserted] = await db
    .insert(tailoredResumes)
    .values({
      jobId,
      resumeId,
      content: tailored.content,
      suggestions: JSON.stringify(tailored.suggestions),
      version,
      isLatest: 1,
    })
    .returning();

  await db
    .update(resumes)
    .set({ useCount: (resume.useCount ?? 0) + 1 })
    .where(eq(resumes.id, resumeId));

  return {
    id: inserted.id,
    content: inserted.content,
    suggestions: tailored.suggestions,
    version: inserted.version ?? 1,
    isNew: true,
  };
}

async function getNextVersion(jobId: number, resumeId: number): Promise<number> {
  const latest = await db.query.tailoredResumes.findFirst({
    where: and(eq(tailoredResumes.jobId, jobId), eq(tailoredResumes.resumeId, resumeId)),
    orderBy: [desc(tailoredResumes.version)],
  });

  return (latest?.version || 0) + 1;
}

async function generateTailoredResume(
  job: typeof jobs.$inferSelect,
  resume: typeof resumes.$inferSelect
): Promise<TailorResult> {
  const llm = new LLMService();

  const jobDescription = job.description || `${job.title} at ${job.company}`;

  try {
    const response = await llm.tailorResume(jobDescription, resume.content);

    const jsonMatch = response.match(/\{[\s\S]*"content"[\s\S]*"suggestions"[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        content: parsed.content || resume.content,
        suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : [],
      };
    }

    return {
      content: resume.content,
      suggestions: ["LLM did not return valid JSON. Using original resume."],
    };
  } catch (e) {
    console.error("Tailoring failed:", e);
    return {
      content: resume.content,
      suggestions: ["Tailoring failed. Using original resume."],
    };
  }
}

export async function getTailoredVersions(
  jobId: number,
  resumeId?: number
): Promise<Array<typeof tailoredResumes.$inferSelect>> {
  const conditions = resumeId
    ? and(eq(tailoredResumes.jobId, jobId), eq(tailoredResumes.resumeId, resumeId))
    : eq(tailoredResumes.jobId, jobId);

  return db.query.tailoredResumes.findMany({
    where: conditions,
    orderBy: [desc(tailoredResumes.version)],
  });
}

export async function updateTailoredResume(id: number, content: string): Promise<typeof tailoredResumes.$inferSelect> {
  const [updated] = await db
    .update(tailoredResumes)
    .set({ content })
    .where(eq(tailoredResumes.id, id))
    .returning();

  if (!updated) {
    throw new Error(`Tailored resume ${id} not found`);
  }

  return updated;
}
