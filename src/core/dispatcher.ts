import { JobModule } from "../modules/jobs";

const jobModule = new JobModule();

export class Dispatcher {
    async dispatch(email: any) {
        const subject = (email.subject || "").toLowerCase();
        const sender = (email.from || "").toLowerCase();
        const snippet = (email.snippet || "").toLowerCase();

        // 1. Check Job Module
        if (this.isJobRelated(subject, sender, snippet)) {
            // console.log(`[Router] Routing to JobModule: ${email.subject}`);
            await jobModule.handle(email);
            return;
        }
        
        // console.log(`[Router] No module matched for: ${email.subject}`);
    }

    private isJobRelated(subject: string, sender: string, snippet: string): boolean {
        const keywords = ["apply", "application", "interview", "offer", "resume", "job", "hiring", "career", "role"];
        const platforms = ["linkedin", "indeed", "glassdoor", "wellfound", "lever", "greenhouse"];
        
        const combined = `${subject} ${sender} ${snippet}`;
        
        const hasKeyword = keywords.some(k => combined.includes(k));
        const isPlatform = platforms.some(p => sender.includes(p));

        return hasKeyword || isPlatform;
    }
}
