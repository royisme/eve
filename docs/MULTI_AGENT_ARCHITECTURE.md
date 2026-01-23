# Eve Multi-Agent Architecture Design

> **Status**: Draft (Reviewed by Oracle)  
> **Author**: AI Assistant  
> **Date**: 2026-01-22  
> **Version**: 0.2.0  
> **Reviewed**: 2026-01-22 by Oracle Agent

## Oracle Review Summary

### Overall Assessment
> 设计基本合理，适合本地优先的单进程系统。主要差距在于任务所有权/上下文共享的策略执行，以及超越简单 per-agent 槽位的资源治理（provider 速率限制、优先级公平性、取消机制）。

### Key Recommendations
1. **任务级授权**: 委托时验证 `taskTag` 在目标 agent 的责任范围内
2. **Context ACLs**: 要求显式 `contextIds` 和 per-context 读取权限
3. **Provider 感知限制**: 扩展并发控制以包含 provider 级别的速率限制
4. **超时/取消传播**: 跨委托链传播取消信号
5. **持久化**: 在 SQLite 中持久化最小任务/委托元数据用于崩溃恢复

### Risk Areas Identified
- **委托绕过**: 源 agent 可能委托目标不应处理的任务
- **Context 泄露**: `can_access_context` 过于粗粒度
- **Provider 速率限制**: 链式委托可能倍增并发 LLM 调用
- **超时不匹配**: 父任务超时但子任务继续运行

---

## 1. Executive Summary

本文档设计 Eve 的多 Agent 协作架构，解决以下核心问题：

1. **Agent 配置管理**: 通过 CLI 交互式配置 agents，而非手动编辑 JSON
2. **Agent 间通信**: 定义 agents 之间的委托和协作机制
3. **并发控制**: 防止资源耗尽和性能问题
4. **权限边界**: 确保 agents 只能访问授权的资源
5. **任务级授权** (Oracle建议): 委托时验证任务标签在目标 agent 责任范围内
6. **Context ACLs** (Oracle建议): 显式上下文共享权限控制

---

## 2. Current State Analysis

### 2.1 已有基础设施

| 组件 | 文件 | 状态 | 说明 |
|------|------|------|------|
| AgentRegistry | `src/core/agent-registry.ts` | ✅ 完整 | 从 `~/.config/eve/agents/` 加载 agents |
| AgentRoom | `src/core/agent-room.ts` | ✅ 完整 | Agent 运行时配置解析 |
| AgentSchema | `src/core/agent-schema.ts` | ✅ 完整 | agent.json 验证 schema |
| RoutingEngine | `src/core/routing-engine.ts` | ✅ 完整 | Task → Agent 路由 |
| EveOrchestrator | `src/core/orchestrator.ts` | ✅ 完整 | 任务编排和执行 |
| TaskPlanner | `src/core/task-planner.ts` | ✅ 完整 | 任务分解 |
| TaskRunner | `src/core/task-runner.ts` | ✅ 完整 | 任务执行器 |

### 2.2 缺失功能

| 功能 | 状态 | 影响 |
|------|------|------|
| Agent CLI 配置 | ❌ 缺失 | 用户必须手动编辑 JSON |
| Agent 间委托 | ❌ 缺失 | Agents 无法调用其他 agents |
| 并发限制 | ❌ 缺失 | 可能导致资源耗尽 |
| 委托深度控制 | ❌ 缺失 | 可能出现无限循环 |

### 2.3 当前 Agent 配置示例

```json
// ~/.config/eve/agents/job-hunter/agent.json
{
  "id": "job-hunter",
  "name": "Job Hunter",
  "version": "1.0.0",
  "role": {
    "description": "Analyzes job postings and provides recommendations",
    "system_prompt": "You are a job hunting expert..."
  },
  "model": {
    "primary": "sonnet",
    "fallback": "haiku",
    "temperature": 0.7,
    "thinking": "medium"
  },
  "responsibilities": ["jobs:*"],
  "permissions": {
    "tools": {
      "allow": ["jobs_*", "resume_*"],
      "deny": ["system_*"]
    },
    "can_delegate": false,
    "can_access_context": true
  }
}
```

