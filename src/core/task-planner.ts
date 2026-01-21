import { IntentClassifier } from "./intent-classifier";
import type {
  IntentClassification,
  PlannedTask,
  TaskPlan,
  AggregationStrategy,
} from "./types/planning";
import { v4 as uuidv4 } from "uuid";

/**
 * Task Planner
 *
 * Generates task execution plans from user requests and intent classifications.
 * Handles task decomposition, dependency resolution, and aggregation strategy selection.
 */
export class TaskPlanner {
  private classifier: IntentClassifier;
  private templates: TaskTemplate[];

  constructor(options: TaskPlannerOptions = {}) {
    this.classifier = options.classifier ?? new IntentClassifier();
    this.templates = options.templates ?? getDefaultTemplates();
  }

  /**
   * Create a task plan from a user request
   */
  async plan(request: string): Promise<TaskPlan> {
    const intents = await this.classifier.classify(request);
    return this.createPlan(request, intents);
  }

  /**
   * Create a plan from pre-classified intents
   */
  createPlan(request: string, intents: IntentClassification[]): TaskPlan {
    const tasks = this.decompose(intents);
    const aggregationStrategy = this.selectAggregationStrategy(tasks);
    const executionMode = this.determineExecutionMode(tasks);

    return {
      id: `plan_${uuidv4()}`,
      originalRequest: request,
      intents,
      tasks,
      aggregationStrategy,
      executionMode,
      metadata: {
        confidence: this.calculateConfidence(intents),
        estimatedSteps: tasks.length,
        reasoning: this.generateReasoning(tasks),
      },
    };
  }

  /**
   * Decompose intents into a list of tasks with dependencies
   */
  private decompose(intents: IntentClassification[]): PlannedTask[] {
    const tasks: PlannedTask[] = [];
    const intentToTasks = new Map<string, PlannedTask[]>();
    let taskIndex = 0;

    for (const intent of intents) {
      const template = this.findTemplate(intent.tag);
      if (!template) {
        // Fallback for unknown intents
        const task = this.createFallbackTask(intent, taskIndex++);
        tasks.push(task);
        intentToTasks.set(intent.tag, [task]);
        continue;
      }

      const intentTasks = template.buildTasks(intent, taskIndex);
      taskIndex += intentTasks.length;

      for (const task of intentTasks) {
        tasks.push(task);
      }

      intentToTasks.set(intent.tag, intentTasks);
    }

    // Set up dependencies between tasks
    this.resolveDependencies(tasks, intents, intentToTasks);

    return tasks;
  }

  private createFallbackTask(intent: IntentClassification, index: number): PlannedTask {
    return {
      id: `task_${index}_${Date.now()}`,
      tag: intent.tag,
      dependsOn: [],
      parallelGroup: null,
      inputContextTypes: [],
      outputContextType: `output_${intent.tag.replace(":", "_")}`,
      description: `Fallback task for ${intent.tag}`,
    };
  }

  private findTemplate(tag: string): TaskTemplate | null {
    return this.templates.find((t) => t.tag === tag) ?? null;
  }

  private resolveDependencies(
    tasks: PlannedTask[],
    intents: IntentClassification[],
    intentToTasks: Map<string, PlannedTask[]>
  ): void {
    // Set up parallel groups for tasks of the same intent
    for (const [intent, taskList] of intentToTasks) {
      if (taskList.length > 1) {
        for (const task of taskList) {
          task.parallelGroup = `intent_${intent}`;
        }
      }
    }

    // Define cross-intent dependencies
    const dependencyRules: Record<string, string[]> = {
      "jobs:tailor": ["jobs:enrich", "jobs:analyze"],
      "jobs:analyze": ["jobs:enrich"],
      "jobs:enrich": ["jobs:search"],
      "jobs:prescore": ["jobs:search"],
    };

    for (const intent of intents) {
      const dependencies = dependencyRules[intent.tag];
      if (!dependencies) continue;

      const currentTasks = intentToTasks.get(intent.tag) ?? [];
      if (currentTasks.length === 0) continue;

      for (const dep of dependencies) {
        const depTasks = intentToTasks.get(dep);
        if (!depTasks || depTasks.length === 0) continue;

        // Make first task of current intent depend on last task of dependency
        const depTask = depTasks[depTasks.length - 1];
        currentTasks[0].dependsOn.push(depTask.id);
      }
    }
  }

  private selectAggregationStrategy(tasks: PlannedTask[]): AggregationStrategy {
    // Single task: pass through
    if (tasks.length === 1) {
      return "pass_through";
    }

    // Check if tasks form a linear chain
    const isChain = this.isLinearChain(tasks);
    if (isChain) {
      return "chain";
    }

    // Check if tasks can be merged (same output type)
    const outputTypes = new Set(tasks.map((t) => t.outputContextType));
    if (outputTypes.size === 1) {
      return "merge";
    }

    // Default to merge for most cases
    return "merge";
  }

