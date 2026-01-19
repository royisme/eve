import { EmailExtractor } from "./types";
import { LinkedInAdapter } from "./linkedin";
import { IndeedAdapter } from "./indeed";
import { GenericAIExtractor } from "./ai";

let adapters: EmailExtractor[] | null = null;

function getAdapters(): EmailExtractor[] {
    if (!adapters) {
        adapters = [
            new LinkedInAdapter(),
            new IndeedAdapter(),
            new GenericAIExtractor()
        ];
    }
    return adapters;
}

export function getAdapter(sender: string, subject: string): EmailExtractor {
    const adapterList = getAdapters();
    for (const adapter of adapterList) {
        if (adapter.name === "Gemini-Fallback") continue;
        if (adapter.canHandle(sender, subject)) {
            return adapter;
        }
    }
    return adapterList.find(a => a.name === "Gemini-Fallback")!;
}
