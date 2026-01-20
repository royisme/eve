import { db } from "../../../db";
import { resumes, tailoredResumes } from "../../../db/schema";
import { eq, desc } from "drizzle-orm";

const MAX_RESUME_SIZE = 5 * 1024 * 1024; // 5MB limit

export async function listResumes() {
  return db.select().from(resumes).orderBy(desc(resumes.updatedAt));
}

export async function getResume(id: number) {
  const result = await db.select().from(resumes).where(eq(resumes.id, id)).limit(1);
  return result[0];
}

export async function importResume(params: {
  name: string;
  content: string;
  format: 'markdown' | 'pdf';
  source?: string;
  filename?: string;
}) {
  if (params.content.length > MAX_RESUME_SIZE) {
    throw new Error(`Resume content too large (max ${MAX_RESUME_SIZE / 1024 / 1024}MB)`);
  }
  
  let markdownContent = params.content;
  let status: 'success' | 'partial' | 'failed' = 'success';
  let errors: string[] = [];

  if (params.format === 'pdf') {
    try {
      const buffer = Buffer.from(params.content, 'base64');
      const proc = Bun.spawn(["pdftotext", "-", "-"], { stdout: "pipe", stdin: "pipe" });
      proc.stdin.write(buffer);
      await proc.stdin.end();
      markdownContent = await new Response(proc.stdout).text();
      if (!markdownContent.trim()) {
        status = 'partial';
        errors.push("Extracted text is empty. PDF might be a scanned image.");
      }
    } catch (e) {
      status = 'failed';
      errors.push((e as Error).message);
      markdownContent = "";
    }
  }

  const result = await db.insert(resumes).values({
    name: params.name,
    content: markdownContent,
    source: params.source || (params.format === 'pdf' ? 'pdf_upload' : 'paste'),
    originalFilename: params.filename,
    parseStatus: status,
    parseErrors: errors.length > 0 ? JSON.stringify(errors) : null,
  }).returning();

  return result[0];
}

export async function updateResume(id: number, data: Partial<{
  name: string;
  content: string;
  isDefault: boolean;
}>) {
  const updateData: Record<string, unknown> = { ...data, updatedAt: new Date().toISOString() };
  
  if (data.isDefault) {
    db.transaction((tx) => {
      tx.update(resumes).set({ isDefault: 0 }).run();
      updateData.isDefault = 1;
      tx.update(resumes).set(updateData).where(eq(resumes.id, id)).run();
    });
  } else {
    if (data.isDefault === false) {
      updateData.isDefault = 0;
    }
    await db.update(resumes).set(updateData).where(eq(resumes.id, id));
  }

  return getResume(id);
}

export async function deleteResume(id: number) {
  await db.delete(resumes).where(eq(resumes.id, id));
  return { success: true };
}

export async function setDefaultResume(id: number) {
  return updateResume(id, { isDefault: true });
}

export async function getTailoredVersions(resumeId: number) {
  return db.select().from(tailoredResumes)
    .where(eq(tailoredResumes.resumeId, resumeId))
    .orderBy(desc(tailoredResumes.createdAt));
}
