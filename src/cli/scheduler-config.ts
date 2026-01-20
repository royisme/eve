import { db } from '../core/db';
import { cronJobs } from '../db/schema';
import { eq } from 'drizzle-orm';
import { Scheduler } from '../core/scheduler';
import { 
  listAccounts, 
  addAccount, 
  setPrimaryAccount, 
  removeAccount,
  ensureAccountsInitialized,
} from '../capabilities/email/services/account-service';
import { listPresets, createJobFromPreset } from '../core/scheduler-presets';
import { checkGogAuth } from '../capabilities/email/services/email-service';

function prompt(message: string): Promise<string> {
  process.stdout.write(message);
  return new Promise((resolve) => {
    let input = '';
    process.stdin.setEncoding('utf8');
    process.stdin.once('data', (data) => {
      input = data.toString().trim();
      resolve(input);
    });
  });
}

function printMenu(title: string, options: Array<{ key: string; label: string }>): void {
  console.log(`\n${title}\n`);
  for (const opt of options) {
    console.log(`  [${opt.key}] ${opt.label}`);
  }
  console.log('');
}

export async function interactiveSchedulerSetup(): Promise<void> {
  console.log("\n🔧 Eve Scheduler Configuration\n");
  await ensureAccountsInitialized();

  const mainMenu = [
    { key: '1', label: '📧 Email Accounts' },
    { key: '2', label: '📅 Scheduled Jobs' },
    { key: '3', label: '📊 View Status' },
    { key: 'q', label: '❌ Exit' },
  ];

  while (true) {
    printMenu('What would you like to configure?', mainMenu);
    const choice = await prompt('Enter choice: ');

    switch (choice) {
      case '1':
        await accountsMenu();
        break;
      case '2':
        await jobsMenu();
        break;
      case '3':
        await showStatus();
        break;
      case 'q':
        console.log('Goodbye!');
        return;
      default:
        console.log('Invalid choice');
    }
  }
}

async function accountsMenu(): Promise<void> {
  const menu = [
    { key: '1', label: '➕ Add account' },
    { key: '2', label: '⭐ Set primary' },
    { key: '3', label: '📋 List accounts' },
    { key: '4', label: '🗑️ Remove account' },
    { key: 'b', label: '← Back' },
  ];

  printMenu('Email Accounts', menu);
  const choice = await prompt('Enter choice: ');

  switch (choice) {
    case '1': {
      const email = await prompt('Gmail address: ');
      if (!email.includes('@')) {
        console.log('Invalid email address');
        return;
      }
      const alias = await prompt('Nickname (optional, press Enter to skip): ');
      const isPrimaryInput = await prompt('Set as primary? (y/n): ');
      const isPrimary = isPrimaryInput.toLowerCase() === 'y';
      
      const isAuthorized = await checkGogAuth(email);
      
      if (isPrimary) {
        const existingAccounts = await listAccounts();
        for (const acc of existingAccounts) {
          if (acc.isPrimary) {
            await setPrimaryAccount(email);
            break;
          }
        }
      }
      
      await addAccount(email, { 
        alias: alias || undefined, 
        isPrimary,
        isAuthorized,
      });
      console.log(`✅ Added ${email}${isAuthorized ? '' : ' (needs authorization - run eve email:setup)'}`);
      break;
    }
    case '2': {
      const accounts = await listAccounts();
      if (accounts.length === 0) {
        console.log('No accounts configured.');
        return;
      }
      console.log('\nAvailable accounts:');
      accounts.forEach((a, i) => console.log(`  [${i + 1}] ${a.email}${a.isPrimary ? ' ⭐' : ''}`));
      const idx = await prompt('Select account number: ');
      const account = accounts[parseInt(idx) - 1];
      if (account) {
        await setPrimaryAccount(account.email);
        console.log(`⭐ ${account.email} is now primary`);
      }
      break;
    }
    case '3': {
      const accounts = await listAccounts();
      console.log('\n📧 Accounts:');
      if (accounts.length === 0) {
        console.log('  No accounts configured.');
      } else {
        for (const a of accounts) {
          const primary = a.isPrimary ? '⭐' : ' ';
          const auth = a.isAuthorized ? '✅' : '⚠️';
          console.log(`  ${primary} ${auth} ${a.email}${a.alias ? ` (${a.alias})` : ''}`);
        }
      }
      break;
    }
    case '4': {
      const accounts = await listAccounts();
      if (accounts.length === 0) {
        console.log('No accounts configured.');
        return;
      }
      console.log('\nAccounts:');
      accounts.forEach((a, i) => console.log(`  [${i + 1}] ${a.email}`));
      const idx = await prompt('Select account to remove: ');
      const account = accounts[parseInt(idx) - 1];
      if (account) {
        await removeAccount(account.email);
        console.log(`🗑️ Removed ${account.email}`);
      }
      break;
    }
  }
}

