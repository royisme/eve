import { Cron } from 'croner';
import { db } from './db';
import { cronJobs, cronRuns, type CronJob } from '../db/schema';
import { eq } from 'drizzle-orm';

interface ScheduledJob {
  jobId: number;
  cron: Cron;
}

type JobExecutor = (job: CronJob, sessionId: string) => Promise<{
  success: boolean;
  summary?: Record<string, any>;
  error?: string;
}>;

interface CronEvent {
  type: 'cron_trigger';
  jobId: number;
  jobName: string;
  payloadType: string;
  payloadParams: Record<string, any>;
  timestamp: string;
  triggerReason: string;
}

class GatewayScheduler {
  private jobs: Map<number, ScheduledJob> = new Map();
  private executors: Map<string, JobExecutor> = new Map();
  private isRunning = false;
  private mainSessionEventQueue: CronEvent[] = [];

  registerExecutor(payloadType: string, executor: JobExecutor): void {
    this.executors.set(payloadType, executor);
    console.log(`[Scheduler] Registered executor: ${payloadType}`);
  }

  async start(): Promise<void> {
    if (this.isRunning) return;
    
    console.log('🕐 [Gateway] Starting Scheduler...');
    
    const jobs = await db.select().from(cronJobs)
      .where(eq(cronJobs.enabled, 1)).all();
    
    for (const job of jobs) {
      this.scheduleJob(job);
    }
    
    this.isRunning = true;
    console.log(`📅 [Gateway] Scheduler active with ${jobs.length} jobs`);
  }

  async stop(): Promise<void> {
    for (const job of this.jobs.values()) {
      job.cron.stop();
    }
    this.jobs.clear();
    this.isRunning = false;
    console.log('🛑 [Gateway] Scheduler stopped');
  }

  private scheduleJob(job: CronJob): void {
    const cron = new Cron(job.schedule, {
      timezone: job.timezone || 'America/Toronto',
    }, async () => {
      await this.executeJob(job.id, 'scheduled');
    });
    
    this.jobs.set(job.id, { jobId: job.id, cron });
    
    const nextRun = cron.nextRun();
    console.log(`  ✓ Job "${job.name}" scheduled: ${job.schedule} (next: ${nextRun?.toISOString()})`);
    
    db.update(cronJobs)
      .set({ nextRunAt: nextRun?.toISOString() })
      .where(eq(cronJobs.id, job.id))
      .run();
  }

  private async executeJob(jobId: number, triggerReason: 'scheduled' | 'manual' | 'wake'): Promise<void> {
    const job = await db.select().from(cronJobs)
      .where(eq(cronJobs.id, jobId)).get();
    
    if (!job) return;

    if (job.target === 'main') {
      await this.executeInMainSession(job, triggerReason);
    } else {
      await this.executeInIsolation(job, triggerReason);
    }
  }

  private async executeInMainSession(
    job: CronJob, 
    triggerReason: string
  ): Promise<void> {
    console.log(`🔔 [Gateway] Injecting event to main session: ${job.name}`);
    
    const systemEvent: CronEvent = {
      type: 'cron_trigger',
      jobId: job.id,
      jobName: job.name,
      payloadType: job.payloadType,
      payloadParams: job.payloadParams ? JSON.parse(job.payloadParams) : {},
      timestamp: new Date().toISOString(),
      triggerReason,
    };
    
    this.mainSessionEventQueue.push(systemEvent);
    
    if (job.wakeMode === 'now') {
      await this.sendWakeSignal(job.id);
    }
    
    await db.insert(cronRuns).values({
      jobId: job.id,
      sessionId: 'main',
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      status: 'success',
      resultSummary: JSON.stringify({ eventInjected: true }),
      triggerReason,
    });
    
    await db.update(cronJobs)
      .set({ lastRunAt: new Date().toISOString() })
      .where(eq(cronJobs.id, job.id));
  }

  private async executeInIsolation(
    job: CronJob, 
    triggerReason: string
  ): Promise<void> {
    const sessionId = `cron:${job.name.replace(/\s+/g, '-').toLowerCase()}:${Date.now()}`;
    
    console.log(`🔄 [Gateway] Executing in isolation: ${job.name} (${sessionId})`);
    
    const [runRecord] = await db.insert(cronRuns).values({
      jobId: job.id,
      sessionId,
      startedAt: new Date().toISOString(),
      status: 'running',
      triggerReason,
    }).returning();

    try {
      const executor = this.executors.get(job.payloadType);
      
      if (!executor) {
        throw new Error(`No executor registered for payload type: ${job.payloadType}`);
      }
      
      const result = await executor(job, sessionId);
      
      await db.update(cronRuns).set({
        finishedAt: new Date().toISOString(),
        status: result.success ? 'success' : 'failed',
        resultSummary: JSON.stringify(result.summary || {}),
        errorMessage: result.error,
      }).where(eq(cronRuns.id, runRecord.id));
      
      console.log(`✅ [Gateway] Job "${job.name}" complete`);
    } catch (error) {
      await db.update(cronRuns).set({
        finishedAt: new Date().toISOString(),
        status: 'failed',
        errorMessage: (error as Error).message,
      }).where(eq(cronRuns.id, runRecord.id));
      
      console.error(`❌ [Gateway] Job "${job.name}" failed:`, error);
    }
    
    const cronInstance = this.jobs.get(job.id)?.cron;
    await db.update(cronJobs).set({ 
      lastRunAt: new Date().toISOString(),
      nextRunAt: cronInstance?.nextRun()?.toISOString(),
    }).where(eq(cronJobs.id, job.id));
  }

  private async sendWakeSignal(jobId: number): Promise<void> {
    console.log(`⚡ [Gateway] Wake signal sent for job ${jobId}`);
  }

  consumeMainSessionEvents(): CronEvent[] {
    const events = [...this.mainSessionEventQueue];
    this.mainSessionEventQueue = [];
    return events;
  }

  async runNow(jobId: number): Promise<void> {
    await this.executeJob(jobId, 'manual');
  }

  async upsertJob(job: CronJob): Promise<void> {
    const existing = this.jobs.get(job.id);
    if (existing) {
      existing.cron.stop();
      this.jobs.delete(job.id);
    }
    
    if (job.enabled) {
      this.scheduleJob(job);
    }
  }

  getStatus(): {
    running: boolean;
    jobCount: number;
    jobs: { id: number; name: string; nextRun: Date | null; lastRun: string | null }[];
    pendingMainEvents: number;
  } {
    const jobList: { id: number; name: string; nextRun: Date | null; lastRun: string | null }[] = [];
    
    for (const [id, scheduled] of this.jobs) {
      const job = db.select().from(cronJobs).where(eq(cronJobs.id, id)).get();
      jobList.push({
        id,
        name: job?.name || 'Unknown',
        nextRun: scheduled.cron.nextRun(),
        lastRun: job?.lastRunAt || null,
      });
    }
    
    return {
      running: this.isRunning,
      jobCount: this.jobs.size,
      jobs: jobList,
      pendingMainEvents: this.mainSessionEventQueue.length,
    };
  }
}

export const Scheduler = new GatewayScheduler();
export type { CronEvent };
