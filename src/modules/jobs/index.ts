import { db } from "../../db";
import { jobs } from "../../db/schema";
import { getAdapter } from "./extractors";
import { eq, and } from "drizzle-orm";
import type { EmailData } from "./extractors/types";

export class JobModule {
    async handle(email: EmailData) {
        const subject = email.subject || "No Subject";
        const sender = email.from || "Unknown";
        const account = email._account;

        // Deduplicate
        const existing = await db.query.jobs.findFirst({
            where: and(
                eq(jobs.subject, subject),
                eq(jobs.sender, sender)
            )
        });

        if (existing) {
            return;
        }

        const adapter = getAdapter(sender, subject);
        // console.log(`[JobModule] Adapter ${adapter.name} processing: ${subject.substring(0,30)}...`);
        const opportunities = await adapter.extract(email);

        for (const opp of opportunities) {
            // Construct Link
            // Priority: 1. Extracted Direct Link (opp.applyUrl)
            //           2. Gmail Thread Link (fallback)
            let link = opp.applyUrl;
            if (!link && email.threadId) {
                // Gmail Web Link format: https://mail.google.com/mail/u/0/#inbox/{threadId}
                // Note: The 'u/0' might differ if user is logged into multiple accounts in browser,
                // but u/0 is a safe default for "default account".
                link = `https://mail.google.com/mail/u/0/#inbox/${email.threadId}`;
            }

            await db.insert(jobs).values({
                account: account || "Unknown",
                sender: sender,
                subject: subject,
                snippet: email.snippet || "",
                receivedAt: new Date().toISOString(),
                company: opp.company,
                role: opp.role,
                status: 'New',
                url: link,
                rawBody: opp.originalBody
            });
            console.log(`✅ [JobModule] Saved: ${opp.role} @ ${opp.company} (via ${adapter.name})`);
        }
    }
}
