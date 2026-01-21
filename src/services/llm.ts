import { getEveService, type EveService } from "../core/eve-service";

export class LLMService {
  private eveService: EveService;
  private initialized = false;

  constructor() {
    this.eveService = getEveService();
  }

  async init(): Promise<boolean> {
    if (this.initialized) return true;

    await this.eveService.init();

    this.initialized = true;
    console.log("✅ LLM Service initialized (delegating to EveService)");
    return true;
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.init();
    }
  }

  async analyzeJob(description: string, resume?: string): Promise<string> {
    await this.ensureInitialized();
    return this.eveService.analyzeJob(description, resume);
  }

  async extractJobDetails(
    subject: string,
    snippet: string,
    sender: string
  ): Promise<{ company: string; title: string; status: string }> {
    await this.ensureInitialized();
    return this.eveService.extractJobDetails(subject, snippet, sender);
  }

  async tailorResume(
    jobDescription: string,
    resumeContent: string
  ): Promise<string> {
    await this.ensureInitialized();
    return this.eveService.tailorResume(jobDescription, resumeContent);
  }
}
