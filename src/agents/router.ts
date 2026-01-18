// 任务路由：根据任务类型决定使用哪个 Agent

export class TaskRouter {
  // 任务到 Agent 的映射
  private routes: Map<string, string> = new Map();

  constructor() {
    // 初始化默认路由
    this.setDefaults();
  }

  private setDefaults() {
    // 快速提取任务 -> gemini-flash
    this.routes.set("extract:job-details", "gemini-flash");
    this.routes.set("extract:company-name", "gemini-flash");
    this.routes.set("extract:role-name", "gemini-flash");

    // 深度分析任务 -> claude-haiku（如果配置）
    this.routes.set("analyze:job-fit", "claude-haiku");
    this.routes.set("analyze:resume-match", "claude-haiku");

    // 内容增强任务 -> main agent
    this.routes.set("enrich:job-description", "");
    this.routes.set("enrich:company-research", "");
  }

  route(task: string): string | null {
    const agentName = this.routes.get(task);
    return agentName || null;
  }

  // 允许运行时更新路由
  setRoute(task: string, agentName: string) {
    this.routes.set(task, agentName);
  }
}
