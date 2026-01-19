import { db } from "../../../db";
import { resumes, tailoredResumes } from "../../../db/schema";
import { eq, desc, sql } from "drizzle-orm";
import { pdfService } from "../../../services/pdf";

export async function listResumes() {
  return db.select().from(resumes).orderBy(desc(resumes.updatedAt));
}

export async function getResume(id: number) {
  const result = await db.select().from(resumes).where(eq(resumes.id, id)).limit(1);
  return result[0];
}

export async function importResume(params: {
  name: string;
  content: string; // Markdown or Base64 PDF
  format: 'markdown' | 'pdf';
  source?: string;
  filename?: string;
}) {
  let markdownContent = params.content;
  let status: 'success' | 'partial' | 'failed' = 'success';
  let errors: string[] = [];

  if (params.format === 'pdf') {
    try {
      const buffer = Buffer.from(params.content, 'base64');
      markdownContent = await pdfService.extractText(buffer);
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
  const updateData: any = { ...data, updatedAt: new Date().toISOString() };
  
  if (data.isDefault) {
    // Reset other defaults
    await db.update(resumes).set({ isDefault: 0 });
    updateData.isDefault = 1;
  } else if (data.isDefault === false) {
    updateData.isDefault = 0;
  }

  await db.update(resumes).set(updateData).where(eq(resumes.id, id));
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
