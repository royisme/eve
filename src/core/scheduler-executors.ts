import { Scheduler } from './scheduler';
import { syncEmails } from '../capabilities/email/services/email-service';
import { 
  getAuthorizedAccounts, 
  updateLastSync,
  ensureAccountsInitialized 
} from '../capabilities/email/services/account-service';

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

Scheduler.registerExecutor('email_sync', async (job, _sessionId) => {
  try {
    await ensureAccountsInitialized();
    
    const params = job.payloadParams ? JSON.parse(job.payloadParams) : {};
    const query = params.query || 'from:linkedin OR from:indeed';
    const maxThreads = params.maxThreads || 50;
    
    const authorizedAccounts = await getAuthorizedAccounts();
    if (authorizedAccounts.length === 0) {
      return {
        success: false,
        error: 'No authorized email accounts found',
      };
    }

    const result = await syncEmails(query, maxThreads);
    
    for (const account of authorizedAccounts) {
      await updateLastSync(account.email);
    }

    return {
      success: true,
      summary: {
        emailsProcessed: result.synced,
        newJobs: result.newJobs,
        query,
        accountsUsed: authorizedAccounts.length,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: (error as Error).message,
    };
  }
});

Scheduler.registerExecutor('daily_briefing', async (_job, _sessionId) => {
  return { 
    success: true, 
    summary: { type: 'daily_briefing', message: 'Briefing ready' } 
  };
});

Scheduler.registerExecutor('reminder', async (_job, _sessionId) => {
  return { 
    success: true, 
    summary: { reminder: true } 
  };
});

console.log('✅ [Executors] All executors registered');
