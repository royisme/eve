import FirecrawlApp from "@mendable/firecrawl-js";
import { ConfigManager } from "../core/config";

// Local type for SDK compatibility
type FirecrawlInstance = FirecrawlApp & {
  scrapeUrl?: (url: string, options?: any) => Promise<any>;
  scrape?: (url: string) => Promise<any>;
};

export class FirecrawlService {
  private app: FirecrawlApp | null = null;

  async init() {
    const apiKey = await ConfigManager.get<string>(
      "services.firecrawl.api_key",
    );
    if (!apiKey) {
      console.warn(
        "⚠️ No Firecrawl API Key configured. Run `eve config set services.firecrawl.api_key '...'`",
      );
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

      const appInstance = this.app as unknown as FirecrawlInstance;
      let result: any;

      if (typeof appInstance.scrapeUrl === "function") {
        result = await appInstance.scrapeUrl(url, { formats: ["markdown"] });
      } else if (typeof appInstance.scrape === "function") {
        result = await appInstance.scrape(url);
      } else {
        console.error("Firecrawl SDK method not found on instance");
        return null;
      }

      if (result.success === false) {
        // Only fail if explicitly false
        // Fallback: Check if markdown exists anyway (SDK quirks)
        if (!result.markdown && !result.data?.markdown) {
          console.error(
            `Firecrawl failed for ${url}:`,
            result.error || JSON.stringify(result),
          );
          return null;
        }
      }

      // Check return structure (v0 vs v1)
      return (
        result.markdown || (result.data ? result.data.markdown : null) || null
      );
    } catch (e) {
      console.error("Firecrawl error:", e);
      return null;
    }
  }
}