---

## 3. Architecture Design

### 3.1 Agent Hierarchy Model

```
                    ┌─────────────────────┐
                    │        Eve          │
                    │   (Orchestrator)    │
                    │  - Routes requests  │
                    │  - Fallback handler │
                    └──────────┬──────────┘
                               │
           ┌───────────────────┼───────────────────┐
           │                   │                   │
           ▼                   ▼                   ▼
    ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
    │ Job Hunter  │     │   Email     │     │  Research   │
    │   Agent     │     │   Agent     │     │   Agent     │
    └──────┬──────┘     └─────────────┘     └──────┬──────┘
           │                                       │
           │ can_delegate                          │ can_delegate
           ▼                                       ▼
    ┌─────────────┐                         ┌─────────────┐
    │   Resume    │                         │ Web Scraper │
    │   Tailor    │                         │   Agent     │
    └─────────────┘                         └─────────────┘
```

### 3.2 Communication Patterns

#### Pattern A: Hierarchical (Eve-Mediated)
```
User → Eve → JobAgent → Eve → ResumeAgent → Eve → User
```
- 所有通信经过 Eve
- 简单、可控
- Eve 成为瓶颈

#### Pattern B: Direct Delegation (Proposed)
```
User → Eve → JobAgent → ResumeAgent → JobAgent → Eve → User
```
- Agents 可直接委托
- 需要权限控制
- 更高效

### 3.3 Delegation Model

```typescript
interface DelegationRequest {
  sourceAgentId: string;        // 发起委托的 agent
  targetAgentId: string;        // 目标 agent
  taskTag: string;              // 任务类型
  payload: unknown;             // 任务数据
  contextIds?: string[];        // 共享的 context
  callbackRequired: boolean;    // 是否需要返回结果
}

interface DelegationResult {
  success: boolean;
  output?: unknown;
  error?: string;
  delegationChain: string[];    // 委托链路追踪
}
```

---

## 4. Proposed Changes

### 4.1 Agent Schema Extensions

```typescript
// src/core/agent-schema.ts - 新增字段

const AgentDelegationSchema = Type.Object({
  can_delegate: Type.Boolean({ default: false }),
  allowed_targets: Type.Optional(Type.Array(Type.String())),  // 可委托的 agent 白名单
  max_delegation_depth: Type.Optional(Type.Integer({ default: 3, minimum: 1, maximum: 10 })),
});

const AgentConcurrencySchema = Type.Object({
  max_parallel_tasks: Type.Integer({ default: 5, minimum: 1, maximum: 50 }),
  max_pending_queue: Type.Integer({ default: 20, minimum: 1, maximum: 100 }),
  task_timeout_ms: Type.Integer({ default: 60000, minimum: 1000 }),
});

// 更新 AgentPermissionsSchema
const AgentPermissionsSchema = Type.Object({
  tools: Type.Optional(AgentToolPermissionsSchema),
  capabilities: Type.Optional(Type.Array(Type.String())),
  delegation: Type.Optional(AgentDelegationSchema),       // NEW
  concurrency: Type.Optional(AgentConcurrencySchema),     // NEW
  can_access_context: Type.Optional(Type.Boolean({ default: true })),
  max_tokens_per_call: Type.Optional(Type.Integer({ minimum: 0 })),
});
```

### 4.2 Agent Configuration CLI

新增 `configure` 命令的 agents 子菜单：

