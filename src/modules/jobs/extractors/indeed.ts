import { EmailExtractor, JobOpportunity, EmailData } from "./types";
import { LLMService } from "../../../services/llm";

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
        // Indeed emails are notoriously messy in subject lines.
        // Direct LLM extraction is preferred.
        
        const subject = email.subject || "";
        const snippet = email.snippet || "";
        const sender = email.from || "";

        const result = await this.llm.extractJobDetails(subject, snippet, sender);
        
        if (result.company === "Ignore") return [];

        return [{
            source: "Indeed",
            company: result.company,
            role: result.role,
            rawEmailId: email.id,
            originalBody: snippet
        }];
    }
}
