import { cac } from "cac";
import { getCapabilities } from "../capabilities";
import { emailStatusTool, emailSetupTool } from "../capabilities/email/tools/status";
import { emailSyncTool } from "../capabilities/email/tools/sync";
import { JobModule } from "../modules/jobs";

const cli = cac("eve");

cli
  .command("status", "Show Eve system status")
  .action(async () => {
    const { bootstrap } = await import("../core/bootstrap");
    await bootstrap();
    
    const caps = getCapabilities();
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
  .command("serve", "Start HTTP API server")
  .option("--port <port>", "Port number", { default: 3033 })
  .action(async (options: { port: number }) => {
    const { startServer } = await import("../server");
    await startServer(Number(options.port));
  });

cli.help();
cli.version("0.3.0");

cli.parse();