async function jobsMenu(): Promise<void> {
  const menu = [
    { key: '1', label: '➕ Create from preset' },
    { key: '2', label: '📋 List jobs' },
    { key: '3', label: '▶️ Run job now' },
    { key: '4', label: '🔄 Toggle job' },
    { key: 'b', label: '← Back' },
  ];

  printMenu('Scheduled Jobs', menu);
  const choice = await prompt('Enter choice: ');

  switch (choice) {
    case '1': {
      const presets = await listPresets();
      console.log('\nAvailable presets:');
      presets.forEach((p, i) => console.log(`  [${i + 1}] ${p.name} (${p.schedule})`));
      const idx = await prompt('Select preset: ');
      const preset = presets[parseInt(idx) - 1];
      if (preset) {
        const jobId = await createJobFromPreset(preset.key);
        console.log(`✅ Created job "${preset.name}" (ID: ${jobId})`);
      }
      break;
    }
    case '2': {
      const jobs = await db.select().from(cronJobs).all();
      console.log('\n📅 Jobs:');
      if (jobs.length === 0) {
        console.log('  No jobs configured.');
      } else {
        for (const j of jobs) {
          const mode = j.target === 'main' ? '💬' : '🔇';
          const status = j.enabled ? '🟢' : '⚪';
          console.log(`  ${status} [${j.id}] ${j.name} ${mode}`);
          console.log(`      Schedule: ${j.schedule} | Type: ${j.payloadType}`);
        }
      }
      break;
    }
    case '3': {
      const jobs = await db.select().from(cronJobs).all();
      if (jobs.length === 0) {
        console.log('No jobs configured.');
        return;
      }
      console.log('\nJobs:');
      jobs.forEach(j => console.log(`  [${j.id}] ${j.name}`));
      const jobId = await prompt('Enter job ID to run: ');
      await Scheduler.runNow(parseInt(jobId));
      console.log('🔄 Job triggered');
      break;
    }
    case '4': {
      const jobs = await db.select().from(cronJobs).all();
      if (jobs.length === 0) {
        console.log('No jobs configured.');
        return;
      }
      console.log('\nJobs:');
      jobs.forEach(j => console.log(`  [${j.id}] ${j.enabled ? '🟢' : '⚪'} ${j.name}`));
      const jobId = await prompt('Enter job ID to toggle: ');
      const job = jobs.find(j => j.id === parseInt(jobId));
      if (job) {
        const newEnabled = job.enabled ? 0 : 1;
        await db.update(cronJobs).set({ enabled: newEnabled }).where(eq(cronJobs.id, job.id));
        
        const updatedJob = await db.select().from(cronJobs).where(eq(cronJobs.id, job.id)).get();
        if (updatedJob) {
          await Scheduler.upsertJob(updatedJob);
        }
        
        console.log(`${newEnabled ? '🟢 Enabled' : '⚪ Disabled'} job: ${job.name}`);
      }
      break;
    }
  }
}

async function showStatus(): Promise<void> {
  const status = await Scheduler.getStatus();
  
  console.log('\n📊 Scheduler Status');
  console.log(`   State: ${status.running ? '🟢 Running' : '⚪ Stopped'}`);
  console.log(`   Active Jobs: ${status.jobCount}`);
  console.log(`   Pending Events: ${status.pendingMainEvents}`);
  
  if (status.jobs.length > 0) {
    console.log('\n   Upcoming:');
    for (const j of status.jobs.slice(0, 5)) {
      console.log(`     [${j.id}] ${j.name}: ${j.nextRun?.toLocaleString() || 'N/A'}`);
    }
  }
}
