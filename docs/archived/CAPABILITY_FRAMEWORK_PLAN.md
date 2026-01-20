# Eve 能力框架实施计划

> 创建日期: 2026-01-19
> 状态: 进行中

## 背景

Eve 是一个通用 AI 个人助手，目标是成为 Jarvis。它运行在 `@mariozechner/pi-agent-core` runtime 上。

**核心原则**: Eve 的每个能力（Jobs, Email, Calendar 等）都应该作为 AgentTool 暴露给 LLM，让 LLM 决定何时调用。

## 目标架构

```
src/
├── core/
│   └── agent.ts              # createEveAgent() - 核心 Agent 初始化
├── capabilities/             # 可扩展能力目录
│   ├── types.ts              # Capability 接口定义
│   ├── index.ts              # 注册中心 - 收集所有能力
│   ├── jobs/                 # 能力 1: 求职
│   │   ├── index.ts          # 导出 jobsCapability
│   │   ├── tools/            # AgentTool 定义
│   │   │   ├── search.ts
│   │   │   ├── list.ts
│   │   │   ├── enrich.ts
│   │   │   └── analyze.ts
│   │   └── services/         # 能力专属服务
│   │       └── jobs-service.ts
│   ├── email/                # 能力 2: 邮件（未来）
│   ├── calendar/             # 能力 3: 日程（未来）
│   └── ...                   # 更多能力
├── services/                 # 共享服务 (LLM, Firecrawl, etc.)
├── agents/manager.ts         # AgentManager - 使用 createEveAgent()
└── modules/jobs/             # 遗留模块 - 调用共享服务，保持 CLI 兼容
```

## 核心接口设计

### Capability 接口 (src/capabilities/types.ts)

```typescript
interface Capability {
  name: string;
  description: string;
  tools: AgentTool[];
  init?: (ctx: CapabilityContext) => Promise<void>;
  dispose?: () => Promise<void>;
}

interface CapabilityContext {
  db: typeof db;
  config: typeof ConfigManager;
}
```

### AgentTool 定义示例

```typescript
import { Type } from "@sinclair/typebox";
import type { AgentTool } from "@mariozechner/pi-agent-core";

const searchJobsTool: AgentTool = {
  name: "jobs_search",
  label: "Search Jobs",
  description: "Search for job opportunities by query or status",
  parameters: Type.Object({
    query: Type.Optional(Type.String({ description: "Search terms" })),
    status: Type.Optional(Type.String({ description: "Filter by status" })),
    limit: Type.Optional(Type.Number({ description: "Max results" }))
  }),
  execute: async (toolCallId, params, signal, onUpdate) => {
    const results = await searchJobs(params);
    return {
      content: [{ type: "text", text: JSON.stringify(results) }]
    };
  }
};
```

## 实施任务列表

### P0 - 核心框架 (高优先级)

| # | 任务 | 状态 | 文件 |
|---|------|------|------|
| 1 | 定义 Capability 接口和类型 | ✅ 完成 | `src/capabilities/types.ts` |
| 2 | 创建 Capability 注册中心 | ✅ 完成 | `src/capabilities/index.ts` |
| 3 | 创建 EveCore/Agent 初始化 | ✅ 完成 | `src/core/agent.ts` |
| 4 | 创建 Jobs Capability 目录结构 | 🔄 进行中 | `src/capabilities/jobs/` |
| 5 | 提取 JobModule 逻辑到共享服务 | 🔄 进行中 | `src/capabilities/jobs/services/jobs-service.ts` |
| 6 | 实现 Jobs AgentTools | ⏳ 待开始 | `src/capabilities/jobs/tools/*.ts` |
| 7 | 修改 AgentManager 注册 tools | ⏳ 待开始 | `src/agents/manager.ts` |

### P1 - 兼容性 (中优先级)

| # | 任务 | 状态 | 文件 |
|---|------|------|------|
| 8 | 保持 CLI 命令兼容 | ⏳ 待开始 | `src/modules/jobs/index.ts` |
| 9 | 更新 Hono 路由使用新 Agent | ⏳ 待开始 | `src/index.ts` |

### P2 - 文档和清理 (低优先级)

| # | 任务 | 状态 | 文件 |
|---|------|------|------|
| 10 | 更新 AGENTS.md 文档 | ⏳ 待开始 | `AGENTS.md` |
| 11 | 添加单元测试 | ⏳ 待开始 | `tests/capabilities/` |
| 12 | 标记 src/sprite/ 为 deprecated | ⏳ 待开始 | `src/sprite/` |

## Jobs Capability 工具清单

| 工具名 | 描述 | 参数 |
|--------|------|------|
| `jobs_search` | 搜索工作机会 | query?, status?, limit? |
| `jobs_list` | 列出最近的工作 | limit?, status? |
| `jobs_enrich` | 使用 Firecrawl 获取完整 JD | limit? |
| `jobs_analyze` | 使用 LLM 分析匹配度 | limit? |
| `jobs_stats` | 获取工作统计信息 | - |

## 迁移策略

1. **并行运行**: 新框架和旧模块同时存在
2. **共享服务层**: `jobs-service.ts` 被新工具和旧 CLI 共同调用
3. **渐进式迁移**: 先确保新框架工作，再逐步废弃旧代码
4. **向后兼容**: CLI 命令 (`jobs:status`, `jobs:enrich` 等) 继续可用

## 未来能力扩展

添加新能力只需：

1. 创建 `src/capabilities/<name>/` 目录
2. 实现 Capability 接口，导出 tools 数组
3. 在 `src/capabilities/index.ts` 中注册

```typescript
// 示例: 添加 Email 能力
import { emailCapability } from "./email";

const capabilities: Capability[] = [
  jobsCapability,
  emailCapability,  // 新增
];
```

## 相关文档

- `AGENTS.md` - AI Agent 开发指南
- `docs/IMPLEMENTATION_MAP.md` - 架构映射
- `docs/SPIRIT_PHASE_1.md` - 原始 Sprite 设计（已废弃）

---

## 更新日志

| 日期 | 更新 |
|------|------|
| 2026-01-19 | 初始版本，完成任务 1-3，进行中任务 4-5 |
