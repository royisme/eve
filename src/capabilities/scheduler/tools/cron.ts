import { Type } from "@sinclair/typebox";
import type { AgentTool } from "@mariozechner/pi-agent-core";
import { db } from "../../../core/db";
import { cronJobs, cronRuns, type NewCronJob } from "../../../db/schema";
import { Scheduler } from "../../../core/scheduler";
import { eq, desc } from "drizzle-orm";
import { createJobFromPreset, listPresets, type PresetKey } from "../../../core/scheduler-presets";

export const cronJobsListTool: AgentTool<any, any> = {
  name: "cron_jobs_list",
  label: "List Cron Jobs",
  description: "List all scheduled cron jobs and their status.",
  parameters: Type.Object({}),
  execute: async (_toolCallId, _params, _signal, _onUpdate) => {
    const jobs = await db.select().from(cronJobs).all();

    if (jobs.length === 0) {
      return {
        content: [{ type: "text", text: "📅 No cron jobs configured.\n\nUse `cron_job_create` or `cron_preset_apply` to create one." }],
        details: { jobs: [] },
      };
    }

    let text = "📅 **Scheduled Jobs**\n\n";
    for (const job of jobs) {
      const status = job.enabled ? "🟢" : "⚪";
      const targetIcon = job.target === 'main' ? "💬" : "🔇";
      
      text += `### ${status} ${job.name} ${targetIcon}\n`;
      text += `- **ID**: ${job.id}\n`;
      text += `- **Schedule**: \`${job.schedule}\`\n`;
      text += `- **Type**: ${job.payloadType}\n`;
      text += `- **Mode**: ${job.target === 'main' ? 'Main Session' : 'Isolated'}\n`;
      if (job.lastRunAt) text += `- **Last Run**: ${job.lastRunAt}\n`;
      if (job.nextRunAt) text += `- **Next Run**: ${job.nextRunAt}\n`;
      text += "\n";
    }
    
    text += "_Legend: 🟢 = Enabled, ⚪ = Disabled, 💬 = Main Session, 🔇 = Isolated_";

    return {
      content: [{ type: "text", text }],
      details: { jobs },
    };
  },
};

export const cronJobCreateTool: AgentTool<any, any> = {
  name: "cron_job_create",
  label: "Create Cron Job",
  description: "Create a new scheduled cron job with custom settings.",
  parameters: Type.Object({
    name: Type.String({ description: "Job name" }),
    schedule: Type.String({ description: "Cron expression (e.g., '0 9 * * *' for 9am daily)" }),
    payloadType: Type.String({ description: "Job type: 'email_sync', 'reminder', 'daily_briefing'" }),
    payloadParams: Type.Optional(Type.Object({}, { additionalProperties: true, description: "JSON parameters for the job" })),
    target: Type.Optional(Type.Union([
      Type.Literal('main'),
      Type.Literal('isolated')
    ], { description: "'main' for chat injection, 'isolated' for background (default)" })),
    description: Type.Optional(Type.String({ description: "Job description" })),
  }),
  execute: async (_toolCallId, params, _signal, _onUpdate) => {
    const { name, schedule, payloadType, payloadParams, target, description } = params;

    const [result] = await db.insert(cronJobs).values({
      name,
      schedule,
      payloadType,
      payloadParams: payloadParams ? JSON.stringify(payloadParams) : null,
      target: target || 'isolated',
      wakeMode: target === 'main' ? 'now' : 'lazy',
      description,
      enabled: 1,
    } as NewCronJob).returning();

    await Scheduler.upsertJob(result);

    return {
      content: [{ 
        type: "text", 
        text: `✅ Created cron job: **${name}**\n- ID: ${result.id}\n- Schedule: \`${schedule}\`\n- Type: ${payloadType}\n- Mode: ${target || 'isolated'}` 
      }],
      details: { job: result },
    };
  },
};

