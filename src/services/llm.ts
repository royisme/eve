import Anthropic from '@anthropic-ai/sdk';
import { ConfigManager } from "../core/config";

export class LLMService {
    private client: Anthropic | null = null;
    private model: string = "ark-code-latest";

    async init() {
        const apiKey = await ConfigManager.get<string>("services.llm.api_key");
        const baseURL = await ConfigManager.get<string>("services.llm.base_url");
        this.model = await ConfigManager.get<string>("services.llm.model", "ark-code-latest") || "ark-code-latest";

        if (!apiKey) {
            console.warn("⚠️ No LLM API Key configured. Run `eva config set services.llm.api_key '...'`");
            return false;
        }

        this.client = new Anthropic({
            apiKey: apiKey,
            baseURL: baseURL,
        });
        return true;
    }

    async extractJobDetails(subject: string, snippet: string, sender: string): Promise<{ company: string, role: string, status: string }> {
        if (!this.client) {
            const ready = await this.init();
            if (!ready) return { company: "Unknown", role: "Unknown", status: "New" };
        }

        const prompt = `
You are an intelligent email parser for a job hunting assistant.
Extract the Company Name, Role/Job Title, and Application Status from the following email metadata.

Metadata:
- Sender: ${sender}
- Subject: ${subject}
- Snippet: ${snippet}

Rules:
1. If the email is a newsletter, spam, or not a specific job opportunity, set Company="Ignore" and Role="Ignore".
2. Status should be one of: "New", "Interview", "Offer", "Rejected", "Applied". Default to "New" if uncertain.
3. Return ONLY valid JSON. No markdown formatting.

Format:
{
  "company": "string",
  "role": "string",
  "status": "string"
}
`;

        try {
            const response = await this.client!.messages.create({
                model: this.model,
                max_tokens: 1024,
                messages: [{ role: 'user', content: prompt }],
                system: "You are a JSON-only extraction bot."
            });

            // Parse response
            const text = (response.content[0] as any).text;
            const json = JSON.parse(text.replace(/```json/g, '').replace(/```/g, '').trim());
            
            return {
                company: json.company || "Unknown",
                role: json.role || "Unknown",
                status: json.status || "New"
            };

        } catch (e) {
            console.error("LLM Extraction Failed:", e);
            return { company: "Unknown", role: "Unknown", status: "New" };
        }
    }
}
