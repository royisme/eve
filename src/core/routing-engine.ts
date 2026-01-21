import type { RoutingRule, EveConfig } from "./config-schema";
import type { AgentRoom } from "./agent-room";
import type { AgentRegistry } from "./agent-registry";
import { ConfigReader } from "./config-reader";

/**
 * RoutingResult
 *
 * The result of a routing lookup.
 */
export interface RoutingResult {
  /** The agent ID to handle the task, or "eve" for direct handling */
  agentId: string;
  /** The matched pattern (if any) */
  matchedPattern?: string;
  /** The source of the match (tasks, capabilities, keywords, responsibility, fallback) */
  source: "tasks" | "capabilities" | "keywords" | "responsibility" | "fallback";
  /** Priority of the matched rule */
  priority: number;
}

/**
 * RoutingEngine
 *
 * Routes task tags to agents based on priority rules from eve.json.
 *
 * Routing Order:
 * 1. Explicit task routes (routing.tasks)
 * 2. Capability routes (routing.capabilities)
 * 3. Agent responsibilities (from agent.json)
 * 4. Keyword heuristics (routing.keywords)
 * 5. Eve fallback
 *
 * Conflict Resolution:
 * - Higher priority value wins
 * - If same priority, log warning and fall back to Eve
 */
export class RoutingEngine {
  private agentRegistry: AgentRegistry | null = null;

  /**
   * Set the agent registry for responsibility-based routing.
   */
  setAgentRegistry(registry: AgentRegistry): void {
    this.agentRegistry = registry;
  }

  /**
   * Route a task tag to an agent.
   *
   * @param taskTag - The task tag in `module:task` format (e.g., "jobs:analyze")
   * @param text - Optional text for keyword matching
   * @returns RoutingResult with the target agent and match details
   */
  route(taskTag: string, text?: string): RoutingResult {
    const config = ConfigReader.get();
    const routing = config.routing;

    // 1. Try explicit task routes
    const taskMatch = this.matchRules(taskTag, routing.tasks);
    if (taskMatch) {
      return taskMatch;
    }

    // 2. Try capability routes
    if (routing.capabilities && routing.capabilities.length > 0) {
      const capMatch = this.matchRules(taskTag, routing.capabilities, "capabilities");
      if (capMatch) {
        return capMatch;
      }
    }

    // 3. Try agent responsibilities (if registry is available)
    if (this.agentRegistry) {
      const responsibilityMatch = this.matchResponsibilities(taskTag);
      if (responsibilityMatch) {
        return responsibilityMatch;
      }
    }

    // 4. Try keyword routes (if text provided)
    if (text && routing.keywords && routing.keywords.length > 0) {
      const keywordMatch = this.matchKeywords(text, routing.keywords);
      if (keywordMatch) {
        return keywordMatch;
      }
    }

    // 5. Fallback to Eve
    return {
      agentId: "eve",
      source: "fallback",
      priority: 0,
    };
  }

  /**
   * Route multiple task tags and return the highest-priority match.
   *
   * @param taskTags - Array of task tags
   * @param text - Optional text for keyword matching
   * @returns RoutingResult with the best match
   */
  routeMultiple(taskTags: string[], text?: string): RoutingResult {
    if (taskTags.length === 0) {
      return {
        agentId: "eve",
        source: "fallback",
        priority: 0,
      };
    }

    const results = taskTags.map((tag) => this.route(tag, text));

    // Sort by priority descending, pick the highest
    results.sort((a, b) => b.priority - a.priority);

    // Check for conflicts (multiple matches at same priority)
    const topPriority = results[0].priority;
    const topMatches = results.filter((r) => r.priority === topPriority);

    if (topMatches.length > 1) {
      const uniqueAgents = new Set(topMatches.map((r) => r.agentId));
      if (uniqueAgents.size > 1) {
        console.warn(
          `[RoutingEngine] Conflict: ${topMatches.length} routes at priority ${topPriority}: ` +
            topMatches.map((r) => `${r.agentId} (${r.matchedPattern})`).join(", ") +
            ". Falling back to Eve."
        );
        return {
          agentId: "eve",
          source: "fallback",
          priority: 0,
        };
      }
    }

    return results[0];
  }

  /**
   * Match a task tag against routing rules.
   */
  private matchRules(
    taskTag: string,
    rules: RoutingRule[],
    source: "tasks" | "capabilities" = "tasks"
  ): RoutingResult | null {
    const matches: Array<RoutingRule & { source: "tasks" | "capabilities" }> = [];

    for (const rule of rules) {
      if (this.patternMatches(rule.pattern, taskTag)) {
        matches.push({ ...rule, source });
      }
    }

    if (matches.length === 0) {
      return null;
    }

    // Sort by priority descending
    matches.sort((a, b) => b.priority - a.priority);

    // Check for conflicts
    const topPriority = matches[0].priority;
    const topMatches = matches.filter((m) => m.priority === topPriority);

    if (topMatches.length > 1) {
      const uniqueAgents = new Set(topMatches.map((m) => m.agent));
      if (uniqueAgents.size > 1) {
        console.warn(
          `[RoutingEngine] Conflict: ${topMatches.length} ${source} rules at priority ${topPriority}: ` +
            topMatches.map((m) => `${m.agent} (${m.pattern})`).join(", ") +
            ". Falling back to Eve."
        );
        return null;
      }
    }

    const best = matches[0];
    return {
      agentId: best.agent,
      matchedPattern: best.pattern,
      source: best.source,
      priority: best.priority,
    };
  }