```typescript
// src/cli/configure.ts - 新增 handleAgents()

async function handleAgents(): Promise<void> {
  const registry = new AgentRegistry();
  registry.discoverAndLoad();
  
  const action = await p.select({
    message: "Agent Management",
    options: [
      { value: "list", label: "📋 List agents", hint: `${registry.listAgents().length} agents` },
      { value: "create", label: "➕ Create new agent" },
      { value: "edit", label: "✏️  Edit agent" },
      { value: "delete", label: "🗑️  Delete agent" },
      { value: "test", label: "🧪 Test agent" },
      { value: "back", label: "← Back" },
    ],
  });
  
  // ... implementation
}

async function createAgent(): Promise<void> {
  // Step 1: Basic info
  const id = await p.text({ message: "Agent ID (e.g., job-hunter)" });
  const name = await p.text({ message: "Display name" });
  const description = await p.text({ message: "Role description" });
  
  // Step 2: Model selection
  const models = ConfigReader.getModelResolver().listAliases();
  const primaryModel = await p.select({
    message: "Primary model",
    options: models.map(m => ({ value: m, label: m }))
  });
  
  // Step 3: Responsibilities
  const responsibilities = await p.text({
    message: "Responsibilities (comma-separated task tags)",
    placeholder: "jobs:*, email:send"
  });
  
  // Step 4: Delegation permissions
  const canDelegate = await p.confirm({ message: "Allow delegation to other agents?" });
  let allowedTargets: string[] = [];
  if (canDelegate) {
    const existingAgents = registry.listAgents();
    if (existingAgents.length > 0) {
      allowedTargets = await p.multiselect({
        message: "Select agents this agent can delegate to",
        options: existingAgents.map(a => ({ value: a, label: a }))
      });
    }
  }
  
  // Step 5: Concurrency settings
  const maxParallel = await p.text({
    message: "Max parallel tasks",
    placeholder: "5",
    validate: v => Number.isInteger(Number(v)) && Number(v) > 0 ? undefined : "Must be positive integer"
  });
  
  // Generate agent.json and save
  const config: AgentConfig = {
    id,
    name,
    role: { description },
    model: { primary: primaryModel },
    responsibilities: responsibilities.split(",").map(s => s.trim()),
    permissions: {
      delegation: {
        can_delegate: canDelegate,
        allowed_targets: canDelegate ? allowedTargets : undefined,
        max_delegation_depth: 3
      },
      concurrency: {
        max_parallel_tasks: Number(maxParallel) || 5,
        max_pending_queue: 20,
        task_timeout_ms: 60000
      }
    }
  };
  
  // Save to filesystem
  const agentDir = join(getDataDir(), "agents", id);
  mkdirSync(agentDir, { recursive: true });
  writeFileSync(join(agentDir, "agent.json"), JSON.stringify(config, null, 2));
  
  p.log.success(`Agent "${name}" created at ${agentDir}`);
}
```

### 4.3 Delegation Service

新增 `src/core/delegation-service.ts`：

