import { ConfigManager } from "./config";
import { db } from "./db";
import { jobs } from "./db/schema";
import { eq } from "drizzle-orm";

// The unified data source layer
export class GmailSource {
  constructor() {}

  private async getAccounts(): Promise<string[]> {
    return (
      (await ConfigManager.get<string[]>("services.google.accounts", [])) || []
    );
  }

  async search(query: string, max: number = 20) {
    const accounts = await this.getAccounts();
    if (accounts.length === 0) {
      console.warn(
        "⚠️ No Google accounts configured. Run `eve config set services.google.accounts '[\"me@gmail.com\"]'`",
      );
      return [];
    }

    let allResults: any[] = [];
    for (const account of accounts) {
      console.log(`[Gmail] Scanning ${account}...`);
      try {
        // 1. Search for threads (Revert to bash -c for reliable query parsing)
        // gog gmail search 'query' --account ...
        const searchCmd = `gog gmail search '${query}' --account ${account} --max ${max} --json`;
        const searchProc = Bun.spawn(["bash", "-c", searchCmd], {
          stdout: "pipe",
          stderr: "inherit",
        });
        const searchText = await new Response(searchProc.stdout).text();

        if (!searchText.trim()) continue;

        let searchData: any;
        try {
          searchData = JSON.parse(searchText);
        } catch {
          continue;
        }

        let threads: any[] = [];
        if (Array.isArray(searchData)) {
          threads = searchData;
        } else if (searchData && Array.isArray(searchData.threads)) {
          threads = searchData.threads;
        }
        console.log(`[Gmail] ${account}: Found ${threads.length} threads.`);

        // 2. Fetch full content for each thread
        for (const thread of threads) {
          // Pre-Fetch Deduplication
          const existing = await db
            .select({ id: jobs.id })
            .from(jobs)
            .where(eq(jobs.threadId, thread.id))
            .get();
          if (existing) {
            // console.log(`⏩ Skipping known thread ${thread.id}`);
            continue;
          }

          try {
            // Use direct spawn for get to avoid id quoting issues
            const getProc = Bun.spawn(
              [
                "gog",
                "gmail",
                "thread",
                "get",
                thread.id,
                "--account",
                account,
                "--json",
              ],
              { stdout: "pipe", stderr: "inherit" },
            );
            const getText = await new Response(getProc.stdout).text();

            if (!getText.trim()) {
              console.error(`Empty response for thread ${thread.id}`);
              continue;
            }

            let threadDetails;
            try {
              threadDetails = JSON.parse(getText);
            } catch {
              console.error(
                `Failed to parse thread ${thread.id}: ${getText.substring(0, 100)}...`,
              );
              continue;
            }

            if (
              !threadDetails.messages &&
              (!threadDetails.thread || !threadDetails.thread.messages)
            ) {
              console.warn(
                `⚠️ Thread ${thread.id} has no messages. Response keys: ${Object.keys(threadDetails)}`,
              );
              continue;
            }

            const messages =
              (threadDetails.thread && threadDetails.thread.messages) ||
              threadDetails.messages ||
              [];
            console.log(
              `[Gmail] Thread ${thread.id}: Found ${messages.length} msgs.`,
            );

            // Process each message in thread
            for (const message of messages) {
              // Decode Body (Robust Recursive Strategy)
              let body = "";
              // ... existing decoding logic ... (I need to copy it or reuse function)
              // To avoid code duplication and complexity in edit, I'll paste the decoding logic again inside the loop

              const findHtmlBody = (part: any): string | null => {
                if (
                  part.mimeType === "text/html" &&
                  part.body &&
                  part.body.data
                ) {
                  return Buffer.from(part.body.data, "base64url").toString(
                    "utf-8",
                  );
                }
                if (part.parts) {
                  for (const subPart of part.parts) {
                    const found = findHtmlBody(subPart);
                    if (found) return found;
                  }
                }
                return null;
              };

              const findTextBody = (part: any): string | null => {
                if (
                  part.mimeType === "text/plain" &&
                  part.body &&
                  part.body.data
                ) {
                  return Buffer.from(part.body.data, "base64url").toString(
                    "utf-8",
                  );
                }
                if (part.parts) {
                  for (const subPart of part.parts) {
                    const found = findTextBody(subPart);
                    if (found) return found;
                  }
                }
                return null;
              };

              if (message.payload) {
                body =
                  findHtmlBody(message.payload) ||
                  findTextBody(message.payload) ||
                  "";
                if (
                  !body &&
                  message.payload.body &&
                  message.payload.body.data
                ) {
                  body = Buffer.from(
                    message.payload.body.data,
                    "base64url",
                  ).toString("utf-8");
                }
              }

              // normalize
              const emailData = {
                id: message.id || thread.id,
                threadId: message.threadId || thread.id,
                subject:
                  message.payload?.headers?.find(
                    (h: any) => h.name === "Subject",
                  )?.value ||
                  thread.subject ||
                  "",
                from:
                  message.payload?.headers?.find((h: any) => h.name === "From")
                    ?.value ||
                  thread.from ||
                  "",
                snippet: message.snippet || thread.snippet || "",
                body: body,
                _account: account,
              };

              allResults.push(emailData);
            }
          } catch (e) {
            console.error(`Error fetching thread ${thread.id}:`, e);
          }
        }
      } catch (e) {
        console.error(`Error searching ${account}:`, e);
      }
    }
    return allResults;
  }
}
