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
            await db.insert(jobs).values({
                account: account || "Unknown",
                sender: sender,
                subject: subject,
                snippet: email.snippet || "",
                receivedAt: new Date().toISOString(),
                company: opp.company,
                role: opp.role,
                status: 'New',
                rawBody: opp.originalBody
            });
            console.log(`✅ [JobModule] Saved: ${opp.role} @ ${opp.company} (via ${adapter.name})`);
        }
    }
}