  private isLinearChain(tasks: PlannedTask[]): boolean {
    if (tasks.length < 2) return true;

    // A strict linear chain: first task has no dependencies,
    // each subsequent task depends exactly on the immediately preceding task
    const taskById = new Map(tasks.map((t) => [t.id, t]));

    // First task must have no dependencies
    if (tasks[0].dependsOn.length > 0) return false;

    // Each subsequent task must depend exactly on the previous task
    for (let i = 1; i < tasks.length; i++) {
      const current = tasks[i];
      const previous = tasks[i - 1];

      if (current.dependsOn.length !== 1) return false;
      if (current.dependsOn[0] !== previous.id) return false;
    }

    return true;
  }

  private determineExecutionMode(tasks: PlannedTask[]): "sequential" | "dependency_aware" {
    // Use dependency-aware mode when there are actual dependencies
    for (const task of tasks) {
      if (task.dependsOn.length > 0) {
        return "dependency_aware";
      }
    }
    return "sequential";
  }

  private calculateConfidence(intents: IntentClassification[]): number {
    if (intents.length === 0) return 0;
    const sum = intents.reduce((acc, i) => acc + i.confidence, 0);
    return sum / intents.length;
  }

  private generateReasoning(tasks: PlannedTask[]): string {
    const groups = new Map<string, PlannedTask[]>();

    for (const task of tasks) {
      const baseTag = task.tag.split(":")[0];
      if (!groups.has(baseTag)) {
        groups.set(baseTag, []);
      }
      groups.get(baseTag)!.push(task);
    }

    const parts: string[] = [];
    for (const [domain, domainTasks] of groups) {
      parts.push(`${domain}: ${domainTasks.length} task(s)`);
    }

    return `Decomposed into ${tasks.length} task(s) across ${parts.join(", ")}`;
  }
}

interface TaskPlannerOptions {
  classifier?: IntentClassifier;
  templates?: TaskTemplate[];
}

/**
 * Task template for decomposing specific intents
 */
interface TaskTemplate {
  tag: string;
  buildTasks: (intent: IntentClassification, startIndex: number) => PlannedTask[];
}

function getDefaultTemplates(): TaskTemplate[] {
  return [
    {
      tag: "jobs:search",
      buildTasks: (intent, startIndex) => [
        {
          id: `task_${startIndex}_${Date.now()}`,
          tag: "jobs:search",
          dependsOn: [],
          parallelGroup: null,
          inputContextTypes: [],
          outputContextType: "job_search_results",
          description: "Search for job opportunities",
        },
      ],
    },
    {
      tag: "jobs:enrich",
      buildTasks: (intent, startIndex) => [
        {
          id: `task_${startIndex}_${Date.now()}`,
          tag: "jobs:enrich",
          dependsOn: [],
          parallelGroup: null,
          inputContextTypes: ["job_search_results"],
          outputContextType: "job_description",
          description: "Enrich job description with full details",
        },
      ],
    },
    {
      tag: "jobs:analyze",
      buildTasks: (intent, startIndex) => [
        {
          id: `task_${startIndex}_${Date.now()}`,
          tag: "jobs:analyze",
          dependsOn: [],
          parallelGroup: null,
          inputContextTypes: ["job_description", "resume"],
          outputContextType: "job_analysis",
          description: "Analyze job fit against resume",
        },
      ],
    },
    {
      tag: "jobs:tailor",
      buildTasks: (intent, startIndex) => [
        {
          id: `task_${startIndex}_${Date.now()}`,
          tag: "jobs:tailor",
          dependsOn: [],
          parallelGroup: null,
          inputContextTypes: ["job_description", "resume"],
          outputContextType: "tailored_resume",
          description: "Tailor resume for job",
        },
      ],
    },
    {
      tag: "jobs:prescore",
      buildTasks: (intent, startIndex) => [
        {
          id: `task_${startIndex}_${Date.now()}`,
          tag: "jobs:prescore",
          dependsOn: [],
          parallelGroup: null,
          inputContextTypes: ["job_search_results", "resume"],
          outputContextType: "job_prescore",
          description: "Quick compatibility check",
        },
      ],
    },
    {
      tag: "resume:get",
      buildTasks: (intent, startIndex) => [
        {
          id: `task_${startIndex}_${Date.now()}`,
          tag: "resume:get",
          dependsOn: [],
          parallelGroup: null,
          inputContextTypes: [],
          outputContextType: "resume",
          description: "Retrieve resume content",
        },
      ],
    },
    {
      tag: "generic:request",
      buildTasks: (intent, startIndex) => [
        {
          id: `task_${startIndex}_${Date.now()}`,
          tag: "generic:request",
          dependsOn: [],
          parallelGroup: null,
          inputContextTypes: [],
          outputContextType: "generic_output",
          description: "Handle generic request",
        },
      ],
    },
  ];
}
