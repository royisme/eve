import { CAC } from "cac";
import { EveModule } from "../../types/module";
import { db } from "../../db";
import { jobs } from "../../db/schema";
import { getAdapter } from "./extractors";
import { eq, and, isNull, isNotNull, desc } from "drizzle-orm";
import type { EmailData } from "./extractors/types";
import { FirecrawlService } from "../../services/firecrawl";
import { LLMService } from "../../services/llm";
import { ConfigManager } from "../../core/config";
import * as fs from "fs";

export class JobModule implements EveModule {
  name = "jobs";

  // --- Ingestion Logic ---
  async handle(email: EmailData) {
    const subject = email.subject || "No Subject";
    const sender = email.from || "Unknown";
    const account = email._account;

    // Deduplicate
    const existing = await db.query.jobs.findFirst({
      where: and(eq(jobs.subject, subject), eq(jobs.sender, sender)),
    });

    if (existing) {
      return;
    }

    const adapter = getAdapter(sender, subject);
    const opportunities = await adapter.extract(email);

    for (const opp of opportunities) {
      let link = opp.applyUrl;
      if (!link) {
        // Fallback to Gmail link
        // Use threadId if available, else id
        const tid = email.threadId || email.id;
        if (tid) {
          link = `https://mail.google.com/mail/u/0/#inbox/${tid}`;
        } else {
          console.warn(`⚠️ No threadId/id for email: ${subject}`);
        }
      }

      await db.insert(jobs).values({
        account: account || "Unknown",
        sender: sender,
        subject: subject,
        snippet: email.snippet || "",
        receivedAt: new Date().toISOString(),
        company: opp.company,
        role: opp.role,
        status: "New",
        url: link,
        threadId: email.threadId,
        rawBody: opp.originalBody,
      });
      console.log(
        `✅ [JobModule] Saved: ${opp.role} @ ${opp.company} (via ${adapter.name})`,
      );
    }
  }

  async onIngest(event: any): Promise<void> {
    return this.handle(event);
  }

  // --- CLI Commands ---
  registerCommands(cli: CAC) {
    cli
      .command("jobs:status", "Show job hunting dashboard")
      .action(() => this.showStatus());

    cli
      .command("jobs:enrich", "Enrich jobs with Firecrawl")
      .action(() => this.enrich());

    cli
      .command("jobs:analyze", "Analyze jobs with LLM")
      .action(() => this.analyze());

    cli.command("jobs:list", "List all jobs").action(() => this.listJobs());

    cli
      .command("jobs:resume <path>", "Import resume (MD or PDF)")
      .action((path) => this.importResume(path));
  }

  // --- Morning Briefing ---
  async getDailyBriefing(): Promise<string> {
    const newJobs = await db
      .select()
      .from(jobs)
      .where(eq(jobs.status, "New"))
      .orderBy(desc(jobs.receivedAt))
      .all();

    if (newJobs.length === 0) return "";

    let summary = "## 💼 Job Updates\n\n";
    summary += `**${newJobs.length} New Opportunities** in your inbox:\n\n`;

    for (const job of newJobs.slice(0, 10)) {
      const scoreBadge = job.score ? ` **[Match: ${job.score}%]**` : "";
      const link = job.url ? `[[Open](${job.url})]` : "";

      summary += `### ${job.role || "Unknown"} @ ${job.company || "Unknown"}${scoreBadge}\n`;
      if (job.analysis) {
        // Extract strategy or summary from analysis
        const lines = job.analysis.split("\n");
        const strategy = lines
          .find((l) => l.includes("Strategy"))
          ?.replace(/- \*\*Strategy\*\*:/, "")
          .trim();
        if (strategy) summary += `> 💡 AI: ${strategy.substring(0, 100)}...\n`;
      }
      summary += `- Source: ${job.sender} ${link}\n\n`;
    }

    if (newJobs.length > 10) summary += `*... and ${newJobs.length - 10} more*`;

    return summary;
  }

  // --- Actions ---

  private async showStatus() {
    const all = await db.select().from(jobs).all();
    const newJobs = all.filter((j) => j.status === "New");
    const enriched = all.filter((j) => j.description !== null);
    const analyzed = all.filter((j) => j.analysis !== null);
    const applied = all.filter((j) => j.status === "Applied");

    console.log(`
📊 **Eve Job Hunter Status**
===========================
📥 **Inbox (New)**:      ${newJobs.length}
🕷️ **Enriched (JD)**:    ${enriched.length}
🧠 **Analyzed**:         ${analyzed.length}
🚀 **Applied**:          ${applied.length}
---------------------------
Total Tracked: ${all.length}

💡 *Run 'eve jobs:enrich' to grab JDs.*
💡 *Run 'eve jobs:analyze' to get AI fit reports.*
`);
  }