export const cronJobRunTool: AgentTool<any, any> = {
  name: "cron_job_run",
  label: "Run Cron Job Now",
  description: "Execute a cron job immediately (manual trigger).",
  parameters: Type.Object({
    jobId: Type.Number({ description: "Job ID to execute" }),
  }),
  execute: async (_toolCallId, params, _signal, onUpdate) => {
    const { jobId } = params;

    const job = await db.select().from(cronJobs).where(eq(cronJobs.id, jobId)).get();
    if (!job) {
      return {
        content: [{ type: "text", text: `❌ Job not found: #${jobId}` }],
        details: { error: "Job not found" },
      };
    }

    onUpdate?.({
      content: [{ type: "text", text: `🔄 Running job: ${job.name}...` }],
      details: { status: "running", jobId }
    });

    await Scheduler.runNow(jobId);

    return {
      content: [{ type: "text", text: `✅ Job **${job.name}** triggered successfully.` }],
      details: { jobId, name: job.name, triggered: true },
    };
  },
};

export const cronJobToggleTool: AgentTool<any, any> = {
  name: "cron_job_toggle",
  label: "Enable/Disable Cron Job",
  description: "Enable or disable a cron job.",
  parameters: Type.Object({
    jobId: Type.Number({ description: "Job ID to toggle" }),
    enabled: Type.Boolean({ description: "true to enable, false to disable" }),
  }),
  execute: async (_toolCallId, params, _signal, _onUpdate) => {
    const { jobId, enabled } = params;

    const job = await db.select().from(cronJobs).where(eq(cronJobs.id, jobId)).get();
    if (!job) {
      return {
        content: [{ type: "text", text: `❌ Job not found: #${jobId}` }],
        details: { error: "Job not found" },
      };
    }

    await db.update(cronJobs)
      .set({ enabled: enabled ? 1 : 0 })
      .where(eq(cronJobs.id, jobId));

    const updated = await db.select().from(cronJobs).where(eq(cronJobs.id, jobId)).get();
    await Scheduler.upsertJob(updated!);

    const statusText = enabled ? "🟢 Enabled" : "⚪ Disabled";
    return {
      content: [{ type: "text", text: `${statusText} job: **${job.name}**` }],
      details: { jobId, enabled },
    };
  },
};

export const cronJobDeleteTool: AgentTool<any, any> = {
  name: "cron_job_delete",
  label: "Delete Cron Job",
  description: "Delete a cron job permanently.",
  parameters: Type.Object({
    jobId: Type.Number({ description: "Job ID to delete" }),
  }),
  execute: async (_toolCallId, params, _signal, _onUpdate) => {
    const { jobId } = params;

    const job = await db.select().from(cronJobs).where(eq(cronJobs.id, jobId)).get();
    if (!job) {
      return {
        content: [{ type: "text", text: `❌ Job not found: #${jobId}` }],
        details: { error: "Job not found" },
      };
    }

    await db.delete(cronJobs).where(eq(cronJobs.id, jobId));
    await Scheduler.upsertJob({ ...job, enabled: 0 });

    return {
      content: [{ type: "text", text: `🗑️ Deleted job: **${job.name}**` }],
      details: { jobId, deleted: true },
    };
  },
};

export const cronPresetListTool: AgentTool<any, any> = {
  name: "cron_preset_list",
  label: "List Cron Presets",
  description: "List available preset job templates.",
  parameters: Type.Object({}),
  execute: async (_toolCallId, _params, _signal, _onUpdate) => {
    const presets = await listPresets();

    let text = "📋 **Available Job Presets**\n\n";
    for (const preset of presets) {
      text += `### ${preset.name}\n`;
      text += `- **Key**: \`${preset.key}\`\n`;
      text += `- **Schedule**: \`${preset.schedule}\`\n`;
      text += `- ${preset.description}\n\n`;
    }
    
    text += "_Use `cron_preset_apply` with the key to create a job from a preset._";

    return {
      content: [{ type: "text", text }],
      details: { presets },
    };
  },
};

