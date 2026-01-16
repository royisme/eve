import { EmailExtractor } from "./types";
import { LinkedInAdapter } from "./linkedin";
import { IndeedAdapter } from "./indeed";
import { GenericAIExtractor } from "./ai";

const adapters: EmailExtractor[] = [
    new LinkedInAdapter(),
    new IndeedAdapter(),
    new GenericAIExtractor()
];

export function getAdapter(sender: string, subject: string): EmailExtractor {
    for (const adapter of adapters) {
        if (adapter.name === "Gemini-Fallback") continue;
        if (adapter.canHandle(sender, subject)) {
            return adapter;
        }
    }
    return adapters.find(a => a.name === "Gemini-Fallback")!;
}