  private async enrich() {
    const firecrawl = new FirecrawlService();
    const targets = await db
      .select()
      .from(jobs)
      .where(isNull(jobs.description))
      .all();

    console.log(`🕷️ Found ${targets.length} jobs to enrich...`);

    for (const job of targets) {
      if (
        job.url &&
        job.url.startsWith("http") &&
        !job.url.includes("google.com/mail")
      ) {
        const markdown = await firecrawl.crawl(job.url);
        if (markdown) {
          await db
            .update(jobs)
            .set({ description: markdown, crawledAt: new Date().toISOString() })
            .where(eq(jobs.id, job.id));
          console.log(`✅ Enriched: ${job.company} - ${job.role}`);
        }
        // Throttle to respect Rate Limits (e.g. 1 req/2s)
        await new Promise((resolve) => setTimeout(resolve, 2000));
      } else {
        console.log(`⚠️ Skipping ${job.company} (No external URL)`);
      }
    }
  }

  private async analyze() {
    const llm = new LLMService();
    const targets = await db
      .select()
      .from(jobs)
      .where(and(isNotNull(jobs.description), isNull(jobs.analysis)))
      .all();
    const resume = await ConfigManager.get<string>("jobs.resume");

    console.log(`🧠 Found ${targets.length} jobs to analyze...`);
    if (resume) console.log("📄 Using configured Resume for Fit Analysis.");
    else
      console.log(
        "⚠️ No Resume configured. Analysis will be generic. (Use 'jobs:resume <path>' to set)",
      );

    for (const job of targets) {
      console.log(`🤔 Analyzing: ${job.company} - ${job.role}...`);
      const analysis = await llm.analyzeJob(job.description!, resume);

      // Extract Score
      let score = 0;
      const scoreMatch = analysis.match(/\*\*Match Score\*\*:\s*[*[]?(\d+)/);
      if (scoreMatch) {
        score = parseInt(scoreMatch[1]);
      }

      await db
        .update(jobs)
        .set({
          analysis: analysis,
          score: score > 0 ? score : null,
        })
        .where(eq(jobs.id, job.id));

      console.log(`✅ Analysis Complete. Score: ${score || "N/A"}`);
    }
  }

  private async listJobs() {
    const rows = await db
      .select()
      .from(jobs)
      .orderBy(desc(jobs.receivedAt))
      .limit(20);
    console.log("## 💼 Recent Jobs\n");
    for (const job of rows) {
      const statusIcon = job.status === "New" ? "🆕" : "📋";
      const enrichedIcon = job.description ? "📄" : "";
      const analyzedIcon = job.analysis ? "🧠" : "";
      const scoreStr = job.score ? ` [Score: ${job.score}]` : "";

      console.log(
        `### ${statusIcon} ${job.role || "Unknown"} @ ${job.company || "Unknown"} ${enrichedIcon}${analyzedIcon}${scoreStr}`,
      );
      console.log(`- **ID**: ${job.id}`);
      console.log(`- **Subject**: ${job.subject}`);
      console.log(`- **Date**: ${job.receivedAt}`);
      if (job.url) console.log(`- **Link**: [Open](${job.url})`);
      console.log("");
    }
  }

  private async importResume(filePath: string) {
    try {
      if (!fs.existsSync(filePath)) {
        console.error(`❌ File not found: ${filePath}`);
        return;
      }

      console.log(`📄 Reading resume from: ${filePath}`);
      let content = "";

      if (filePath.toLowerCase().endsWith(".pdf")) {
        // Use system pdftotext
        const proc = Bun.spawn(["pdftotext", filePath, "-"], {
          stdout: "pipe",
        });
        content = await new Response(proc.stdout).text();

        if (content.trim().length === 0) {
          console.warn(
            "⚠️ Warning: Extracted text is empty. PDF might be scanned image.",
          );
        } else {
          console.log(
            `✅ Extracted ${content.length} characters from PDF (via pdftotext).`,
          );
        }
      } else {
        content = fs.readFileSync(filePath, "utf-8");
        console.log(`✅ Read ${content.length} characters.`);
      }

      // Save to Config
      await ConfigManager.set("jobs.resume", content, "jobs");
      console.log("💾 Resume saved to configuration (jobs.resume).");
      console.log("Ready for 'jobs:analyze'.");
    } catch (error) {
      console.error("❌ Error importing resume:", error);
    }
  }
}
