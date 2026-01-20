import { db } from "../db";
import { resumes, tailoredResumes } from "../db/schema";
import { eq, desc } from "drizzle-orm";
import * as resumeService from "../capabilities/resume/services/resume-service";
import * as fs from "fs/promises";
import * as path from "path";

const PDF_STORAGE_DIR = "./data/pdfs";

export async function listResumes() {
  return resumeService.listResumes();
}

export async function getResume(id: number) {
  return resumeService.getResume(id);
}

export async function createResume(params: {
  name: string;
  content: string;
  format: 'markdown' | 'pdf';
  filename?: string;
}) {
  return resumeService.importResume(params);
}

export async function updateResume(id: number, data: any) {
  return resumeService.updateResume(id, data);
}

export async function deleteResume(id: number) {
  return resumeService.deleteResume(id);
}

export async function setDefaultResume(id: number) {
  return resumeService.setDefaultResume(id);
}

export async function getResumeStatus(id: number) {
  const resume = await resumeService.getResume(id);
  if (!resume) {
    throw new Error("Resume not found");
  }
  return {
    parse_status: resume.parseStatus,
    errors: resume.parseErrors ? JSON.parse(resume.parseErrors) : [],
  };
}

export async function getResumeVersions(id: number) {
  const versions = await resumeService.getTailoredVersions(id);
  return { versions };
}

export async function uploadTailoredPdf(
  tailoredResumeId: number,
  fileBuffer: Buffer,
  filename: string
) {
  const tailored = await db.select()
    .from(tailoredResumes)
    .where(eq(tailoredResumes.id, tailoredResumeId))
    .limit(1);
  
  if (!tailored[0]) {
    throw new Error("Tailored resume not found");
  }

  await fs.mkdir(PDF_STORAGE_DIR, { recursive: true });
  
  const timestamp = Date.now();
  const safeFilename = filename.replace(/[^a-zA-Z0-9.-]/g, "_");
  const storedFilename = `tailored_${tailoredResumeId}_${timestamp}_${safeFilename}`;
  const filePath = path.join(PDF_STORAGE_DIR, storedFilename);
  
  await fs.writeFile(filePath, fileBuffer);
  
  return {
    filename: storedFilename,
    size: fileBuffer.length,
    url: `/pdfs/${storedFilename}`,
  };
}