```typescript
export interface DelegationContext {
  chain: string[];              // 委托链路: ["eve", "job-hunter", "resume-tailor"]
  depth: number;                // 当前深度
  maxDepth: number;             // 最大允许深度
  rootRequestId: string;        // 原始请求 ID
  parentTaskId: string;         // 父任务 ID
}

export class DelegationService {
  private agentRegistry: AgentRegistry;
  private concurrencyManager: ConcurrencyManager;
  
  /**
   * 检查委托是否被允许
   */
  canDelegate(
    sourceAgentId: string,
    targetAgentId: string,
    context: DelegationContext
  ): { allowed: boolean; reason?: string } {
    // 1. 检查深度限制
    if (context.depth >= context.maxDepth) {
      return { allowed: false, reason: `Max delegation depth (${context.maxDepth}) exceeded` };
    }
    
    // 2. 检查循环委托
    if (context.chain.includes(targetAgentId)) {
      return { allowed: false, reason: `Circular delegation detected: ${context.chain.join(" → ")} → ${targetAgentId}` };
    }
    
    // 3. 检查源 agent 权限
    const sourceAgent = this.agentRegistry.getAgent(sourceAgentId);
    if (!sourceAgent?.config.permissions.delegation?.can_delegate) {
      return { allowed: false, reason: `Agent "${sourceAgentId}" is not allowed to delegate` };
    }
    
    // 4. 检查白名单
    const allowedTargets = sourceAgent.config.permissions.delegation?.allowed_targets;
    if (allowedTargets && allowedTargets.length > 0 && !allowedTargets.includes(targetAgentId)) {
      return { allowed: false, reason: `Agent "${sourceAgentId}" cannot delegate to "${targetAgentId}"` };
    }
    
    // 5. 检查目标 agent 并发限制
    const concurrencyCheck = this.concurrencyManager.canAccept(targetAgentId);
    if (!concurrencyCheck.allowed) {
      return { allowed: false, reason: concurrencyCheck.reason };
    }
    
    return { allowed: true };
  }
  
  /**
   * 执行委托
   */
  async delegate(
    request: DelegationRequest,
    context: DelegationContext
  ): Promise<DelegationResult> {
    const check = this.canDelegate(request.sourceAgentId, request.targetAgentId, context);
    if (!check.allowed) {
      return {
        success: false,
        error: check.reason,
        delegationChain: context.chain
      };
    }
    
    // 更新上下文
    const newContext: DelegationContext = {
      ...context,
      chain: [...context.chain, request.targetAgentId],
      depth: context.depth + 1
    };
    
    // 获取并发槽位
    const slot = await this.concurrencyManager.acquire(request.targetAgentId);
    
    try {
      // 执行目标 agent
      const result = await this.executeAgent(request, newContext);
      return {
        success: true,
        output: result,
        delegationChain: newContext.chain
      };
    } finally {
      // 释放并发槽位
      this.concurrencyManager.release(slot);
    }
  }
}
```

### 4.4 Concurrency Manager

新增 `src/core/concurrency-manager.ts`：

```typescript
interface ConcurrencySlot {
  id: string;
  agentId: string;
  acquiredAt: Date;
  taskId: string;
}

interface AgentConcurrencyState {
  active: number;
  pending: number;
  config: {
    maxParallel: number;
    maxPending: number;
    timeoutMs: number;
  };
}

export class ConcurrencyManager {
  private state: Map<string, AgentConcurrencyState> = new Map();
  private slots: Map<string, ConcurrencySlot> = new Map();
  private pendingQueues: Map<string, Array<() => void>> = new Map();
  
  // 全局限制
  private globalConfig = {
    maxTotalAgents: 20,         // 全局最多同时运行的 agent 数
    maxTotalTasks: 100,         // 全局最多同时运行的任务数
  };
  
  canAccept(agentId: string): { allowed: boolean; reason?: string } {
    const state = this.getState(agentId);
    
    // 检查 agent 级别限制
    if (state.active >= state.config.maxParallel) {
      if (state.pending >= state.config.maxPending) {
        return { allowed: false, reason: `Agent "${agentId}" queue is full (${state.pending}/${state.config.maxPending})` };
      }
    }
    
    // 检查全局限制
    const totalActive = this.getTotalActive();
    if (totalActive >= this.globalConfig.maxTotalTasks) {
      return { allowed: false, reason: `Global task limit reached (${totalActive}/${this.globalConfig.maxTotalTasks})` };
    }
    
    return { allowed: true };
  }
  
  async acquire(agentId: string, taskId?: string): Promise<ConcurrencySlot> {
    const state = this.getState(agentId);
    
    // 如果有空闲槽位，立即获取
    if (state.active < state.config.maxParallel) {
      return this.createSlot(agentId, taskId);
    }
    
    // 否则加入等待队列
    return new Promise((resolve, reject) => {
      const queue = this.pendingQueues.get(agentId) || [];
      
      const timeoutId = setTimeout(() => {
        const index = queue.indexOf(resolver);
        if (index > -1) queue.splice(index, 1);
        reject(new Error(`Timeout waiting for slot on agent "${agentId}"`));
      }, state.config.timeoutMs);
      
      const resolver = () => {
        clearTimeout(timeoutId);
        resolve(this.createSlot(agentId, taskId));
      };
      
      queue.push(resolver);
      this.pendingQueues.set(agentId, queue);
      state.pending = queue.length;
    });
  }
  
  release(slot: ConcurrencySlot): void {
    this.slots.delete(slot.id);
    
    const state = this.getState(slot.agentId);
    state.active--;
    
    // 唤醒等待的任务
    const queue = this.pendingQueues.get(slot.agentId);
    if (queue && queue.length > 0) {
      const resolver = queue.shift()!;
      state.pending = queue.length;
      resolver();
    }
  }
  
  getMetrics(): ConcurrencyMetrics {
    return {
      totalActive: this.getTotalActive(),
      totalPending: this.getTotalPending(),
      byAgent: Object.fromEntries(
        Array.from(this.state.entries()).map(([id, state]) => [
          id,
          { active: state.active, pending: state.pending }
        ])
      )
    };
  }
}
```

