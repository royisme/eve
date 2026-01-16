import { cac } from "cac";
import { db } from "./core/db";
import { jobs } from "./core/db/schema";
import { GmailSource } from "./core/gmail";
import { Dispatcher } from "./core/dispatcher";
import { ConfigManager } from "./core/config";

const cli = cac("eva");

// --- Commands ---

cli.command("init", "Initialize Eva (Interactive)").action(async () => {
    console.log("👋 Welcome to Eva Initialization Wizard");
    console.log("This will help you configure Gmail, LLM, and Database.");
    console.log("(Interactive inputs not fully supported in this shell environment yet. Use `config set` for now.)");
    
    // In a real TTY, we would use prompts. Here we guide the user.
    console.log("\n1. Configure Google Accounts:");
    console.log("   Run: eva config set services.google.accounts '[\"you@gmail.com\"]'");
    
    console.log("\n2. Configure LLM Provider (Ark/Anthropic):");
    console.log("   Run: eva config set services.llm.api_key \"sk-...\"");
    console.log("   Run: eva config set services.llm.base_url \"https://ark...\"");
});

cli.command("ingest", "Scan emails and update database")
   .alias("run")
   .alias("sync")
   .action(async () => {
        const source = new GmailSource();
        const dispatcher = new Dispatcher();
        
        console.log("🤖 Eva started. Scanning inbox...");
        const emails = await source.search('(subject:application OR subject:interview OR subject:offer OR "apply" OR "job" OR "hiring") newer_than:2d', 30);
        console.log(`[Eva] Found ${emails.length} emails. Processing...`);

        for (const email of emails) {
            await dispatcher.dispatch(email);
        }
        console.log("✅ Eva cycle complete.");
   });

cli.command("report", "Generate a markdown report of jobs").action(async () => {
    const rows = await db.select().from(jobs).orderBy(jobs.id).limit(20);
    console.log("## 💼 Job Opportunities Report\n");
    if (rows.length === 0) {
        console.log("No new job opportunities found.");
    } else {
        for (const job of rows) {
            const statusIcon = job.status === 'New' ? '🆕' : '📋';
            console.log(`### ${statusIcon} ${job.role || 'Unknown Role'} @ ${job.company || 'Unknown Company'}`);
            console.log(`- **Source**: ${job.sender}`);
            console.log(`- **Subject**: ${job.subject}`);
            console.log(`- **Received**: ${job.receivedAt}`);
            console.log(`- **Status**: ${job.status}\n`);
        }
    }
    console.log(`\n_Total jobs in database: ${rows.length}_`);
});

cli.command("config set <key> <value>", "Set a config value (JSON supported)")
   .action(async (key, value) => {
       try {
           // Try parsing JSON if it looks like array/object
           if (value.startsWith("[") || value.startsWith("{")) {
               value = JSON.parse(value);
           }
           await ConfigManager.set(key, value, key.split(".")[0] || "core");
           console.log(`✅ Config set: ${key} = ${JSON.stringify(value)}`);
       } catch (e) {
           console.error("Error setting config:", e);
       }
   });

cli.command("config get <key>", "Get a config value").action(async (key) => {
    const val = await ConfigManager.get(key);
    console.log(val);
});

cli.command("config list", "List all config").action(async () => {
    const rows = await ConfigManager.list();
    console.table(rows.map(r => ({ key: r.key, value: r.value.substring(0, 50) + "..." })));
});

cli.command("ui", "Launch TUI").action(async () => {
    const proc = Bun.spawn(["bun", "run", "src/ui/app.tsx"], {
        stdin: "inherit",
        stdout: "inherit",
        stderr: "inherit"
    });
    await proc.exited;
});

cli.command("clean", "Clear database").action(async () => {
    await db.delete(jobs);
    console.log("Database cleared.");
});

cli.help();
cli.parse();