  /**
   * Match agent responsibilities.
   */
  private matchResponsibilities(taskTag: string): RoutingResult | null {
    if (!this.agentRegistry) {
      return null;
    }

    const matchingAgents: Array<{ agent: AgentRoom; priority: number }> = [];

    for (const agent of this.agentRegistry.getAllAgents()) {
      if (agent.hasResponsibility(taskTag)) {
        // Responsibilities have a base priority of 50 (between tasks/capabilities and keywords)
        matchingAgents.push({ agent, priority: 50 });
      }
    }

    if (matchingAgents.length === 0) {
      return null;
    }

    if (matchingAgents.length > 1) {
      console.warn(
        `[RoutingEngine] Multiple agents claim responsibility for "${taskTag}": ` +
          matchingAgents.map((m) => m.agent.id).join(", ") +
          ". Using first match."
      );
    }

    const best = matchingAgents[0];
    return {
      agentId: best.agent.id,
      matchedPattern: taskTag,
      source: "responsibility",
      priority: best.priority,
    };
  }

  /**
   * Match text against keyword patterns (regex).
   */
  private matchKeywords(text: string, rules: RoutingRule[]): RoutingResult | null {
    const matches: RoutingRule[] = [];

    for (const rule of rules) {
      try {
        const regex = new RegExp(rule.pattern, "i");
        if (regex.test(text)) {
          matches.push(rule);
        }
      } catch {
        console.warn(`[RoutingEngine] Invalid keyword regex pattern: ${rule.pattern}`);
      }
    }

    if (matches.length === 0) {
      return null;
    }

    // Sort by priority descending
    matches.sort((a, b) => b.priority - a.priority);

    // Check for conflicts
    const topPriority = matches[0].priority;
    const topMatches = matches.filter((m) => m.priority === topPriority);

    if (topMatches.length > 1) {
      const uniqueAgents = new Set(topMatches.map((m) => m.agent));
      if (uniqueAgents.size > 1) {
        console.warn(
          `[RoutingEngine] Conflict: ${topMatches.length} keyword rules at priority ${topPriority}: ` +
            topMatches.map((m) => `${m.agent} (${m.pattern})`).join(", ") +
            ". Falling back to Eve."
        );
        return null;
      }
    }

    const best = matches[0];
    return {
      agentId: best.agent,
      matchedPattern: best.pattern,
      source: "keywords",
      priority: best.priority,
    };
  }

  /**
   * Check if a pattern matches a task tag.
   * Supports glob patterns with * wildcard.
   *
   * Examples:
   * - "jobs:*" matches "jobs:analyze", "jobs:search"
   * - "jobs:analyze" matches only "jobs:analyze"
   * - "*" matches everything
   */
  private patternMatches(pattern: string, taskTag: string): boolean {
    if (pattern === "*") {
      return true;
    }

    if (pattern.endsWith("*")) {
      const prefix = pattern.slice(0, -1);
      return taskTag.startsWith(prefix);
    }

    return pattern === taskTag;
  }

  /**
   * Get all routes from config (for debugging/inspection).
   */
  getRoutes(): {
    tasks: RoutingRule[];
    capabilities: RoutingRule[];
    keywords: RoutingRule[];
  } {
    const routing = ConfigReader.get().routing;
    return {
      tasks: routing.tasks || [],
      capabilities: routing.capabilities || [],
      keywords: routing.keywords || [],
    };
  }

  /**
   * Validate routing configuration.
   * Returns a list of warnings/errors.
   */
  validateRoutes(): string[] {
    const warnings: string[] = [];
    const routing = ConfigReader.get().routing;

    // Check for duplicate patterns at same priority
    const checkDuplicates = (rules: RoutingRule[], source: string) => {
      const seen = new Map<string, RoutingRule>();
      for (const rule of rules) {
        const key = `${rule.pattern}:${rule.priority}`;
        const existing = seen.get(key);
        if (existing && existing.agent !== rule.agent) {
          warnings.push(
            `[${source}] Duplicate pattern "${rule.pattern}" at priority ${rule.priority} ` +
              `maps to both "${existing.agent}" and "${rule.agent}"`
          );
        }
        seen.set(key, rule);
      }
    };

    checkDuplicates(routing.tasks, "tasks");
    if (routing.capabilities) {
      checkDuplicates(routing.capabilities, "capabilities");
    }
    if (routing.keywords) {
      checkDuplicates(routing.keywords, "keywords");

      // Validate regex patterns
      for (const rule of routing.keywords) {
        try {
          new RegExp(rule.pattern);
        } catch {
          warnings.push(`[keywords] Invalid regex pattern: "${rule.pattern}"`);
        }
      }
    }

    // Check if referenced agents exist (if registry is available)
    if (this.agentRegistry) {
      const allRules = [
        ...routing.tasks,
        ...(routing.capabilities || []),
        ...(routing.keywords || []),
      ];
      for (const rule of allRules) {
        if (rule.agent !== "eve" && !this.agentRegistry.hasAgent(rule.agent)) {
          warnings.push(
            `Route references non-existent agent "${rule.agent}": pattern "${rule.pattern}"`
          );
        }
      }
    }

    return warnings;
  }
}