### 4.5 Updated Configure Menu

```typescript
// src/cli/configure.ts - 更新主菜单

const section = await p.select({
  message: "What would you like to configure?",
  options: [
    {
      value: "authentication" as const,
      label: "🔐 Authentication",
      hint: authCount > 0 ? `${authCount} credentials` : "none configured",
    },
    {
      value: "providers" as const,
      label: "🤖 Providers & Models",
      hint: "Configure LLM providers and model aliases",
    },
    {
      value: "agents" as const,                    // NEW
      label: "🧠 Agents",
      hint: `${agentCount} agents configured`,
    },
    {
      value: "routing" as const,                   // NEW
      label: "🔀 Routing Rules",
      hint: "Task → Agent mapping",
    },
    {
      value: "view" as const,
      label: "📊 View Current Config",
    },
    {
      value: "done" as const,
      label: "✅ Done",
    },
  ],
});
```

---

## 5. Data Flow Examples

### 5.1 Simple Task (No Delegation)

```
User: "Analyze job #123"

1. Eve receives request
2. TaskPlanner: { tag: "jobs:analyze", payload: { jobId: 123 } }
3. RoutingEngine: routes to "job-hunter" agent
4. Orchestrator: dispatches to AgentRoom("job-hunter")
5. job-hunter executes using jobs_analyze_single tool
6. Result returns to Eve
7. Eve responds to user
```

### 5.2 Task with Delegation

```
User: "Analyze job #123 and tailor my resume for it"

1. Eve receives request
2. TaskPlanner creates plan:
   - Task A: jobs:analyze { jobId: 123 }
   - Task B: resume:tailor { jobId: 123 } [depends on A]
   
3. Orchestrator executes Task A:
   - Routes to "job-hunter"
   - job-hunter analyzes job
   - Saves context: ctx_job_analysis_123
   
4. Orchestrator executes Task B:
   - Routes to "job-hunter" (owns resume:tailor responsibility)
   - job-hunter decides to delegate to "resume-tailor"
   
5. DelegationService:
   - Checks: can_delegate=true, allowed_targets includes "resume-tailor"
   - Checks: depth=1 < maxDepth=3
   - Checks: no circular delegation
   - Acquires concurrency slot for "resume-tailor"
   
6. resume-tailor executes:
   - Receives context: ctx_job_analysis_123
   - Generates tailored resume
   - Returns result to job-hunter
   
7. job-hunter aggregates and returns to Eve
8. Eve responds to user
```

### 5.3 Delegation Chain Tracking

```
DelegationContext:
{
  chain: ["eve", "job-hunter", "resume-tailor"],
  depth: 2,
  maxDepth: 3,
  rootRequestId: "req_1705912345678",
  parentTaskId: "task_resume_tailor_1"
}
```

---

## 6. Configuration Examples

### 6.1 eve.json with Agent Settings

