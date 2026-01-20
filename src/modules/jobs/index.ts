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
import * as JobsService from "../../capabilities/jobs/services/jobs-service";
import { generateUrlHash } from "../../capabilities/jobs/services/dedup";

export class JobModule implements EveModule {
  name = "jobs";

  // --- Ingestion Logic ---
  async handle(email: EmailData) {
    const subject = email.subject || "No Subject";
    const sender = email.from || "Unknown";
    const account = email._account;
    const now = new Date().toISOString();

    const adapter = getAdapter(sender, subject);
    const opportunities = await adapter.extract(email);

    for (const opp of opportunities) {
      let link = opp.applyUrl;
      if (!link) {
        const tid = email.threadId || email.id;
        if (tid) {
          link = `https://mail.google.com/mail/u/0/#inbox/${tid}`;
        } else {
          console.warn(`⚠️ No threadId/id for email: ${subject}`);
        }
      }

      const urlHash = link ? generateUrlHash(link) : null;

      if (urlHash) {
        const existingByUrl = await db.query.jobs.findFirst({
          where: eq(jobs.urlHash, urlHash),
        });
        if (existingByUrl) {
          await db.update(jobs)
            .set({ lastSeenAt: now })
            .where(eq(jobs.urlHash, urlHash));
          console.log(`⏭️ [JobModule] Updated lastSeenAt for duplicate (URL): ${opp.title} @ ${opp.company}`);
          continue;
        }
      }

      const existingBySubject = await db.query.jobs.findFirst({
        where: and(eq(jobs.subject, subject), eq(jobs.sender, sender)),
      });
      if (existingBySubject) {
        await db.update(jobs)
          .set({ lastSeenAt: now })
          .where(eq(jobs.id, existingBySubject.id));
        continue;
      }

      await db.insert(jobs).values({
        account: account || "Unknown",
        sender: sender,
        subject: subject,
        snippet: email.snippet || "",
        receivedAt: now,
        company: opp.company,
        title: opp.title,
        status: "inbox",
        url: link,
        urlHash: urlHash,
        threadId: email.threadId,
        rawBody: opp.originalBody,
        firstSeenAt: now,
        lastSeenAt: now,
      });
      console.log(
        `✅ [JobModule] Saved: ${opp.title} @ ${opp.company} (via ${adapter.name})`,
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
    const newJobs = await JobsService.searchJobs({ status: "New" });

    if (newJobs.length === 0) return "";

    let summary = "## 💼 Job Updates\n\n";
    summary += `**${newJobs.length} New Opportunities** in your inbox:\n\n`;

    for (const job of newJobs.slice(0, 10)) {
      const scoreBadge = job.score ? ` **[Match: ${job.score}%]**` : "";
      const link = job.url ? `[[Open](${job.url})]` : "";

      summary += `### ${job.title || "Unknown"} @ ${job.company || "Unknown"}${scoreBadge}\n`;
      // Fetch full job for analysis
      const fullJob = await JobsService.getJobById(job.id);
      if (fullJob?.analysis) {
        // Extract strategy or summary from analysis
        const lines = fullJob.analysis.split("\n");
        const strategy = lines
          .find((l) => l.includes("Strategy"))
          ?.replace(/- \*\*Strategy\*\*:/, "")
          .trim();
        if (strategy) summary += `> 💡 AI: ${strategy.substring(0, 100)}...\n`;
      }
      summary += `- Source: ${fullJob?.sender} ${link}\n\n`;
    }

    if (newJobs.length > 10) summary += `*... and ${newJobs.length - 10} more*`;

    return summary;
  }

  // --- Actions ---

  private async showStatus() {
    const stats = await JobsService.getJobStats();

    console.log(`
📊 **Eve Job Hunter Status**
===========================
📥 **Inbox (New)**:      ${stats.new}
蛛️ **Enriched (JD)**:    ${stats.enriched}
🧠 **Analyzed**:         ${stats.analyzed}
🚀 **Applied**:          ${stats.applied}
---------------------------
Total Tracked: ${stats.total}

💡 *Run 'eve jobs:enrich' to grab JDs.*
💡 *Run 'eve jobs:analyze' to get AI fit reports.*
`);
  }

  private async enrich() {
    console.log("蛛️ Finding jobs to enrich...");
    const result = await JobsService.enrichPendingJobs();
    console.log(`✅ Processed ${result.processed} jobs. Enriched: ${result.enriched}, Skipped: ${result.skipped}`);
    if (result.errors.length > 0) {
      console.error("❌ Errors during enrichment:", result.errors);
    }
  }

  private async analyze() {
    console.log("🧠 Finding jobs to analyze...");
    const result = await JobsService.analyzePendingJobs();
    console.log(`✅ Processed ${result.processed} jobs. Analyzed: ${result.analyzed}`);
    if (result.errors.length > 0) {
      console.error("❌ Errors during analysis:", result.errors);
    }
  }

  private async listJobs() {
    const rows = await JobsService.searchJobs({ limit: 20 });
    console.log("## 💼 Recent Jobs\n");
    for (const job of rows) {
      const statusIcon = job.status === "New" ? "🆕" : "📋";
      // We need description/analysis flags, let's fetch full job or adapt search result
      const fullJob = await JobsService.getJobById(job.id);
      const enrichedIcon = fullJob?.description ? "📄" : "";
      const analyzedIcon = fullJob?.analysis ? "🧠" : "";
      const scoreStr = job.score ? ` [Score: ${job.score}]` : "";

      console.log(
        `### ${statusIcon} ${job.title || "Unknown"} @ ${job.company || "Unknown"} ${enrichedIcon}${analyzedIcon}${scoreStr}`,
      );
      console.log(`- **ID**: ${job.id}`);
      console.log(`- **Subject**: ${fullJob?.subject}`);
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
