import type { IntentClassification, IntentRule } from "./types/planning";

/**
 * Intent Classifier
 *
 * Classifies user requests into intent tags using LLM-first approach
 * with rule-based fallback for simple patterns.
 */
export class IntentClassifier {
  private rules: IntentRule[];
  private llm: LLMInterface;
  private minConfidence: number;

  constructor(options: IntentClassifierOptions = {}) {
    this.rules = options.rules ?? getDefaultRules();
    this.llm = options.llm ?? new DefaultLLM();
    this.minConfidence = options.minConfidence ?? 0.6;
  }

  /**
   * Classify a user request into intents
   */
  async classify(request: string): Promise<IntentClassification[]> {
    const llmResult = await this.classifyWithLLM(request);

    if (llmResult.length > 0 && llmResult[0].confidence >= this.minConfidence) {
      return llmResult;
    }

    const ruleResult = this.classifyWithRules(request);

    if (ruleResult.length > 0) {
      return ruleResult;
    }

    if (llmResult.length > 0) {
      return llmResult.map((r) => ({
        ...r,
        confidence: r.confidence * 0.8,
        reason: r.reason ?? "Below confidence threshold, using anyway",
      }));
    }

    return [
      {
        tag: "generic:request",
        confidence: 0.3,
        reason: "No classification possible, defaulting to generic",
      },
    ];
  }

  private async classifyWithLLM(request: string): Promise<IntentClassification[]> {
    try {
      const response = await this.llm.complete(this.buildLLMPrompt(request));
      return this.parseLLMResponse(response);
    } catch (error) {
      console.warn("[IntentClassifier] LLM classification failed:", error);
      return [];
    }
  }

  private classifyWithRules(request: string): IntentClassification[] {
    const normalized = request.toLowerCase();
    const results: IntentClassification[] = [];

    const sortedRules = [...this.rules].sort((a, b) => b.priority - a.priority);

    for (const rule of sortedRules) {
      if (this.matchesRule(normalized, rule)) {
        results.push({
          tag: rule.intentTag,
          confidence: 0.7,
          reason: `Matched pattern: ${rule.pattern}`,
        });

        if (rule.priority >= 100) {
          break;
        }
      }
    }

    return results;
  }

  private matchesRule(text: string, rule: IntentRule): boolean {
    if (rule.isRegex) {
      try {
        const regex = new RegExp(rule.pattern, "i");
        return regex.test(text);
      } catch {
        return false;
      }
    }
    return text.includes(rule.pattern.toLowerCase());
  }

  private buildLLMPrompt(request: string): string {
    return `You are an intent classifier for Eve, an AI personal assistant.

Analyze the following user request and identify the primary intents.

User request: "${request}"

Available intent tags:
- jobs:search - Looking for job opportunities
- jobs:enrich - Get more details about a job posting
- jobs:analyze - Analyze job fit against resume
- jobs:tailor - Tailor resume for a specific job
- jobs:prescore - Quick compatibility check
- resume:import - Import a new resume
- resume:get - Retrieve resume content
- resume:update - Update resume content
- email:sync - Sync email
- email:status - Check email status
- generic:request - General request that doesn't fit specific intents

Respond with a JSON array of intent classifications in this format:
[
  {"tag": "intent:tag", "confidence": 0.0-1.0, "reason": "brief explanation"}
]

Return only the JSON, no additional text.`;
  }

  private parseLLMResponse(response: string): IntentClassification[] {
    try {
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        throw new Error("No JSON array found in response");
      }

      const parsed = JSON.parse(jsonMatch[0]);
      if (!Array.isArray(parsed)) {
        throw new Error("Response is not an array");
      }

      return parsed.map((item) => ({
        tag: String(item.tag ?? "generic:request"),
        confidence: Math.max(0, Math.min(1, Number(item.confidence) ?? 0.5)),
        reason: String(item.reason ?? ""),
      }));
    } catch (error) {
      console.warn("[IntentClassifier] Failed to parse LLM response:", error);
      return [];
    }
  }
}

interface IntentClassifierOptions {
  rules?: IntentRule[];
  llm?: LLMInterface;
  minConfidence?: number;
}

interface LLMInterface {
  complete(prompt: string): Promise<string>;
}

class DefaultLLM implements LLMInterface {
  async complete(prompt: string): Promise<string> {
    throw new Error("No LLM configured");
  }
}

function getDefaultRules(): IntentRule[] {
  return [
    { pattern: "find job", intentTag: "jobs:search", priority: 100 },
    { pattern: "search job", intentTag: "jobs:search", priority: 100 },
    { pattern: "look for job", intentTag: "jobs:search", priority: 100 },
    { pattern: "job description", intentTag: "jobs:enrich", priority: 100 },
    { pattern: "more details about", intentTag: "jobs:enrich", priority: 90 },
    { pattern: "analyze job", intentTag: "jobs:analyze", priority: 100 },
    { pattern: "job fit", intentTag: "jobs:analyze", priority: 100 },
    { pattern: "tailor resume", intentTag: "jobs:tailor", priority: 100 },
    { pattern: "customize resume", intentTag: "jobs:tailor", priority: 100 },
    { pattern: "quick check", intentTag: "jobs:prescore", priority: 100 },
    { pattern: "compatibility", intentTag: "jobs:prescore", priority: 90 },
    { pattern: "import resume", intentTag: "resume:import", priority: 100 },
    { pattern: "add resume", intentTag: "resume:import", priority: 90 },
    { pattern: "get resume", intentTag: "resume:get", priority: 100 },
    { pattern: "show resume", intentTag: "resume:get", priority: 90 },
    { pattern: "update resume", intentTag: "resume:update", priority: 100 },
    { pattern: "edit resume", intentTag: "resume:update", priority: 90 },
    { pattern: "sync email", intentTag: "email:sync", priority: 100 },
    { pattern: "check email", intentTag: "email:status", priority: 100 },
  ];
}
