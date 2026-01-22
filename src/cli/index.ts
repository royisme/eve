import { cac } from "cac";
import { emailStatusTool, emailSetupTool } from "../capabilities/email/tools/status";
import { emailSyncTool } from "../capabilities/email/tools/sync";
import { JobModule } from "../modules/jobs";

const cli = cac("eve");

cli
  .command("status", "Show Eve system status")
  .action(async () => {
    const { bootstrap } = await import("../core/bootstrap");
    await bootstrap();
    
    const { getCapabilities } = await import("../capabilities");
    const caps = await getCapabilities();
    console.log("🤖 Eve Personal AI Assistant v0.3.0\n");
    console.log("📦 Capabilities:");
    for (const cap of caps) {
      console.log(`  - ${cap.name}: ${cap.tools.map(t => t.name).join(", ")}`);
    }
  });

cli
  .command("email:status", "Check email configuration")
  .action(async () => {
    const result = await emailStatusTool.execute("cli", {}, undefined, (update) => {
      const text = update.content?.[0];
      if (text && "text" in text) console.log(text.text);
    });
    const content = result.content[0];
    if (content && "text" in content) console.log(content.text);
  });

cli
  .command("email:setup <email>", "Setup Gmail account with OAuth")
  .action(async (email: string) => {
    console.log(`Setting up email: ${email}`);
    const result = await emailSetupTool.execute("cli", { email }, undefined, (update) => {
      const text = update.content?.[0];
      if (text && "text" in text) console.log(text.text);
    });
    const content = result.content[0];
    if (content && "text" in content) console.log(content.text);
  });

cli
  .command("email:sync", "Sync job emails from Gmail")
  .option("--query <query>", "Gmail search query", { default: "from:linkedin OR from:indeed" })
  .option("--max <n>", "Max threads to fetch", { default: 20 })
  .action(async (options: { query: string; max: number }) => {
    const result = await emailSyncTool.execute("cli", {
      query: options.query,
      maxThreads: Number(options.max)
    }, undefined, (update) => {
      const text = update.content?.[0];
      if (text && "text" in text) console.log(text.text);
    });
    const content = result.content[0];
    if (content && "text" in content) console.log(content.text);
  });

const jobModule = new JobModule();
jobModule.registerCommands(cli);

cli
  .command("config", "Interactive scheduler configuration wizard")
  .action(async () => {
    const { bootstrap } = await import("../core/bootstrap");
    await bootstrap();
    
    const { interactiveSchedulerSetup } = await import("./scheduler-config");
    await interactiveSchedulerSetup();
  });

cli
  .command("configure", "Configure Eve providers, accounts, and settings")
  .action(async () => {
    const { bootstrap } = await import("../core/bootstrap");
    await bootstrap();
    
    const { interactiveConfigure } = await import("./configure");
    await interactiveConfigure();
  });

cli
  .command("scheduler:start", "Start the Gateway scheduler daemon")
  .action(async () => {
    const { bootstrap } = await import("../core/bootstrap");
    await bootstrap();
    
    const { Scheduler } = await import("../core/scheduler");
    await import("../core/scheduler-executors");
    
    await Scheduler.start();
    console.log("🕐 Gateway Scheduler running. Press Ctrl+C to stop.");
    await new Promise(() => {});
  });

cli
  .command("scheduler:status", "Show scheduler status")
  .action(async () => {
    const { bootstrap } = await import("../core/bootstrap");
    await bootstrap();
    
    const { Scheduler } = await import("../core/scheduler");
    await import("../core/scheduler-executors");
    
    try {
      await Scheduler.start();
      const status = await Scheduler.getStatus();
      console.log(JSON.stringify(status, null, 2));
    } finally {
      await Scheduler.stop();
    }
  });

cli
  .command("scheduler:run <jobId>", "Run a cron job immediately")
  .action(async (jobId: string) => {
    const jobIdNum = parseInt(jobId);
    if (!Number.isFinite(jobIdNum) || jobIdNum <= 0) {
      console.error(`❌ Invalid job ID: ${jobId}. Must be a positive integer.`);
      process.exit(1);
    }
    
    const { bootstrap } = await import("../core/bootstrap");
    await bootstrap();
    
    const { Scheduler } = await import("../core/scheduler");
    await import("../core/scheduler-executors");
    
    await Scheduler.runNow(jobIdNum);
    console.log(`✅ Job ${jobId} triggered`);
  });

cli
  .command("serve", "Start HTTP API server")
  .option("--port <port>", "Port number", { default: 3033 })
  .action(async (options: { port: number }) => {
    const { startServer } = await import("../server");
    await startServer(Number(options.port));
  });

cli.help();
cli.version("0.3.0");

cli.parse();
