import { db } from "./core/db";
import { jobs } from "./core/db/schema";
import { GmailSource } from "./core/gmail";
import { Dispatcher } from "./core/dispatcher";

const ACCOUNTS = ["rzhu84.ca@gmail.com", "imroybox@gmail.com", "atmojie21@gmail.com"];

// Initialize
const source = new GmailSource(ACCOUNTS);
const dispatcher = new Dispatcher();

async function main() {
    const cmd = process.argv[2];

    if (cmd === "run" || cmd === "ingest") {
        console.log("🤖 Eva started. Scanning inbox...");
        
        const emails = await source.search('(subject:application OR subject:interview OR subject:offer OR "apply" OR "job" OR "hiring") newer_than:2d', 30);
        
        console.log(`[Eva] Found ${emails.length} emails. Processing...`);

        for (const email of emails) {
            await dispatcher.dispatch(email);
        }
        
        console.log("✅ Eva cycle complete.");

    } else if (cmd === "report") {
        // Output a Markdown report for the LLM/User
        const rows = await db.select().from(jobs).orderBy(jobs.id).limit(10);
        
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

    } else if (cmd === "ui") {
        // Launch TUI
        const proc = Bun.spawn(["bun", "run", "src/ui/app.tsx"], {
            stdin: "inherit",
            stdout: "inherit",
            stderr: "inherit"
        });
        await proc.exited;

    } else if (cmd === "query") {
        const rows = await db.select().from(jobs).orderBy(jobs.id);
        console.table(rows.map(r => ({
            id: r.id,
            role: r.role,
            company: r.company,
            status: r.status,
            subject: r.subject.substring(0, 30) + "..."
        })));
    } else if (cmd === "clean") {
        await db.delete(jobs);
        console.log("Database cleared.");
    } else {
        console.log("Usage: bun run src/index.ts [run|query|clean|report|ui]");
    }
}

main();
