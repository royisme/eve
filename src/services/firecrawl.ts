import FirecrawlApp from '@mendable/firecrawl-js';
import { ConfigManager } from "../core/config";

export class FirecrawlService {
    private app: FirecrawlApp | null = null;

    async init() {
        const apiKey = await ConfigManager.get<string>("services.firecrawl.api_key");
        if (!apiKey) {
            console.warn("⚠️ No Firecrawl API Key configured. Run `eva config set services.firecrawl.api_key '...'`");
            return false;
        }
        this.app = new FirecrawlApp({ apiKey });
        return true;
    }

    async crawl(url: string): Promise<string | null> {
        if (!this.app) {
            const ready = await this.init();
            if (!ready) return null;
        }

        try {
            console.log(`🕷️ Crawling: ${url}`);
            // Firecrawl SDK v1 uses 'scrapeUrl', but maybe type defs differ in v4/latest?
            // Checking docs: app.scrapeUrl(url, params)
            // If TS error says 'scrapeUrl' does not exist, check if it's 'scrape'
            const scrapeResult = await (this.app as any).scrapeUrl(url, { formats: ['markdown'] });
            
            if (!scrapeResult.success) {
                console.error(`Firecrawl failed for ${url}: ${scrapeResult.error}`);
                return null;
            }
            
            return scrapeResult.markdown || null;
        } catch (e) {
            console.error("Firecrawl error:", e);
            return null;
        }
    }
}
