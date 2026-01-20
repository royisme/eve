import { Scheduler, type CronEvent } from './scheduler';

export async function checkSchedulerEvents(): Promise<CronEvent[]> {
  return Scheduler.consumeMainSessionEvents();
}

export function cronEventToSystemMessage(event: CronEvent): string {
  switch (event.payloadType) {
    case 'reminder':
      return `[REMINDER] ${event.payloadParams.message}`;
    case 'daily_briefing':
      return `[SYSTEM] Time for your daily briefing. Please summarize today's updates.`;
    default:
      return `[SYSTEM] Scheduled task "${event.jobName}" triggered.`;
  }
}

export type { CronEvent };
