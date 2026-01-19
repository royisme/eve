import type { AgentTool } from "@mariozechner/pi-agent-core";

export type TaskStatus = "pending" | "running" | "completed" | "failed" | "cancelled";

export interface TaskProgress {
  taskId: string;
  status: TaskStatus;
  progress?: number;
  message?: string;
  result?: unknown;
  error?: Error;
}

export type TaskProgressCallback = (progress: TaskProgress) => void;

interface Task {
  id: string;
  name: string;
  status: TaskStatus;
  progress: number;
  message: string;
  abortController: AbortController;
  startTime: number;
  endTime?: number;
  result?: unknown;
  error?: Error;
}

type TaskListener = (tasks: Task[]) => void;

class TaskRunnerImpl {
  private tasks: Map<string, Task> = new Map();
  private listeners: Set<TaskListener> = new Set();
  private taskCounter = 0;

  subscribe(listener: TaskListener): () => void {
    this.listeners.add(listener);
    listener(this.getAllTasks());
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    const tasks = this.getAllTasks();
    for (const listener of this.listeners) {
      listener(tasks);
    }
  }

  getAllTasks(): Task[] {
    return Array.from(this.tasks.values());
  }

  getTask(taskId: string): Task | undefined {
    return this.tasks.get(taskId);
  }

  getRunningTasks(): Task[] {
    return this.getAllTasks().filter(t => t.status === "running");
  }

  async runTool<T>(
    tool: AgentTool<any, any>,
    params: Record<string, unknown>,
    options?: { name?: string; onProgress?: TaskProgressCallback }
  ): Promise<T> {
    const taskId = `task_${++this.taskCounter}_${Date.now()}`;
    const taskName = options?.name || tool.name;
    const abortController = new AbortController();

    const task: Task = {
      id: taskId,
      name: taskName,
      status: "pending",
      progress: 0,
      message: "Starting...",
      abortController,
      startTime: Date.now(),
    };

    this.tasks.set(taskId, task);
    this.updateTask(taskId, { status: "running" });

    try {
      const result = await tool.execute(
        taskId,
        params,
        abortController.signal,
        (update) => {
          const message = update.content?.[0]?.type === "text" 
            ? (update.content[0] as { text: string }).text 
            : "Processing...";
          this.updateTask(taskId, { message });
          options?.onProgress?.({
            taskId,
            status: "running",
            message,
          });
        }
      );

      this.updateTask(taskId, {
        status: "completed",
        progress: 100,
        message: "Done",
        result,
      });

      options?.onProgress?.({
        taskId,
        status: "completed",
        result,
      });

      return result as T;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      const isCancelled = abortController.signal.aborted;

      this.updateTask(taskId, {
        status: isCancelled ? "cancelled" : "failed",
        message: isCancelled ? "Cancelled" : err.message,
        error: err,
      });

      options?.onProgress?.({
        taskId,
        status: isCancelled ? "cancelled" : "failed",
        error: err,
      });

      throw error;
    }
  }

  async run<T>(
    name: string,
    fn: (signal: AbortSignal, updateProgress: (msg: string, pct?: number) => void) => Promise<T>,
    options?: { onProgress?: TaskProgressCallback }
  ): Promise<T> {
    const taskId = `task_${++this.taskCounter}_${Date.now()}`;
    const abortController = new AbortController();

    const task: Task = {
      id: taskId,
      name,
      status: "pending",
      progress: 0,
      message: "Starting...",
      abortController,
      startTime: Date.now(),
    };

    this.tasks.set(taskId, task);
    this.updateTask(taskId, { status: "running" });

    const updateProgress = (message: string, progress?: number) => {
      this.updateTask(taskId, { message, progress: progress ?? task.progress });
      options?.onProgress?.({
        taskId,
        status: "running",
        message,
        progress,
      });
    };

    try {
      const result = await fn(abortController.signal, updateProgress);

      this.updateTask(taskId, {
        status: "completed",
        progress: 100,
        message: "Done",
        result,
      });

      options?.onProgress?.({
        taskId,
        status: "completed",
        result,
      });

      return result;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      const isCancelled = abortController.signal.aborted;

      this.updateTask(taskId, {
        status: isCancelled ? "cancelled" : "failed",
        message: isCancelled ? "Cancelled" : err.message,
        error: err,
      });

      options?.onProgress?.({
        taskId,
        status: isCancelled ? "cancelled" : "failed",
        error: err,
      });

      throw error;
    }
  }

  cancel(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task || task.status !== "running") return false;

    task.abortController.abort();
    this.updateTask(taskId, { status: "cancelled", message: "Cancelled by user" });
    return true;
  }

  cancelAll(): number {
    let count = 0;
    for (const task of this.tasks.values()) {
      if (task.status === "running") {
        task.abortController.abort();
        this.updateTask(task.id, { status: "cancelled", message: "Cancelled" });
        count++;
      }
    }
    return count;
  }

  clearCompleted(): number {
    let count = 0;
    for (const [id, task] of this.tasks) {
      if (task.status === "completed" || task.status === "failed" || task.status === "cancelled") {
        this.tasks.delete(id);
        count++;
      }
    }
    if (count > 0) this.notify();
    return count;
  }

  private updateTask(taskId: string, updates: Partial<Task>): void {
    const task = this.tasks.get(taskId);
    if (!task) return;

    Object.assign(task, updates);
    if (updates.status === "completed" || updates.status === "failed" || updates.status === "cancelled") {
      task.endTime = Date.now();
    }
    this.notify();
  }
}

export const TaskRunner = new TaskRunnerImpl();
