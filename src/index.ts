import { cac } from "cac";
import { ConfigManager } from "./core/config";
import { GmailSource } from "./core/gmail";
import { Dispatcher } from "./core/dispatcher";
import { JobModule } from "./modules/jobs";
import { db } from "./core/db";
import { jobs } from "./core/db/schema";
import type { EvaModule } from "./types/module";
import { AgentManager } from "./agents/manager";

const cli = cac("eva");

// --- Kernel / Module Loader ---
const modules: EvaModule[] = [
    new JobModule()
];

// Register Module Commands
for (const mod of modules) {
    mod.registerCommands(cli);
}

// --- Global Commands ---

cli.command("morning", "Generate Morning Briefing from all modules")
   .action(async () => {
       console.log("# 🌅 Eva Morning Briefing\n");
       console.log(`_Generated at ${new Date().toLocaleString()}_\n`);
       
       for (const mod of modules) {
           if (mod.getDailyBriefing) {
               const briefing = await mod.getDailyBriefing();
               if (briefing) {
                   console.log(briefing);
                   console.log("---\n");
               }
           }
       }
       console.log("Ready for your commands, Sir.");
   });

cli.command("sync", "Sync all data sources (Gmail, etc)")
   .alias("ingest")
   .action(async () => {
        const source = new GmailSource();
        // TODO: Dispatcher should ideally be generic, but for now it knows about Jobs
        const dispatcher = new Dispatcher(); 
        
        console.log("🤖 Eva Sync Initiated...");
        const emails = await source.search('(subject:application OR subject:interview OR subject:offer OR "apply" OR "job" OR "hiring") newer_than:2d', 30);
        console.log(`[Eva] Found ${emails.length} emails. Dispatching to modules...`);

        for (const email of emails) {
            await dispatcher.dispatch(email);
        }
        console.log("✅ Sync complete.");
   });

cli.command("status", "System Status")
   .action(() => {
       console.log("🟢 Eva System Online");
       console.log(`Loaded Modules: ${modules.map(m => m.name).join(", ")}`);
   });

// --- Core Config/Utils ---

cli.command("config:set <key> <value>", "Set a config value")
   .action(async (key, value) => {
       try {
           if (value.startsWith("[") || value.startsWith("{")) {
               value = JSON.parse(value);
           }
           await ConfigManager.set(key, value, key.split(".")[0] || "core");
           console.log(`✅ Config set: ${key} = ${JSON.stringify(value)}`);
       } catch (e) {
           console.error("Error setting config:", e);
       }
   });

cli.command("config:get <key>", "Get a config value").action(async (key) => {
    console.log(await ConfigManager.get(key));
});

cli.command("clean", "Clear database (Debug)").action(async () => {
    await db.delete(jobs);
    console.log("Database cleared.");
});



cli.command("models", "List available model aliases").action(async () => {
    console.log("🤖 Available Model Aliases:");
    const models = AgentManager.listAvailableModels();
    for (const model of models) {
        console.log(`  • ${model}`);
    }
    console.log("
✨ Use these names in eva config commands.");
});



cli.command("models", "List available model aliases").action(async () => {
    console.log("🤖 Available Model Aliases:
");
    const models = AgentManager.listAvailableModels();
    for (const model of models) {
        console.log(`  • ${model}`);
    }
    console.log("
✨ Use these names in eva config commands.");
});


// Debug
// console.log("ARGV:", process.argv);

cli.help();
cli.parse();
