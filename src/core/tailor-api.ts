import * as tailorService from "../capabilities/jobs/services/tailor.js";

export async function tailorResume(jobId: number, resumeId: number, forceNew = false) {
  return tailorService.tailorResumeForJob(jobId, resumeId, forceNew);
}

export async function getTailoredVersions(jobId: number, resumeId?: number) {
  return tailorService.getTailoredVersions(jobId, resumeId);
}

export async function updateTailoredResume(id: number, content: string) {
  return tailorService.updateTailoredResume(id, content);
}
