import Anthropic from '@anthropic-ai/sdk';

export class LLMService {
    private client: Anthropic;
    private model: string;

    constructor() {
        const apiKey = process.env.ANTHROPIC_API_KEY;
        const baseURL = process.env.ANTHROPIC_BASE_URL;

        if (!apiKey) {
            throw new Error("Missing ANTHROPIC_API_KEY in .env");
        }

        this.client = new Anthropic({
            apiKey: apiKey,
            baseURL: baseURL,
        });

        // Configured model from user request
        this.model = "ark-code-latest";
    }

    async extractJobDetails(subject: string, snippet: string, sender: string): Promise<{ company: string, role: string, status: string }> {
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
            const response = await this.client.messages.create({
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
