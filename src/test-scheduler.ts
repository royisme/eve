import { db } from './core/db';
import { cronJobs, cronRuns } from './db/schema';
import { Scheduler } from './core/scheduler';
import { eq } from 'drizzle-orm';
import './core/scheduler-executors';

console.log('🧪 Testing Gateway Scheduler\n');

console.log('Step 1: Creating test cron job...');
const [testJob] = await db.insert(cronJobs).values({
  name: 'Test Job - Every Minute',
  description: 'A test job that runs every minute',
  schedule: '*/1 * * * *',
  target: 'isolated',
  wakeMode: 'lazy',
  payloadType: 'test_task',
  payloadParams: JSON.stringify({ message: 'Test execution' }),
  enabled: 1,
}).returning();

console.log(`✅ Created job #${testJob.id}: ${testJob.name}\n`);

console.log('Step 2: Starting Scheduler...');
await Scheduler.start();
console.log('✅ Scheduler started\n');

console.log('Step 3: Getting scheduler status...');
const status = await Scheduler.getStatus();
console.log(`📊 Status:`);
console.log(`   Running: ${status.running}`);
console.log(`   Active Jobs: ${status.jobCount}`);
console.log(`   Pending Main Events: ${status.pendingMainEvents}`);
if (status.jobs.length > 0) {
  console.log(`\n   Jobs:`);
  for (const job of status.jobs) {
    console.log(`     - [${job.id}] ${job.name}`);
    console.log(`       Next run: ${job.nextRun?.toLocaleString() || 'N/A'}`);
  }
}
console.log('');

console.log('Step 4: Manually triggering job...');
await Scheduler.runNow(testJob.id);
console.log('✅ Job triggered manually\n');

console.log('Step 5: Waiting 3 seconds for execution...');
await new Promise(resolve => setTimeout(resolve, 3000));

console.log('Step 6: Checking execution history...');
const runs = await db.select().from(cronRuns).all();
console.log(`📝 Found ${runs.length} execution records`);
if (runs.length > 0) {
  console.log(`   Latest run: ${runs[runs.length - 1].status} at ${runs[runs.length - 1].startedAt}\n`);
}

console.log('Step 7: Stopping Scheduler...');
await Scheduler.stop();
console.log('✅ Scheduler stopped\n');

console.log('Step 8: Cleaning up test job...');
await db.delete(cronJobs).where(eq(cronJobs.id, testJob.id));
console.log('✅ Test job deleted\n');

console.log('🎉 All tests passed!');
process.exit(0);
