import { EmailExtractor, JobOpportunity, EmailData } from "./types";
import { LLMService } from "../../../services/llm";

export class GenericAIExtractor implements EmailExtractor {
    name = "Gemini-Fallback";
    private llm: LLMService;

    constructor() {
        this.llm = new LLMService();
    }

    canHandle(_sender: string, _subject: string): boolean {
        return true; 
    }

    async extract(email: EmailData): Promise<JobOpportunity[]> {
        const subject = email.subject || "";
        const snippet = email.snippet || "";
        const sender = email.from || "";

        // console.log(`🤖 AI Analyzing: ${subject.substring(0, 40)}...`);
        const result = await this.llm.extractJobDetails(subject, snippet, sender);

        if (result.company === "Ignore") {
            return [];
        }

        return [{
            source: "AI-Extracted",
            company: result.company,
            title: result.title,
            rawEmailId: email.id,
            originalBody: snippet
        }];
    }
}
