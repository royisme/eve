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

            // Pattern: https://www.linkedin.com/comm/jobs/view/12345 or https://www.linkedin.com/jobs/view/12345
            // Also handles query params
            const match = href.match(/(?:https?:\/\/)?(?:www\.)?linkedin\.com\/(?:comm\/)?jobs\/view\/(\d+)/);
            
            if (match) {
                const jobId = match[1];
                const cleanUrl = `https://www.linkedin.com/jobs/view/${jobId}`;
                
                if (seenUrls.has(cleanUrl)) return;
                seenUrls.add(cleanUrl);

                // Strategy: The link text is usually the Role title
                let role = $(el).text().trim();
                let company = "Unknown";

                // Heuristic: Company is often in the text immediately following the link, or in a sibling container.
                // LinkedIn digests are table-based.
                // <td><a href..>Role</a></td>
                // <td>Company</td>
                // OR
                // <a href..>Role</a> <br> Company
                
                // Attempt 1: Next Text Node
                // Attempt 2: Next Element Text
                const nextText = $(el).next().text().trim();
                if (nextText && nextText.length < 50) company = nextText;
                
                // Attempt 3: Parent's Next Sibling (Table Cell)
                if (company === "Unknown" || company === "") {
                     const parentNext = $(el).parent().next().text().trim();
                     if (parentNext && parentNext.length < 50) company = parentNext;
                }
                
                // Attempt 4: Text content of the parent container minus the link text
                if (company === "Unknown" || company === "") {
                    const parentText = $(el).parent().text().trim();
                    const remainder = parentText.replace(role, "").trim();
                    // Clean up "View job" or similar noise
                    const cleanRemainder = remainder.replace(/View job|Apply/gi, "").trim();
                    if (cleanRemainder.length > 2 && cleanRemainder.length < 50) {
                        company = cleanRemainder;
                    }
                }

                // If role looks like a button "View Job", try to find real role
                if (role.toLowerCase().includes("view") || role.length > 80) {
                    role = "Software Engineer (Parsed)"; // Fallback
                }

                opportunities.push({
                    source: "LinkedIn",
                    company: company,
                    role: role,
                    applyUrl: cleanUrl,
                    rawEmailId: email.id,
                    originalBody: snippet
                });
            }
        });

        // 2. Fallback: Subject Line Parsing (if no links found)
        if (opportunities.length === 0) {
            let company = "Unknown";
            let role = "Unknown";
            let isConfident = false;

            if (subject.includes(":")) {
                const parts = subject.split(":");
                if (parts.length >= 2) {
                    const p0 = parts[0].trim();
                    const p1 = parts[1].trim();
                    if (p0 && p1) {
                        role = p0;
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
                    role = result.role;
                }
            }

            if (company !== "Unknown") {
                opportunities.push({
                    source: "LinkedIn",
                    company: company,
                    role: role,
                    rawEmailId: email.id,
                    originalBody: snippet
                });
            }
        }

        return opportunities;
    }
}
