# Eve 架构设计 → 实现路径映射

> 生成日期: 2026-01-19
> 用途: 追踪文档设计与代码实现的对应关系

---

## 架构概览

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           EVE SPIRIT ARCHITECTURE                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                    BACKEND (Bun + Hono)                              │   │
│   │                                                                      │   │
│   │   ┌──────────────┐    ┌──────────────────────────────────────────┐  │   │
│   │   │  HTTP Layer  │    │          SPIRIT Core (src/sprite/)       │  │   │
│   │   │  src/index.ts│───▶│  ┌─────────────┐  ┌─────────────────┐   │  │   │
│   │   │              │    │  │ Orchestrator│  │     Loader      │   │  │   │
│   │   │  Routes:     │    │  │ (EveSprite) │  │ (readManifests) │   │  │   │
│   │   │  /health     │    │  └──────┬──────┘  └────────┬────────┘   │  │   │
│   │   │  /sprite/*   │    │         │                  │            │  │   │
│   │   │  /generate-* │    │         ▼                  ▼            │  │   │
│   │   └──────────────┘    │  ┌──────────────────────────────────┐   │  │   │
│   │                       │  │      Skills (src/skills/) ❌      │   │  │   │
│   │   ┌──────────────┐    │  │  ┌─────────┐ ┌─────────┐        │   │  │   │
│   │   │   Services   │    │  │  │EchoSkill│ │Generate │ ...    │   │  │   │
│   │   │  llm.ts      │    │  │  │   ❌    │ │Resume ❌│        │   │  │   │
│   │   │  firecrawl.ts│    │  │  └─────────┘ └─────────┘        │   │  │   │
│   │   │  gmail.ts    │    │  └──────────────────────────────────┘   │  │   │
│   │   └──────────────┘    └──────────────────────────────────────────┘  │   │
│   │                                                                      │   │
│   │   ┌──────────────────────────────────────────────────────────────┐  │   │
│   │   │         Legacy Modules (src/modules/) - 待迁移               │  │   │
│   │   │   ┌─────────────────────────────────────────────────────┐   │  │   │
│   │   │   │  JobModule ✅  (handle, enrich, analyze, CLI cmds)  │   │  │   │
│   │   │   │  └── extractors/ (linkedin, indeed, ai)             │   │  │   │
│   │   │   └─────────────────────────────────────────────────────┘   │  │   │
│   │   └──────────────────────────────────────────────────────────────┘  │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                      │                                       │
│                            REST API (port 3033)                              │
│                                      │                                       │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │               FRONTEND (Wall-E Chrome Extension)                     │   │
│   │                    extension/wall-e/src/                             │   │
│   │   ┌─────────────┐  ┌─────────────┐  ┌────────────────────────────┐  │   │
│   │   │   App.tsx   │  │ Workspace   │  │   UI Components (shadcn)   │  │   │
│   │   │  (Router)   │  │ (Split View)│  │  Button, Card, Input...    │  │   │
│   │   └─────────────┘  └─────────────┘  └────────────────────────────┘  │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘

✅ = 已实现    ❌ = 文档设计但未实现    ⚠️ = 部分实现
```

---

## 实现路径详细表

### 1. SPIRIT Core (核心框架)

| 架构组件 | 设计文档 | 实现文件 | 状态 | 说明 |
|---------|---------|---------|------|------|
| Orchestrator | `SPIRIT_PHASE_1.md` | `src/sprite/orchestrator.ts` | ✅ | `EveSprite` 类 - 技能注册、工具调用、思考循环 |
| Loader | `SPIRIT_PHASE_1.md` | `src/sprite/loader.ts` | ✅ | `readManifests()` - 扫描 skills 目录发现技能 |
| Types | `architecture_review.md` | `src/sprite/types.ts` | ✅ | `SkillManifest`, `SkillResult`, `SpriteIdentity`, `UserContext` |
| ISkill 接口 | `architecture_review.md` | — | ❌ | 仅在文档中设计，未创建独立接口文件 |
| Entry | `SPIRIT_PHASE_1.md` | `src/sprite/index.ts` | ✅ | Sprite 启动入口，初始化 EveSprite 并扫描技能 |

### 2. Skills (技能层)

| 架构组件 | 设计文档 | 实现文件 | 状态 | 说明 |
|---------|---------|---------|------|------|
| skills/ 目录 | `SPIRIT_PHASE_1.md` | — | ❌ | 目录未创建 |
| EchoSkill | `architecture_review.md` | — | ❌ | 未实现 |
| GenerateResumeSkill | `architecture_review.md` | — | ❌ | Mock 实现在 `src/index.ts` `/generate-resume` |
| HealthCheckSkill | `architecture_review.md` | — | ❌ | Mock 实现在 `src/index.ts` `/health` |
| jobs-parser Skill | `SPIRIT_PHASE_1.md` | — | ❌ | 待从 JobModule 迁移 |

### 3. HTTP Layer (服务层)

| 架构组件 | 设计文档 | 实现文件 | 状态 | 说明 |
|---------|---------|---------|------|------|
| Hono Server | `TECH_SPEC.md` | `src/index.ts` | ✅ | 主 HTTP 服务器 (port 3033) |
| Legacy Server | — | `src/server.ts` | ✅ | Bun.serve 备用服务器 |
| CORS 中间件 | `TECH_SPEC.md` | `src/index.ts:7` | ✅ | `cors()` 中间件 |
| SDUI (`/ui`) | `PRD.md`, `TECH_SPEC.md` | `src/index.ts:28` | ⚠️ | Mock 实现，返回静态组件 |

**API 端点清单**:

| 端点 | 方法 | 文件位置 | 功能 |
|-----|------|---------|------|
| `/health` | GET | `src/index.ts:10` | 健康检查 + Sprite 身份 |
| `/sprite/status` | GET | `src/index.ts:19` | Sprite 状态 (技能数、用户上下文) |
| `/ui` | POST | `src/index.ts:28` | SDUI 动态 UI 组件 |
| `/generate-resume` | POST | `src/index.ts:36` | 简历生成 (Mock) |
| `/ingest` | POST | `src/server.ts:41` | Chrome 扩展数据注入 |
| `/generate` | POST | `src/server.ts:70` | 通用生成 (Echo) |

### 4. Services (服务层)

| 架构组件 | 设计文档 | 实现文件 | 状态 | 说明 |
|---------|---------|---------|------|------|
| LLMService | `architecture_report.md` | `src/services/llm.ts` | ✅ | AI 分析服务 (Anthropic/OpenAI/Ark) |
| FirecrawlService | `architecture_report.md` | `src/services/firecrawl.ts` | ✅ | 网页抓取服务 |
| GmailSource | — | `src/core/gmail.ts` | ✅ | 邮件获取 (via gog CLI) |
| ConfigManager | — | `src/core/config.ts` | ✅ | SQLite 配置管理 |
| Dispatcher | — | `src/core/dispatcher.ts` | ✅ | 邮件路由到模块 |

### 5. Legacy Modules (遗留模块 - 待迁移)

| 架构组件 | 设计文档 | 实现文件 | 状态 | 说明 |
|---------|---------|---------|------|------|
| JobModule | `SPIRIT_PHASE_1.md` (迁移目标) | `src/modules/jobs/index.ts` | ✅ | 完整求职模块 |
| Email Extractors | — | `src/modules/jobs/extractors/` | ✅ | LinkedIn, Indeed, AI 解析器 |
| - LinkedIn | — | `src/modules/jobs/extractors/linkedin.ts` | ✅ | |
| - Indeed | — | `src/modules/jobs/extractors/indeed.ts` | ✅ | |
| - AI Fallback | — | `src/modules/jobs/extractors/ai.ts` | ✅ | |
| - Types | — | `src/modules/jobs/extractors/types.ts` | ✅ | `EmailData`, `JobOpportunity` |

**JobModule CLI 命令**:
- `jobs:status` - 显示仪表盘
- `jobs:enrich` - Firecrawl 抓取 JD
- `jobs:analyze` - LLM 分析匹配度
- `jobs:list` - 列出所有职位
- `jobs:resume <path>` - 导入简历

### 6. Database (数据层)

| 架构组件 | 设计文档 | 实现文件 | 状态 | 说明 |
|---------|---------|---------|------|------|
| SQLite + Drizzle | `architecture_review.md` | `src/db/index.ts` | ✅ | 数据库实例 |
| Schema | — | `src/db/schema.ts` | ✅ | 表定义 |
| - jobs 表 | — | `src/db/schema.ts` | ✅ | 职位信息存储 |
| - sys_config 表 | — | `src/db/schema.ts` | ✅ | 系统配置存储 |

### 7. Wall-E Extension (前端扩展)

| 架构组件 | 设计文档 | 实现文件 | 状态 | 说明 |
|---------|---------|---------|------|------|
| App (Router) | `PRD.md` | `extension/wall-e/src/App.tsx` | ✅ | HashRouter (Home, Workspace) |
| Workspace | `PRD.md` | `extension/wall-e/src/workspace/Workspace.tsx` | ✅ | Split View (JD + Resume 编辑) |
| MarkdownEditor | `PRD.md` | `extension/wall-e/src/components/MarkdownEditor.tsx` | ✅ | Markdown 文本编辑器 |
| Settings | — | `extension/wall-e/src/components/Settings.tsx` | ✅ | 服务端口配置 |
| UI Components | — | `extension/wall-e/src/components/ui/` | ✅ | shadcn/ui 组件库 |
| Manifest V3 | `TECH_SPEC.md` | `extension/wall-e/src/manifest.json` | ✅ | Chrome Side Panel 配置 |
| Utils | — | `extension/wall-e/src/lib/utils.ts` | ✅ | `cn()` 工具函数 |
| API Client | `TECH_SPEC.md` | — | ❌ | 需创建 `lib/api.ts` |
| WebSocket/SSE | `TECH_SPEC.md` | — | ❌ | 异步推送未实现 |
| State Management | `architecture_review.md` | — | ❌ | 建议引入 Zustand |

---

## 数据流路径

### 邮件处理流程
```
[Gmail] ──gog CLI──→ [GmailSource] ──→ [Dispatcher] ──→ [JobModule]
                                                              │
                                                    ┌─────────┴─────────┐
                                                    ↓                   ↓
                                             [Firecrawl]           [LLMService]
                                             (抓取 JD)             (分析匹配度)
                                                    │                   │
                                                    └─────→ [SQLite] ←──┘
                                                              ↓
                                                         [CLI Output]
```

### Chrome 扩展数据流
```
[Chrome Extension] ──POST /ingest──→ [server.ts] ──→ [Dispatcher] ──→ [JobModule]
                   ←─JSON Response──
```

### SPIRIT 目标数据流 (Phase 2+)
```
[User Intent] → [Orchestrator.think()] → [Planner/LLM]
                        │
                        ▼
              [Skill Selection] → [callTool()] → [Skill.execute()]
                        │
                        ▼
              [Result] → [Memory Update] → [Response]
```

---

## 差距分析与优先级

### P0 - 立即处理

| 任务 | 当前状态 | 目标 | 涉及文件 |
|-----|---------|------|---------|
| 创建 `src/skills/` 目录 | ❌ 不存在 | 目录结构 | 新建目录 |
| 定义 `ISkill` 接口 | ❌ 仅文档 | 代码实现 | `src/sprite/types.ts` 或新文件 |
| 迁移 JobModule 为 Skill | ❌ 遗留模块 | `jobs-parser` Skill | `src/skills/jobs-parser/` |
| 完善动态加载 | ⚠️ 只发现不执行 | 完整加载 | `src/sprite/index.ts` |
| 添加测试框架 | ❌ 0% 覆盖 | 基础测试 | `tests/` + Bun Test |

### P1 - 短期改进

| 任务 | 当前状态 | 目标 | 涉及文件 |
|-----|---------|------|---------|
| 创建前端 API 客户端 | ❌ 无封装 | 集中管理 | `extension/wall-e/src/lib/api.ts` |
| 实现请求追踪 | ❌ 无 trace_id | 可追溯 | `src/sprite/orchestrator.ts` |
| 添加结构化日志 | ⚠️ console.log | Pino | `src/utils/logger.ts` |
| 输入验证 (Zod) | ❌ 无验证 | Schema 验证 | Skills 输入输出 |

### P2 - 中期规划

| 任务 | 当前状态 | 目标 | 涉及文件 |
|-----|---------|------|---------|
| API 版本控制 | ❌ 无版本 | `/api/v1/` | `src/index.ts` |
| 前端状态管理 | ⚠️ 组件级 | Zustand | `extension/wall-e/src/store/` |
| WebSocket/SSE | ❌ 无实现 | 异步推送 | 新增服务 |
| 技能组合 (Chain) | ❌ 无实现 | SkillChain | `src/sprite/orchestrator.ts` |

### P3 - 长期愿景

| 任务 | 当前状态 | 目标 | 涉及文件 |
|-----|---------|------|---------|
| 技能市场 | ❌ 无实现 | 远程加载 | `src/core/loaders/RemoteLoader.ts` |
| 事件总线 | ❌ 无实现 | NATS/Redis | 新增服务 |
| 可观测性 | ❌ 无实现 | OpenTelemetry | 新增配置 |

---

## 相关文档索引

| 文档 | 路径 | 内容 |
|-----|------|------|
| 产品需求 | `docs/PRD.md` | Wall-E & Eve 产品愿景 |
| 技术规格 | `docs/TECH_SPEC.md` | 架构设计理念 |
| SPIRIT Phase 1 | `docs/SPIRIT_PHASE_1.md` | 核心框架实现计划 |
| 架构评审 | `docs/architecture_review.md` | 详细架构分析与建议 |
| 架构报告 | `docs/architecture_report.md` | 分布式智能体基座方案 |
| 工作流逻辑 | `docs/WORKFLOW_LOGIC.md` | 端到端数据生命周期 |
| UX 规格 | `docs/UX_SPEC.md` | 用户体验设计 |
| 路线图 | `docs/ROADMAP.md` | 项目路线图 |
| UI Skills | `docs/UI_SKILLS.md` | 前端开发约束 |

---

## 更新日志

| 日期 | 更新内容 |
|-----|---------|
| 2026-01-19 | 初始版本 - 完整架构映射 |
