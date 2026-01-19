import { EmailExtractor, JobOpportunity, EmailData } from "./types";
import { LLMService } from "../../../services/llm";
import * as cheerio from "cheerio";

export class LinkedInAdapter implements EmailExtractor {
    name = "LinkedIn";
    private llm: LLMService;

    constructor() {
        this.llm = new LLMService();
    }

    canHandle(sender: string, _subject: string): boolean {
        return sender.includes("linkedin.com");
    }

    async extract(email: EmailData): Promise<JobOpportunity[]> {
        const opportunities: JobOpportunity[] = [];
        const body = email.body || "";
        const subject = email.subject || "";
        const snippet = email.snippet || "";
        const sender = email.from || "";

        // 1. Intelligent Parsing (Cheerio)
        const $ = cheerio.load(body);
        const seenUrls = new Set<string>();

        // Find all links matching LinkedIn Job View pattern
        $("a").each((_, el) => {
            const href = $(el).attr("href");
            if (!href) return;

            // Pattern: linkedin.com/comm/jobs/view/12345 or linkedin.com/jobs/view/12345
            // Also handles query params
            const match = href.match(/linkedin\.com\/(?:comm\/)?jobs\/view\/(\d+)/);
            
            if (match) {
                const jobId = match[1];
                const cleanUrl = `https://www.linkedin.com/jobs/view/${jobId}`;
                
                // Strategy: The link text is usually the Role title
                let title = $(el).text().trim();
                
                // SKIP if title is empty (e.g. Logo link) or generic "View Job"
                if (!title || title.toLowerCase().includes("view job") || title.toLowerCase() === "view") {
                    return; 
                }
                
                // If URL seen, skip (but only after we ensured this one has text)
                if (seenUrls.has(cleanUrl)) return;
                seenUrls.add(cleanUrl);

                let company = "Unknown";

                // Heuristic for Company:
                // HTML Structure:
                // <tr><td><a ...>Role</a></td></tr>
                // <tr><td><p ...>Company · Location</p></td></tr>
                
                // Attempt: Closest TR -> Next TR -> Text
                const row = $(el).closest('tr');
                if (row.length > 0) {
                    const nextRow = row.next();
                    const companyText = nextRow.text().trim();
                    if (companyText && companyText.length < 100) {
                        // "Aurora Solar · Canada (Remote)"
                        // Split by dot or middot
                        const parts = companyText.split(/[·•]/);
                        if (parts.length > 0) {
                            company = parts[0].trim();
                        }
                    }
                }
                
                // Fallback attempts
                if (company === "Unknown" || company === "") {
                     const parentNext = $(el).parent().next().text().trim();
                     if (parentNext && parentNext.length < 50) company = parentNext;
                }

                // If company is still unknown, check if Role text contains it? No.

                opportunities.push({
                    source: "LinkedIn",
                    company: company,
                    title: title,
                    applyUrl: cleanUrl,
                    rawEmailId: email.id,
                    originalBody: snippet
                });
            }
        });

        // 2. Fallback: Subject Line Parsing (if no links found)
        if (opportunities.length === 0) {
            let company = "Unknown";
            let title = "Unknown";
            let isConfident = false;

            if (subject.includes(":")) {
                const parts = subject.split(":");
                if (parts.length >= 2) {
                    const p0 = parts[0].trim();
                    const p1 = parts[1].trim();
                    if (p0 && p1) {
                        title = p0;
                        company = p1;
                        isConfident = true;
                    }
                }
            }

            // LLM fallback
            if (!isConfident || company === "Unknown") {
                const result = await this.llm.extractJobDetails(subject, snippet, sender);
                if (result.company !== "Ignore") {
                    company = result.company;
                    title = result.title;
                }
            }

            if (company !== "Unknown") {
                opportunities.push({
                    source: "LinkedIn",
                    company: company,
                    title: title,
                    rawEmailId: email.id,
                    originalBody: snippet
                });
            }
        }

        return opportunities;
    }
}
