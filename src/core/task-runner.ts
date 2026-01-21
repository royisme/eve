import type { PlannedTask, TaskExecutionResult, TaskPlan } from "./types/planning";

/**
 * Plan Task Runner
 *
 * Executes task plans with dependency-aware scheduling.
 * Supports topological ordering and parallel execution of independent tasks.
 */
export class PlanTaskRunner {
  private executor: TaskExecutor;

  constructor(options: PlanTaskRunnerOptions = {}) {
    this.executor = options.executor ?? new DefaultTaskExecutor();
  }

  /**
   * Execute a task plan and return results
   */
  async run(plan: TaskPlan, inputContextIds?: string[]): Promise<TaskExecutionResult[]> {
    if (plan.tasks.length === 0) {
      return [];
    }

    if (plan.executionMode === "sequential") {
      return this.runSequential(plan, inputContextIds);
    }

    return this.runDependencyAware(plan, inputContextIds);
  }

  private async runSequential(
    plan: TaskPlan,
    inputContextIds?: string[]
  ): Promise<TaskExecutionResult[]> {
    const results: TaskExecutionResult[] = [];
    const contextIds = new Map<string, string[]>();

    if (inputContextIds) {
      for (const id of inputContextIds) {
        contextIds.set("input", [id]);
      }
    }

    for (const task of plan.tasks) {
      const inputIds = this.getInputContextIds(task, contextIds);
      const result = await this.executeTask(task, inputIds);
      results.push(result);

      if (result.outputContextId) {
        contextIds.set(task.outputContextType, [result.outputContextId]);
      }
    }

    return results;
  }

  private async runDependencyAware(
    plan: TaskPlan,
    inputContextIds?: string[]
  ): Promise<TaskExecutionResult[]> {
    const results: TaskExecutionResult[] = [];
    const contextIds = new Map<string, string[]>();
    const taskResults = new Map<string, TaskExecutionResult>();
    const readyTasks = new Set<string>();
    const pendingDependencies = new Map<string, Set<string>>();
    const taskMap = new Map<string, PlannedTask>();

    if (inputContextIds) {
      for (const id of inputContextIds) {
        contextIds.set("input", [id]);
      }
    }

    for (const task of plan.tasks) {
      taskMap.set(task.id, task);
      pendingDependencies.set(task.id, new Set(task.dependsOn));

      if (task.dependsOn.length === 0) {
        readyTasks.add(task.id);
      }
    }

    while (readyTasks.size > 0) {
      const parallelGroups = this.groupByParallelGroup(
        Array.from(readyTasks).map((id) => taskMap.get(id)!)
      );

      for (const group of parallelGroups) {
        const groupResults = await Promise.all(
          group.map((task) => this.executeTask(task, this.getInputContextIds(task, contextIds)))
        );

        for (const result of groupResults) {
          taskResults.set(result.taskId, result);
          results.push(result);

          if (result.outputContextId) {
            contextIds.set(result.tag.replace(":", "_") + "_output", [result.outputContextId]);
          }
        }

        for (const task of group) {
          readyTasks.delete(task.id);

          for (const [, dependentTask] of taskMap) {
            if (dependentTask.dependsOn.includes(task.id)) {
              const deps = pendingDependencies.get(dependentTask.id)!;
              deps.delete(task.id);

              if (deps.size === 0) {
                readyTasks.add(dependentTask.id);
              }
            }
          }
        }
      }
    }

    return results;
  }

  private groupByParallelGroup(tasks: PlannedTask[]): PlannedTask[][] {
    const groups = new Map<string, PlannedTask[]>();
    const noGroup: PlannedTask[] = [];

    for (const task of tasks) {
      if (task.parallelGroup === null) {
        noGroup.push(task);
      } else {
        if (!groups.has(task.parallelGroup)) {
          groups.set(task.parallelGroup, []);
        }
        groups.get(task.parallelGroup)!.push(task);
      }
    }

    return [...groups.values(), ...(noGroup.length > 0 ? [noGroup] : [])];
  }

  private getInputContextIds(task: PlannedTask, contextIds: Map<string, string[]>): string[] {
    const inputIds: string[] = [];

    for (const type of task.inputContextTypes) {
      const ids = contextIds.get(type);
      if (ids) {
        inputIds.push(...ids);
      }
    }

    return inputIds;
  }

  private async executeTask(
    task: PlannedTask,
    inputContextIds: string[]
  ): Promise<TaskExecutionResult> {
    const startTime = Date.now();

    try {
      const output = await this.executor.execute({
        taskId: task.id,
        tag: task.tag,
        payload: task.payload,
        contextIds: inputContextIds,
      });

      return {
        taskId: task.id,
        tag: task.tag,
        status: "success",
        output,
        outputContextId: typeof output === "object" && output !== null
          ? (output as { contextId?: string }).contextId as string | undefined
          : undefined,
        durationMs: Date.now() - startTime,
        executedAt: new Date().toISOString(),
      };
    } catch (error) {
      return {
        taskId: task.id,
        tag: task.tag,
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - startTime,
        executedAt: new Date().toISOString(),
      };
    }
  }
}

interface PlanTaskRunnerOptions {
  executor?: TaskExecutor;
}

interface TaskExecutor {
  execute(request: TaskExecutionRequest): Promise<unknown>;
}

interface TaskExecutionRequest {
  taskId: string;
  tag: string;
  payload?: Record<string, unknown>;
  contextIds: string[];
}

class DefaultTaskExecutor implements TaskExecutor {
  async execute(request: TaskExecutionRequest): Promise<unknown> {
    throw new Error(`No executor configured for task: ${request.tag}`);
  }
}

// Re-export for backward compatibility
export { PlanTaskRunner as TaskRunner };
export type { PlanTaskRunnerOptions as TaskRunnerOptions };
