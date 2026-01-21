/**
 * EveService - Unified service layer for Eve AI operations
 *
 * This service wraps EveOrchestrator and provides backward-compatible
 * methods for Jobs capability (analyzeJob, extractJobDetails, tailorResume).
 *
 * Key responsibilities:
 * - Initialize orchestrator with agent discovery
 * - Route tasks via task tags (e.g., "jobs:analyze", "jobs:extract")
 * - Provide backward-compatible API for existing callers
 */

import { EveOrchestrator, type OrchestratorRequest, type OrchestratorResponse } from "./orchestrator";
import { ConfigReader } from "./config-reader";
import { initializeCapabilities } from "./agent";

export class EveService {
  private orchestrator: EveOrchestrator | null = null;
  private initialized = false;

  async init(): Promise<boolean> {
    if (this.initialized) return true;

    // 1. Load config (ensures providers/models are available)
    ConfigReader.load();

    // 2. Initialize capabilities (so tools are available for agents)
    await initializeCapabilities();

    // 3. Create and initialize orchestrator
    this.orchestrator = new EveOrchestrator();
    this.orchestrator.init();

    this.initialized = true;
    console.log("✅ EveService initialized with Orchestrator");
    return true;
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.init();
    }
  }

  /**
   * Low-level dispatch method - routes task to appropriate agent
   */
  async dispatch(request: OrchestratorRequest): Promise<OrchestratorResponse> {
    await this.ensureInitialized();
    return this.orchestrator!.handle(request);
  }

  /**
   * Simple prompt method - sends text to Eve directly
   */
  async prompt(text: string): Promise<string> {
    await this.ensureInitialized();

    const response = await this.orchestrator!.handle({
      text,
      taskTags: ["generic:prompt"],
    });

    return this.extractTextOutput(response);
  }

  /**
   * Analyze a job description with optional resume for fit analysis
   * Task tag: "jobs:analyze" or "jobs:enrich"
   */
  async analyzeJob(description: string, resume?: string): Promise<string> {
    await this.ensureInitialized();

    const taskTag = resume ? "jobs:analyze" : "jobs:enrich";

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
${resume ? `- **Match Score**: [0-100]` : ""}
- **Core Stack**: [List key technologies from JD]
- **Key Requirements**: [Top 3 must-haves]
${resume ? `- **Matching Skills**: [Skills from resume that match]` : ""}
${resume ? `- **Missing Skills**: [Critical gaps]` : ""}
- **Salary**: [Extract if present, else "Not specified"]
- **Red Flags**: [Any warning signs in JD?]
- **Strategy**: [Advice on tailoring the application]
`;

    try {
      const response = await this.orchestrator!.handle({
        text: prompt,
        taskTags: [taskTag],
        payload: { description, resume },
      });

      return this.extractTextOutput(response);
    } catch (e) {
      return `Analysis failed: ${e instanceof Error ? e.message : String(e)}`;
    }
  }

  /**
   * Extract job details from email metadata
   * Task tag: "jobs:extract"
   */
  async extractJobDetails(
    subject: string,
    snippet: string,
    sender: string
  ): Promise<{ company: string; title: string; status: string }> {
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
      const response = await this.orchestrator!.handle({
        text: prompt,
        taskTags: ["jobs:extract"],
        payload: { subject, snippet, sender },
      });

      const output = this.extractTextOutput(response);
      const json = JSON.parse(
        output.replace(/```json/g, "").replace(/```/g, "").trim()
      );

      return {
        company: String(json.company || "Unknown"),
        title: String(json.title || "Unknown"),
        status: String(json.status || "New"),
      };
    } catch (e) {
      console.error("LLM Extraction Failed:", e);
      return { company: "Unknown", title: "Unknown", status: "New" };
    }
  }

  /**
   * Tailor a resume for a specific job posting
   * Task tag: "jobs:tailor"
   */
  async tailorResume(
    jobDescription: string,
    resumeContent: string
  ): Promise<string> {
    await this.ensureInitialized();

    const prompt = `You are an expert resume writer. Tailor the following resume to match the job posting below.

**Job Posting:**
${jobDescription}

**Original Resume:**
${resumeContent}

**Instructions:**
1. Emphasize relevant skills and experiences
2. Reorder bullet points to highlight job alignment
3. Adjust keywords to match job description
4. Keep the structure and format intact
5. DO NOT fabricate experiences

**Output Format (JSON only):**
{
  "content": "The tailored resume in markdown",
  "suggestions": ["3-5 improvement suggestions"]
}`;

    try {
      const response = await this.orchestrator!.handle({
        text: prompt,
        taskTags: ["jobs:tailor"],
        payload: { jobDescription, resumeContent },
      });

      return this.extractTextOutput(response);
    } catch (e) {
      console.error("Resume tailoring failed:", e);
      throw e;
    }
  }

  /**
   * Extract text output from orchestrator response
   */
  private extractTextOutput(response: OrchestratorResponse): string {
    if (response.results.length === 1) {
      const result = response.results[0];
      if (result.error) {
        throw new Error(result.error.message);
      }
      return String(result.output ?? "");
    }

    const outputs = response.results
      .filter((r) => !r.error && r.output)
      .map((r) => String(r.output));

    return outputs.join("\n\n");
  }
}

let eveServiceInstance: EveService | null = null;

export function getEveService(): EveService {
  if (!eveServiceInstance) {
    eveServiceInstance = new EveService();
  }
  return eveServiceInstance;
}
