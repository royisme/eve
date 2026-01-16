import { cac } from "cac";
import { db } from "./core/db";
import { jobs } from "./core/db/schema";
import { GmailSource } from "./core/gmail";
import { Dispatcher } from "./core/dispatcher";
import { ConfigManager } from "./core/config";
import { FirecrawlService } from "./services/firecrawl";
import { eq, isNull } from "drizzle-orm";

const cli = cac("eva");

// --- Commands ---

cli.command("init", "Initialize Eva (Interactive)").action(async () => {
    console.log("👋 Welcome to Eva Initialization Wizard");
    console.log("1. Configure Google Accounts:");
    console.log("   Run: eva config set services.google.accounts '[\"you@gmail.com\"]'");
    console.log("2. Configure LLM:");
    console.log("   Run: eva config set services.llm.api_key \"sk-...\"");
    console.log("3. Configure Firecrawl (Optional):");
    console.log("   Run: eva config set services.firecrawl.api_key \"fc-...\"");
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
        console.log("✅ Eva ingestion complete.");
   });

cli.command("enrich", "Crawl full job descriptions for links").action(async () => {
    const firecrawl = new FirecrawlService();
    // Find jobs with URLs but no description
    const targets = await db.select().from(jobs).where(isNull(jobs.description)).all();
    
    console.log(`🕷️ Found ${targets.length} jobs to enrich...`);
    
    for (const job of targets) {
        if (job.url && job.url.startsWith("http") && !job.url.includes("google.com/mail")) {
            const markdown = await firecrawl.crawl(job.url);
            if (markdown) {
                await db.update(jobs)
                    .set({ description: markdown, crawledAt: new Date().toISOString() })
                    .where(eq(jobs.id, job.id));
                console.log(`✅ Enriched: ${job.company} - ${job.role}`);
            }
        }
    }
});

cli.command("report", "Generate a markdown report of jobs").action(async () => {
    const rows = await db.select().from(jobs).orderBy(jobs.id).limit(20);
    console.log("## 💼 Job Opportunities Report\n");
    if (rows.length === 0) {
        console.log("No new job opportunities found.");
    } else {
        for (const job of rows) {
            const statusIcon = job.status === 'New' ? '🆕' : '📋';
            const enrichedIcon = job.description ? '📄' : '';
            console.log(`### ${statusIcon} ${job.role || 'Unknown Role'} @ ${job.company || 'Unknown Company'} ${enrichedIcon}`);
            console.log(`- **Source**: ${job.sender}`);
            console.log(`- **Subject**: ${job.subject}`);
            console.log(`- **Received**: ${job.receivedAt}`);
            console.log(`- **Status**: ${job.status}`);
            if (job.url) console.log(`- **Link**: [Open](${job.url})`);
            console.log("");
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

