import { Scheduler } from './scheduler';

Scheduler.registerExecutor('test_task', async (job, sessionId) => {
  console.log(`[TestExecutor] Running test task: ${job.name} (session: ${sessionId})`);
  
  const params = job.payloadParams ? JSON.parse(job.payloadParams) : {};
  const message = params.message || 'Hello from cron!';
  
  await new Promise(resolve => setTimeout(resolve, 100));
  
  return {
    success: true,
    summary: {
      message,
      executedAt: new Date().toISOString(),
    },
  };
});

console.log('✅ [Executors] Test executor registered');
