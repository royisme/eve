import { db } from "../db";
import { resumes } from "../db/schema";
import { eq, desc } from "drizzle-orm";
import * as resumeService from "../capabilities/resume/services/resume-service";

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
