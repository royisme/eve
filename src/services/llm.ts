import { AgentManager } from "../agents/manager";
import { TaskRouter } from "../agents/router";

export class LLMService {
    private agentManager: AgentManager | null = null;
    private router: TaskRouter | null = null;
    private initialized = false;

    async init() {
        if (this.initialized) return true;

        this.agentManager = new AgentManager();
        await this.agentManager.init();

        this.router = new TaskRouter();

        this.initialized = true;
        console.log("✅ LLM Service initialized with Agent Manager");
        return true;
    }

    private async ensureInitialized() {
        if (!this.initialized) {
            await this.init();
        }
    }

    async analyzeJob(description: string, resume?: string): Promise<string> {
        await this.ensureInitialized();

        const task = resume ? "analyze:job-fit" : "enrich:job-description";

        let context = `Job Description:\n${description.substring(0, 15000)}`;
        let instruction = `Analyze the following Job Description (JD) and provide a strategic summary.`;

        if (resume) {
            context += `\n\nCandidate Resume:\n${resume.substring(0, 15000)}`;
            instruction = `Analyze the fit between the Candidate Resume and the Job Description. Act as a strict Hiring Manager.`;
        }

        const prompt = `
${instruction}

${context}

Output Format (Markdown):
## 🎯 Fit Analysis
${resume ? `- **Match Score**: [0-100]` : ''}
- **Core Stack**: [List key technologies from JD]
- **Key Requirements**: [Top 3 must-haves]
${resume ? `- **Matching Skills**: [Skills from resume that match]` : ''}
${resume ? `- **Missing Skills**: [Critical gaps]` : ''}
- **Salary**: [Extract if present, else "Not specified"]
- **Red Flags**: [Any warning signs in JD?]
- **Strategy**: [Advice on tailoring the application]
`;

        try {
            const agentName = this.router!.route(task) || undefined;
            const response = await this.agentManager!.prompt(agentName, prompt);
            return response;
        } catch (e) {
            return `Analysis failed: ${e instanceof Error ? e.message : String(e)}`;
        }
    }

    async extractJobDetails(subject: string, snippet: string, sender: string): Promise<{ company: string, title: string, status: string }> {
        await this.ensureInitialized();

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
  "title": "string",
  "status": "string"
}
`;

        try {
            const agentName = this.router!.route("extract:job-details") || undefined;
            const response = await this.agentManager!.prompt(agentName, prompt);
            const json = JSON.parse(response.replace(/```json/g, '').replace(/```/g, '').trim());

            return {
                company: String(json.company || "Unknown"),
                title: String(json.title || "Unknown"),
                status: String(json.status || "New")
            };
        } catch (e) {
            console.error("LLM Extraction Failed:", e);
            return { company: "Unknown", title: "Unknown", status: "New" };
        }
    }
}
