# Eve Sprite Phase 1: The First Breath

## 愿景
我们将 Eve 从“写死的后端服务”进化为 **“AI Sprite (AI 精灵)”**。
Phase 1 的目标是建立**最小可行基座 (MVP)**，让 Eve 具备自主意识（Identity）和工具调用能力（Toolbox）。

## 架构总览

### 1. 核心层 - The Core (Sprite's Soul)
负责“思考”和“记忆”。
*   **`src/sprite/orchestrator.ts`**: 
    *   **Orchestrator 类**: 调度器。负责维持上下文、协调 Tool 调用。
    *   **EveSprite 类**: 包含 `identity`、`userContext`、`skills` (Map)。
    *   **状态管理**: 在内存中维护“当前目标”和“感知状态”。
*   **`src/sprite/types.ts`**: 定义 Sprite 与 Skill 之间的接口契约。

### 2. 工具层 - The Toolbox (Sprite's Hands)
负责“执行”和“感知”，是**原子化能力的集合**。
*   **`src/sprite/loader.ts`**: 
    *   **`readManifests(skillsDir)`**: 扫描 `/skills` 目录，读取每个 Skill 的 `SKILL.md` 或 `manifest.json`。
    *   **动态注册**: 在 Eve 启动时，自动将发现的能力注入到 Sprite 中。
*   **技能单元 (Skills)**: 
    *   每个功能（如 `gog-gmail`, `job-parser`）都是一个独立的 Skill。
    *   **格式**: `skills/<skill-name>/` 下包含 `index.ts` 和 `SKILL.md`。

### 3. 协作层 - The External Synergy (Wall-E)
负责与“外部世界”（浏览器）的交互。
*   **协议设计**: Eve 与 Wall-E 通过 **轻量级 RPC/WebSocket** 通信。
*   **角色分离**: 
    *   Eve -> Wall-E: “去抓这个 URL”。
    *   Wall-E -> Eve: “我看到了这段 DOM，这是解析后的 JSON”。

## 文件结构

```
src/
├── identity/
│   └── IDENTITY.md      # Eve 的灵魂与人格
├── sprite/
│   ├── index.ts           # Sprite 启动入口
│   ├── orchestrator.ts    # 核心调度器
│   ├── loader.ts          # Skill 发现与加载器
│   └── types.ts          # 接口定义
├── skills/               # 新增：技能工具箱
│   ├── gog/
│   │   ├── index.ts
│   │   └── SKILL.md
│   └── job-parser/
│       └── ...
└── index.ts               # Hono Server (保留，用于 HTTP API)
```

## 关键模块说明

### `Orchestrator.ts` (大脑)
*   **`registerSkill(skill)`**: 将 Skill 实例注册到内部 Map。
*   **`callTool(skillName, toolName, args)`**: 统一的 Tool 调用入口。
*   **`think(prompt)`**: 接收用户意图，决定下一步动作。（Phase 1 先用占位符，Phase 2 接入 LLM）。

### `Loader.ts` (感知)
*   **扫描机制**: 遍历 `/skills` 目录。
*   **解析规则**: 识别 `SKILL.md` 中的元数据。
*   **错误处理**: Skill 加载失败不应导致 Sprite 崩溃。

## 迁移路径

**现状**: `src/modules/jobs/index.ts` 包含旧的业务逻辑。
**目标**: 将其重构为 **`jobs-parser` Skill**。

1.  **提取逻辑**: 将 `handle(email)`、`analyze()` 提取为纯函数。
2.  **封装为 Skill**: 在 `src/skills/jobs-parser/` 下创建 `index.ts`。
3.  **更新 Orchestrator**: 让 Eve 在启动时自动加载 `jobs-parser`。

## 成功标准

Phase 1 完成的标志：
1.  **身份识别**: 访问 `GET /health` 返回 `sprite: { name: "Eve", ... }`。
2.  **动态发现**: 启动日志显示 `[Eve] Skill registered: gog`。
3.  **代码验证**: 新增的 `src/sprite/` 文件编译通过，无 TypeScript 错误。

## 下一步

如果 Phase 1 审阅通过：
1.  **实现 Orchestrator**: 补全 `callTool` 的逻辑。
2.  **迁移 jobs 模块**: 将 `src/modules/jobs` 拆解为第一个 Skill。
3.  **测试连通性**: 确保 Eve 能调用 `gog` 抓取一封邮件。