```json
{
  "eve": {
    "model": "sonnet",
    "role": "orchestrator",
    "fallback": true
  },
  "agents": {
    "enabled": ["job-hunter", "resume-tailor", "email-sender"],
    "auto_discover": true,
    "global_limits": {
      "max_total_agents": 20,
      "max_total_tasks": 100,
      "default_delegation_depth": 3
    }
  },
  "models": {
    "sonnet": { "provider": "anthropic", "model": "claude-sonnet-4-20250514" },
    "haiku": { "provider": "anthropic", "model": "claude-3-5-haiku-20241022" },
    "opus": { "provider": "anthropic", "model": "claude-sonnet-4-20250514" }
  }
}
```

### 6.2 Agent with Delegation Permissions

```json
{
  "id": "job-hunter",
  "name": "Job Hunter",
  "model": {
    "primary": "sonnet",
    "fallback": "haiku"
  },
  "responsibilities": ["jobs:*", "resume:tailor"],
  "permissions": {
    "tools": {
      "allow": ["jobs_*", "resume_*"],
      "deny": []
    },
    "delegation": {
      "can_delegate": true,
      "allowed_targets": ["resume-tailor", "email-sender"],
      "max_delegation_depth": 2
    },
    "concurrency": {
      "max_parallel_tasks": 5,
      "max_pending_queue": 10,
      "task_timeout_ms": 120000
    }
  }
}
```

---

## 7. Implementation Plan

### Phase 1: Agent CLI Configuration (P0)

| Task | Effort | Files |
|------|--------|-------|
| Add agents section to configure.ts | 2h | `src/cli/configure.ts` |
| Implement createAgent wizard | 3h | `src/cli/configure.ts` |
| Implement editAgent | 2h | `src/cli/configure.ts` |
| Implement deleteAgent | 1h | `src/cli/configure.ts` |
| Implement listAgents with details | 1h | `src/cli/configure.ts` |
| Add testAgent (dry run) | 2h | `src/cli/configure.ts` |

### Phase 2: Schema Extensions (P0)

| Task | Effort | Files |
|------|--------|-------|
| Add delegation schema | 1h | `src/core/agent-schema.ts` |
| Add concurrency schema | 1h | `src/core/agent-schema.ts` |
| Update AgentRoom resolver | 2h | `src/core/agent-room.ts` |
| Update config-schema.ts | 1h | `src/core/config-schema.ts` |

### Phase 3: Delegation Service (P1)

| Task | Effort | Files |
|------|--------|-------|
| Create DelegationService | 4h | `src/core/delegation-service.ts` |
| Create ConcurrencyManager | 4h | `src/core/concurrency-manager.ts` |
| Integrate with Orchestrator | 3h | `src/core/orchestrator.ts` |
| Add delegation tool for agents | 2h | `src/capabilities/system/tools/delegate.ts` |

### Phase 4: Testing & Monitoring (P2)

| Task | Effort | Files |
|------|--------|-------|
| Unit tests for DelegationService | 3h | `tests/` |
| Unit tests for ConcurrencyManager | 3h | `tests/` |
| Add metrics endpoint | 2h | `src/server.ts` |
| Add delegation chain logging | 2h | `src/core/delegation-service.ts` |

---

## 8. Security Considerations

### 8.1 Permission Boundaries

- Agents 只能访问其 `tools.allow` 列表中的工具
- 委托只能发往 `allowed_targets` 白名单中的 agents
- Context 共享受 `can_access_context` 控制

### 8.2 Resource Limits

- 每个 agent 有独立的并发限制
- 全局有总任务数限制
- 委托链有深度限制防止无限递归

### 8.3 Audit Trail

- 每次委托记录完整的 chain
- 所有 agent 执行记录到 memory
- 错误和超时有完整上下文

---

## 9. Oracle Review: Additional Sections

> 以下章节根据 Oracle Agent 的安全审查建议添加

### 9.1 Delegation Authorization Matrix

委托授权必须满足多层检查：