export const cronPresetApplyTool: AgentTool<any, any> = {
  name: "cron_preset_apply",
  label: "Apply Cron Preset",
  description: "Create a cron job from a preset template.",
  parameters: Type.Object({
    preset: Type.String({ description: "Preset key: 'job_alerts', 'morning_briefing', 'recruiter_check', 'evening_digest'" }),
  }),
  execute: async (_toolCallId, params, _signal, _onUpdate) => {
    const { preset } = params;
    
    const validPresets = ['job_alerts', 'morning_briefing', 'recruiter_check', 'evening_digest'];
    if (!validPresets.includes(preset)) {
      return {
        content: [{ 
          type: "text", 
          text: `❌ Unknown preset: ${preset}\n\nValid presets: ${validPresets.join(', ')}` 
        }],
        details: { error: "Unknown preset" },
      };
    }

    const jobId = await createJobFromPreset(preset as PresetKey);
    const job = await db.select().from(cronJobs).where(eq(cronJobs.id, jobId)).get();

    return {
      content: [{ 
        type: "text", 
        text: `✅ Created job from preset **${preset}**:\n- Name: ${job?.name}\n- Schedule: \`${job?.schedule}\`\n- ID: ${jobId}` 
      }],
      details: { jobId, preset, job },
    };
  },
};

export const schedulerStatusTool: AgentTool<any, any> = {
  name: "scheduler_status",
  label: "Scheduler Status",
  description: "Get the current status of the Gateway scheduler.",
  parameters: Type.Object({}),
  execute: async (_toolCallId, _params, _signal, _onUpdate) => {
    const status = await Scheduler.getStatus();

    let text = "📊 **Scheduler Status**\n\n";
    text += `- **State**: ${status.running ? '🟢 Running' : '⚪ Stopped'}\n`;
    text += `- **Active Jobs**: ${status.jobCount}\n`;
    text += `- **Pending Events**: ${status.pendingMainEvents}\n`;

    if (status.jobs.length > 0) {
      text += "\n**Upcoming Jobs**:\n";
      for (const job of status.jobs.slice(0, 5)) {
        text += `- [${job.id}] ${job.name}: ${job.nextRun?.toISOString() || 'N/A'}\n`;
      }
    }

    return {
      content: [{ type: "text", text }],
      details: status,
    };
  },
};

export const cronRunHistoryTool: AgentTool<any, any> = {
  name: "cron_run_history",
  label: "Cron Run History",
  description: "View recent execution history for cron jobs.",
  parameters: Type.Object({
    jobId: Type.Optional(Type.Number({ description: "Filter by job ID (optional)" })),
    limit: Type.Optional(Type.Number({ description: "Number of runs to show (default: 10)" })),
  }),
  execute: async (_toolCallId, params, _signal, _onUpdate) => {
    const { jobId, limit = 10 } = params;

    const runs = jobId
      ? await db.select().from(cronRuns).where(eq(cronRuns.jobId, jobId)).orderBy(desc(cronRuns.startedAt)).limit(limit).all()
      : await db.select().from(cronRuns).orderBy(desc(cronRuns.startedAt)).limit(limit).all();

    if (runs.length === 0) {
      return {
        content: [{ type: "text", text: "📜 No execution history found." }],
        details: { runs: [] },
      };
    }

    let text = "📜 **Recent Executions**\n\n";
    for (const run of runs) {
      const statusIcon = run.status === 'success' ? '✅' : run.status === 'failed' ? '❌' : '🔄';
      text += `${statusIcon} **Job #${run.jobId}** (${run.triggerReason})\n`;
      text += `   Started: ${run.startedAt}\n`;
      if (run.finishedAt) text += `   Finished: ${run.finishedAt}\n`;
      if (run.errorMessage) text += `   Error: ${run.errorMessage}\n`;
      text += "\n";
    }

    return {
      content: [{ type: "text", text }],
      details: { runs },
    };
  },
};

export const cronTools = [
  cronJobsListTool,
  cronJobCreateTool,
  cronJobRunTool,
  cronJobToggleTool,
  cronJobDeleteTool,
  cronPresetListTool,
  cronPresetApplyTool,
  schedulerStatusTool,
  cronRunHistoryTool,
];
