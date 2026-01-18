import { EmailExtractor, JobOpportunity, EmailData } from "./types";
import { LLMService } from "../../../services/llm";
import * as cheerio from "cheerio";

export class IndeedAdapter implements EmailExtractor {
    name = "Indeed";
    private llm: LLMService;

    constructor() {
        this.llm = new LLMService();
    }

    canHandle(sender: string, _subject: string): boolean {
        return sender.includes("indeed.com");
    }

    async extract(email: EmailData): Promise<JobOpportunity[]> {
        const opportunities: JobOpportunity[] = [];
        const body = email.body || "";
        
        // 1. Cheerio Parsing (Robust DOM traversal)
        const $ = cheerio.load(body);
        const seenUrls = new Set<string>();

        $("a").each((_, el) => {
            const href = $(el).attr("href");
            if (!href) return;

            // Indeed patterns: /rc/clk, /viewjob, /pagead/clk
            if (href.includes("/rc/clk") || href.includes("/viewjob") || href.includes("/pagead/clk")) {
                let cleanUrl = href;
                
                // Indeed links are often relative or tracking
                if (href.startsWith("/")) {
                    cleanUrl = `https://ca.indeed.com${href}`; // Assume CA based on user context, or extract domain
                }

                if (seenUrls.has(cleanUrl)) return;
                seenUrls.add(cleanUrl);

                let role = $(el).text().trim();
                let company = "Unknown";

                // Heuristic: Indeed digest layout
                // <a ...>Title</a> <br> <span class="company">Company</span>
                // OR
                // <div><a ...>Title</a></div> <div>Company</div>
                
                // Attempt 1: Next Element
                const nextText = $(el).next().text().trim();
                if (nextText && nextText.length < 50) company = nextText;

                // Attempt 2: Parent Next Sibling
                if (company === "Unknown" || company === "") {
                    const parentNext = $(el).parent().next().text().trim();
                    if (parentNext && parentNext.length < 50) company = parentNext;
                }

                // Cleanup
                if (!role || role.toLowerCase().includes("view job")) return;

                opportunities.push({
                    source: "Indeed",
                    company: company,
                    role: role,
                    applyUrl: cleanUrl,
                    rawEmailId: email.id,
                    originalBody: email.snippet || ""
                });
            }
        });

        // 2. Fallback to LLM if no links found (Single email)
        if (opportunities.length === 0) {
             const subject = email.subject || "";
             const sender = email.from || "";
             const snippet = email.snippet || "";
             
             // Indeed digest emails often have "30 new jobs" in subject, parse title
             let company = "Unknown";
             let role = "Unknown";
             
             if (subject.includes("new jobs")) {
                 role = "New Job Post (Digest)";
                 company = "Indeed";
             } else {
                 // Use LLM fallback
                 const result = await this.llm.extractJobDetails(subject, snippet, sender);
                 if (result.company !== "Ignore") {
                     company = result.company;
                     role = result.role;
                 }
             }

             if (company !== "Unknown") {
                 opportunities.push({
                    source: "Indeed",
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