```typescript
interface DelegationAuthorizationCheck {
  // Level 1: Agent-to-Agent permission
  sourceCanDelegate: boolean;           // source.permissions.delegation.can_delegate
  targetInAllowedList: boolean;         // target in source.permissions.delegation.allowed_targets
  
  // Level 2: Task-level authorization (Oracle建议新增)
  taskTagInTargetResponsibilities: boolean;  // taskTag matches target.responsibilities
  sourceCanDelegateThisTag: boolean;         // taskTag in source.permissions.delegation.allowed_tags
  
  // Level 3: Structural checks
  depthWithinLimit: boolean;            // context.depth < maxDepth
  noCyclicDelegation: boolean;          // target not in context.chain
  
  // Level 4: Resource checks
  targetHasCapacity: boolean;           // concurrencyManager.canAccept(target)
  providerHasBudget: boolean;           // providerRateLimiter.canRequest(target.model.provider)
}
```

**授权决策矩阵**:

| Check | Fail Action |
|-------|-------------|
| sourceCanDelegate = false | Reject: "Agent not authorized to delegate" |
| targetInAllowedList = false | Reject: "Target agent not in allowed list" |
| taskTagInTargetResponsibilities = false | Reject: "Target cannot handle this task type" |
| depthWithinLimit = false | Reject: "Max delegation depth exceeded" |
| noCyclicDelegation = false | Reject: "Circular delegation detected" |
| targetHasCapacity = false | Queue or Reject based on config |
| providerHasBudget = false | Backoff and retry |

### 9.2 Context ACL Contract

Context 共享需要显式授权：

```typescript
interface ContextPermission {
  contextId: string;
  scope: "read" | "read_write" | "none";
  redactFields?: string[];              // 需要隐藏的敏感字段
  expiresAt?: string;                   // 权限过期时间
}

interface DelegationRequest {
  sourceAgentId: string;
  targetAgentId: string;
  taskTag: string;
  payload: unknown;
  
  // Context sharing with explicit permissions (Oracle建议)
  contextPermissions: ContextPermission[];  // 显式声明每个 context 的权限
}
```

**Context 共享规则**:

1. **Default Deny**: 未明确授权的 context 不可访问
2. **Redaction**: 敏感字段自动脱敏（如 API keys、个人信息）
3. **Scoped Access**: read vs read_write 权限分离
4. **Expiry**: 权限可设置过期时间

```typescript
// 示例：job-hunter 委托给 resume-tailor
const delegationRequest: DelegationRequest = {
  sourceAgentId: "job-hunter",
  targetAgentId: "resume-tailor",
  taskTag: "resume:tailor",
  payload: { jobId: 123 },
  contextPermissions: [
    {
      contextId: "ctx_job_analysis_123",
      scope: "read",
      redactFields: ["salary_expectations", "personal_notes"]
    },
    {
      contextId: "ctx_user_resume",
      scope: "read",
      // 完整简历可读
    }
  ]
};
```

### 9.3 Provider-Aware Rate Limiting

扩展并发控制以包含 provider 级别限制：

```typescript
interface ProviderRateLimiter {
  // Per-provider limits (from auth config)
  limits: Map<string, {
    requestsPerMinute: number;
    tokensPerMinute: number;
    currentRequests: number;
    currentTokens: number;
    resetAt: Date;
  }>;
  
  canRequest(provider: string, estimatedTokens?: number): boolean;
  recordRequest(provider: string, tokens: number): void;
  getBackoffMs(provider: string): number;
}

// 集成到 ConcurrencyManager
class ConcurrencyManager {
  private providerLimiter: ProviderRateLimiter;
  
  async acquire(agentId: string, taskId?: string): Promise<ConcurrencySlot> {
    const agent = this.agentRegistry.getAgent(agentId);
    const provider = agent?.config.model.primary.provider;
    
    // 检查 provider 速率限制
    if (provider && !this.providerLimiter.canRequest(provider)) {
      const backoffMs = this.providerLimiter.getBackoffMs(provider);
      await this.sleep(backoffMs);
    }
    
    // ... existing slot acquisition logic
  }
}
```

### 9.4 Timeout and Cancellation Propagation

跨委托链传播取消信号：

