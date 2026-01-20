/**
 * Test script for Email Enhancements
 * 
 * Tests:
 * 1. Account service CRUD
 * 2. Scheduler presets
 * 3. Cron job creation and execution
 */

import { db } from './core/db';
import { emailAccounts, cronJobs, cronRuns } from './db/schema';
import { eq } from 'drizzle-orm';

async function runTests() {
  console.log('🧪 Email Enhancements Test Suite\n');
  
  if (process.env.NODE_ENV === 'production') {
    console.error('❌ ERROR: Tests cannot run in production environment');
    console.error('   Set NODE_ENV to a non-production value to run tests');
    process.exit(1);
  }
  
  const results: { name: string; passed: boolean; error?: string }[] = [];
  
  console.log('📧 Testing Account Service...');
  try {
    const { addAccount, listAccounts, getPrimaryAccount, setPrimaryAccount, removeAccount } = 
      await import('./capabilities/email/services/account-service');
    
    await db.delete(emailAccounts).run();
    
    // Add accounts
    await addAccount('test1@gmail.com', { alias: 'Test 1', isPrimary: true });
    await addAccount('test2@gmail.com', { alias: 'Test 2' });
    
    // Verify list
    const accounts = await listAccounts();
    if (accounts.length !== 2) throw new Error(`Expected 2 accounts, got ${accounts.length}`);
    
    // Verify primary
    const primary = await getPrimaryAccount();
    if (primary?.email !== 'test1@gmail.com') throw new Error('Primary account incorrect');
    
    // Change primary
    await setPrimaryAccount('test2@gmail.com');
    const newPrimary = await getPrimaryAccount();
    if (newPrimary?.email !== 'test2@gmail.com') throw new Error('Failed to change primary');
    
    // Remove account
    await removeAccount('test1@gmail.com');
    const remaining = await listAccounts();
    if (remaining.length !== 1) throw new Error('Failed to remove account');
    
    // Clean up
    await db.delete(emailAccounts).run();
    
    results.push({ name: 'Account Service CRUD', passed: true });
    console.log('  ✅ Account Service CRUD passed');
  } catch (error) {
    results.push({ name: 'Account Service CRUD', passed: false, error: (error as Error).message });
    console.log(`  ❌ Account Service CRUD failed: ${(error as Error).message}`);
  }

  // Test 2: Scheduler Presets
  console.log('\n📋 Testing Scheduler Presets...');
  try {
    const { listPresets, createJobFromPreset } = await import('./core/scheduler-presets');
    
    // Clean up
    await db.delete(cronJobs).run();
    
    // List presets
    const presets = await listPresets();
    if (presets.length !== 4) throw new Error(`Expected 4 presets, got ${presets.length}`);
    
    // Create from preset
    const jobId = await createJobFromPreset('job_alerts');
    const job = await db.select().from(cronJobs).where(eq(cronJobs.id, jobId)).get();
    if (!job) throw new Error('Failed to create job from preset');
    if (job.name !== 'Job Alerts Sync') throw new Error('Job name incorrect');
    
    // Clean up
    await db.delete(cronJobs).run();
    
    results.push({ name: 'Scheduler Presets', passed: true });
    console.log('  ✅ Scheduler Presets passed');
  } catch (error) {
    results.push({ name: 'Scheduler Presets', passed: false, error: (error as Error).message });
    console.log(`  ❌ Scheduler Presets failed: ${(error as Error).message}`);
  }

  // Test 3: Scheduler with Executors
  console.log('\n⏰ Testing Scheduler with Executors...');
  try {
    const { Scheduler } = await import('./core/scheduler');
    await import('./core/scheduler-executors');
    
    // Clean up
    await db.delete(cronRuns).run();
    await db.delete(cronJobs).run();
    
    // Create a test job
    const [testJob] = await db.insert(cronJobs).values({
      name: 'Test Job',
      schedule: '0 */6 * * *',
      payloadType: 'test_task',
      payloadParams: JSON.stringify({ message: 'Hello Test!' }),
      target: 'isolated',
      enabled: 1,
    }).returning();
    
    // Start scheduler
    await Scheduler.start();
    
    const status = await Scheduler.getStatus();
    if (!status.running) throw new Error('Scheduler not running');
    if (status.jobCount < 1) throw new Error(`Expected at least 1 job, got ${status.jobCount}`);
    
    // Run job manually
    await Scheduler.runNow(testJob.id);
    
    // Check run history
    const runs = await db.select().from(cronRuns).where(eq(cronRuns.jobId, testJob.id)).all();
    if (runs.length !== 1) throw new Error(`Expected 1 run, got ${runs.length}`);
    if (runs[0].status !== 'success') throw new Error(`Run status: ${runs[0].status}`);
    
    // Stop scheduler
    await Scheduler.stop();
    
    // Clean up
    await db.delete(cronRuns).run();
    await db.delete(cronJobs).run();
    
    results.push({ name: 'Scheduler with Executors', passed: true });
    console.log('  ✅ Scheduler with Executors passed');
  } catch (error) {
    results.push({ name: 'Scheduler with Executors', passed: false, error: (error as Error).message });
    console.log(`  ❌ Scheduler with Executors failed: ${(error as Error).message}`);
  }

  // Test 4: Agent Tools Registration
  console.log('\n🔧 Testing Agent Tools Registration...');
  try {
    const { getCapabilityTools } = await import('./capabilities');
    
    const tools = await getCapabilityTools();
    const toolNames = tools.map(t => t.name);
    
    const expectedTools = [
      'email_accounts_list',
      'email_set_primary',
      'cron_jobs_list',
      'cron_job_create',
      'cron_job_run',
      'scheduler_status',
    ];
    
    for (const expected of expectedTools) {
      if (!toolNames.includes(expected)) {
        throw new Error(`Missing tool: ${expected}`);
      }
    }
    
    results.push({ name: 'Agent Tools Registration', passed: true });
    console.log('  ✅ Agent Tools Registration passed');
  } catch (error) {
    results.push({ name: 'Agent Tools Registration', passed: false, error: (error as Error).message });
    console.log(`  ❌ Agent Tools Registration failed: ${(error as Error).message}`);
  }

  // Summary
  console.log('\n' + '='.repeat(50));
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  
  console.log(`\n📊 Results: ${passed}/${results.length} tests passed`);
  
  if (failed > 0) {
    console.log('\n❌ Failed tests:');
    for (const r of results.filter(r => !r.passed)) {
      console.log(`  - ${r.name}: ${r.error}`);
    }
    process.exit(1);
  } else {
    console.log('\n✅ All tests passed!');
    process.exit(0);
  }
}

runTests().catch(console.error);
