import { ConfigManager } from "./config";

// The unified data source layer
export class GmailSource {
    constructor() {}

    private async getAccounts(): Promise<string[]> {
        return await ConfigManager.get<string[]>("services.google.accounts", []) || [];
    }

    async search(query: string, max: number = 20) {
        const accounts = await this.getAccounts();
        if (accounts.length === 0) {
            console.warn("⚠️ No Google accounts configured. Run `eva config set services.google.accounts '[\"me@gmail.com\"]'`");
            return [];
        }

        let allResults: any[] = [];
        for (const account of accounts) {
            console.log(`[Gmail] Scanning ${account}...`);
            try {
                const cmd = `gog gmail search '${query}' --account ${account} --max ${max} --json`;
                const proc = Bun.spawn(["bash", "-c", cmd], { stdout: "pipe", stderr: "inherit" });
                const text = await new Response(proc.stdout).text();
                
                if (!text.trim()) continue;
                
                let data: any;
                try {
                    data = JSON.parse(text);
                } catch (_e) {
                    continue;
                }

                let emails: any[] = [];
                if (Array.isArray(data)) {
                    emails = data;
                } else if (data && Array.isArray(data.threads)) {
                    emails = data.threads;
                }
                
                // Tag with account
                emails.forEach((e: any) => e._account = account);
                allResults.push(...emails);
            } catch (e) {
                console.error(`Error fetching from ${account}:`, e);
            }
        }
        return allResults;
    }
}
