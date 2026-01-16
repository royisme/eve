import { EmailExtractor, JobOpportunity, EmailData } from "./types";
import { LLMService } from "../../../services/llm";

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
        const subject = email.subject || "";
        const snippet = email.snippet || "";
        const sender = email.from || "";
        
        // Fast Path: Try Regex first to save Tokens
        let company = "Unknown";
        let role = "Unknown";
        let isConfident = false;

        if (subject.includes(":")) {
            const parts = subject.split(":");
            if (parts.length >= 2) {
                // Heuristic: "Role: Company" or "Company: Role"
                // e.g. "Software Engineer: Google"
                const p0 = parts[0].trim();
                const p1 = parts[1].trim();
                
                // Simple heuristic: which one looks like a company?
                // If regex fails or produces "Unknown", we use LLM.
                // For now, let's assume if we extracted strings, it's somewhat okay, 
                // but we will verify with LLM if it looks ambiguous.
                if (p0 && p1) {
                    role = p0;
                    company = p1;
                    isConfident = true;
                }
            }
        }

        // Slow Path: LLM Refinement
        // If we are not confident, or if we want high quality, we ask LLM.
        // Given user wants "upgrade", let's use LLM to verify/extract better data.
        if (!isConfident || company === "Unknown") {
            // console.log(`🔍 [LinkedIn] Invoking LLM for better parsing: ${subject}`);
            const result = await this.llm.extractJobDetails(subject, snippet, sender);
            if (result.company !== "Ignore") {
                company = result.company;
                role = result.role;
            } else {
                return []; // LLM said ignore
            }
        }

        opportunities.push({
            source: "LinkedIn",
            company: company,
            role: role,
            rawEmailId: email.id,
            originalBody: snippet
        });

        return opportunities;
    }
}