```typescript
interface CancellationToken {
  id: string;
  cancelled: boolean;
  reason?: string;
  onCancel: (callback: () => void) => void;
}

interface DelegationContext {
  chain: string[];
  depth: number;
  maxDepth: number;
  rootRequestId: string;
  parentTaskId: string;
  
  // Cancellation (Oracle建议新增)
  cancellation: CancellationToken;
  timeout: {
    remainingMs: number;          // 剩余时间（从父任务继承）
    startedAt: Date;
  };
}

// 委托执行时
async delegate(request: DelegationRequest, context: DelegationContext): Promise<DelegationResult> {
  // 创建子取消令牌
  const childCancellation = this.createChildCancellation(context.cancellation);
  
  // 计算剩余超时
  const elapsed = Date.now() - context.timeout.startedAt.getTime();
  const remainingMs = context.timeout.remainingMs - elapsed;
  
  if (remainingMs <= 0) {
    return { success: false, error: "Parent task timeout" };
  }
  
  // 设置超时
  const timeoutId = setTimeout(() => {
    childCancellation.cancel("Timeout");
  }, remainingMs);
  
  try {
    const result = await this.executeWithCancellation(request, childCancellation);
    clearTimeout(timeoutId);
    return result;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}
```

### 9.5 Crash Recovery and Persistence

在 SQLite 中持久化最小元数据：

```sql
-- 新增表：delegation_log
CREATE TABLE delegation_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id TEXT NOT NULL,           -- 原始请求 ID
  source_agent TEXT NOT NULL,
  target_agent TEXT NOT NULL,
  task_tag TEXT NOT NULL,
  status TEXT NOT NULL,               -- pending, running, success, failed, cancelled
  chain TEXT NOT NULL,                -- JSON: ["eve", "job-hunter", "resume-tailor"]
  started_at TEXT NOT NULL,
  completed_at TEXT,
  error TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_delegation_log_request ON delegation_log(request_id);
CREATE INDEX idx_delegation_log_status ON delegation_log(status);
```

**恢复策略**:

1. **启动时检查**: 扫描 `status = 'running'` 的记录
2. **标记为失败**: 将未完成的任务标记为 `status = 'crashed'`
3. **可选重试**: 根据配置决定是否重试 crashed 任务
4. **通知用户**: 如果有未完成的用户请求，通知用户

---

## 10. Open Questions (Updated)

### 已解决 (Oracle 建议)

| 问题 | 解决方案 |
|------|----------|
| Agent 热重载 | File watcher + debounced reload；新任务用新配置，进行中任务保持旧配置 |
| 状态持久化 | SQLite `delegation_log` 表记录最小元数据 |
| 优先级调度 | FIFO 默认，可选 priority tier from TaskPlanner，带饥饿预防 |

### 仍需决策

1. **跨进程通信**: 如果需要 scale-out，考虑内部任务总线（SQLite-backed queue）或 HTTP mailbox
2. **事件驱动 vs 直接委托**: 当前选择直接委托；如需持久化工作流，考虑 pub/sub 模式
3. **Provider 预算管理**: 是否需要用户可配置的每日/每月 token 预算？

---

## 11. Appendix

### A. Related Files

| File | Description |
|------|-------------|
| `src/core/agent.ts` | Eve agent factory |
| `src/core/agent-registry.ts` | Agent discovery and loading |
| `src/core/agent-room.ts` | Agent runtime configuration |
| `src/core/agent-schema.ts` | Agent config validation |
| `src/core/orchestrator.ts` | Task orchestration |
| `src/core/routing-engine.ts` | Task → Agent routing |
| `src/core/task-planner.ts` | Task decomposition |
| `src/core/task-runner.ts` | Task execution |
| `src/cli/configure.ts` | Interactive configuration |

### B. References

- [pi-agent-core documentation](https://github.com/mariozechner/pi-agent)
- [OpenAI Swarm](https://github.com/openai/swarm) - Multi-agent orchestration reference
- [AutoGen](https://github.com/microsoft/autogen) - Microsoft's multi-agent framework
