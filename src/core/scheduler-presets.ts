import { db } from './db';
import { cronJobs, type NewCronJob } from '../db/schema';
import { Scheduler } from './scheduler';

export const JOB_PRESETS = {
  job_alerts: {
    name: 'Job Alerts Sync',
    description: 'Sync job alert emails from LinkedIn, Indeed, Glassdoor, etc.',
    schedule: '0 */4 * * *',
    payloadType: 'email_sync',
    payloadParams: JSON.stringify({
      query: 'from:linkedin OR from:indeed OR from:glassdoor OR from:greenhouse OR from:lever',
    }),
    target: 'isolated',
    wakeMode: 'lazy',
  },
  job_enrich: {
    name: 'Job Enrichment',
    description: 'Enrich new jobs with full descriptions via Firecrawl',
    schedule: '30 */6 * * *',
    payloadType: 'jobs_enrich',
    payloadParams: JSON.stringify({}),
    target: 'isolated',
    wakeMode: 'lazy',
  },
  job_analyze: {
    name: 'Job Analysis',
    description: 'Analyze enriched jobs with the default resume',
    schedule: '0 12 * * *',
    payloadType: 'jobs_analyze',
    payloadParams: JSON.stringify({}),
    target: 'isolated',
    wakeMode: 'lazy',
  },
  morning_briefing: {
    name: 'Morning Briefing',
    description: 'Daily morning summary injected into chat',
    schedule: '0 9 * * *',
    payloadType: 'daily_briefing',
    payloadParams: JSON.stringify({}),
    target: 'main',
    wakeMode: 'now',
  },
  recruiter_check: {
    name: 'Recruiter Outreach Check',
    description: 'Check for recruiter emails on weekdays',
    schedule: '0 10 * * 1-5',
    payloadType: 'email_sync',
    payloadParams: JSON.stringify({
      query: 'subject:(opportunity OR position OR role) from:*recruit*',
    }),
    target: 'isolated',
    wakeMode: 'lazy',
  },
  evening_digest: {
    name: 'Evening Digest',
    description: 'End of day summary',
    schedule: '0 18 * * *',
    payloadType: 'daily_briefing',
    payloadParams: JSON.stringify({}),
    target: 'main',
    wakeMode: 'lazy',
  },
} as const;

export type PresetKey = keyof typeof JOB_PRESETS;

export async function createJobFromPreset(presetKey: PresetKey): Promise<number> {
  const preset = JOB_PRESETS[presetKey];
  
  const [result] = await db.insert(cronJobs).values({
    name: preset.name,
    description: preset.description,
    schedule: preset.schedule,
    payloadType: preset.payloadType,
    payloadParams: preset.payloadParams,
    target: preset.target,
    wakeMode: preset.wakeMode,
    enabled: 1,
  } as NewCronJob).returning();

  await Scheduler.upsertJob(result);
  
  return result.id;
}

export async function listPresets(): Promise<Array<{ key: PresetKey; name: string; description: string; schedule: string }>> {
  return Object.entries(JOB_PRESETS).map(([key, preset]) => ({
    key: key as PresetKey,
    name: preset.name,
    description: preset.description,
    schedule: preset.schedule,
  }));
}
