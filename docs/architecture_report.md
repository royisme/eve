# Eve 分布式智能体基座架构分析与完善方案

> 目标：打造寄生于 AI Runtime 的“Sprite 级”智能体基座，以本地优先、工具无状态、核心有状态为原则，支持多技能协作、可观测、可扩展与可演进。

## 1. 架构合理性评估与改进建议

### ✅ 合理性
- **核心/工具分层**：符合“决策在核心、执行在工具”的清晰责任边界。
- **本地优先**：有助于敏感数据与决策逻辑的合规与私密性。
- **技能化工具**：天然适配插件化与能力市场扩展。

### ⚠️ 潜在问题
- **缺少显式状态机与策略层**：仅有 Orchestrator，缺少明确的策略/计划/执行闭环。
- **接口契约不清**：JSON-RPC/REST 未定义语义、错误码、幂等等关键约束。
- **记忆系统与上下文耦合**：USER.md 与任务状态混用，难以演进为多用户/多任务。
- **协作层弱一致性风险**：Wall‑E 与 Eve 协议轻量但缺乏重放、幂等、对账机制。

### ✅ 关键改进
1. **引入显式“Agent Runtime Loop”**：Plan → Act → Observe → Reflect
2. **定义统一的 Tool Contract**：标准化能力注册、输入输出 schema、错误模型、幂等语义
3. **拆分 Memory 层级**：短期工作记忆/长期知识/事件溯源/模型学习分层
4. **加事件总线与任务编排**：保障并发、多工具协作的可靠性
5. **可观测性与容错内建**：追踪链路与重试、降级策略必须是框架级能力

---

## 2. 模块边界、接口契约与数据流

### 2.1 模块边界（推荐）
```
Eve Core
├── Identity & Policy
├── Context Manager
├── Memory System
├── Planner (LLM Policy)
├── Orchestrator / Executor
└── Observability & Safety

Toolbox Layer
├── Tool Registry
├── Skill Runtime (Adapter + Sandbox)
└── Tool Contract (JSON Schema)

Collaboration Layer
├── Wall-E Ingest
├── Wall-E Executor
└── Sync Bridge (Event Bus + State Sync)
```

### 2.2 接口契约规范（示例）
- **Tool Manifest**
```json
{
  "name": "browser.click",
  "version": "1.2.0",
  "description": "Click an element",
  "input_schema": {"type":"object","properties":{"selector":{"type":"string"}},"required":["selector"]},
  "output_schema": {"type":"object","properties":{"success":{"type":"boolean"}}},
  "idempotency": "unsafe",
  "timeout_ms": 8000,
  "rate_limit": "10/s"
}
```

- **Invocation Envelope**
```json
{
  "request_id": "uuid",
  "tool": "browser.click",
  "input": {"selector": "#submit"},
  "context": {"task_id":"t-123","trace_id":"tr-xxx"}
}
```

- **Error Model**
```json
{
  "error": {
    "code": "TOOL_TIMEOUT|INVALID_INPUT|EXECUTION_FAILED",
    "message": "...",
    "retryable": true,
    "details": {...}
  }
}
```

### 2.3 数据流设计（核心闭环）
```
User Intent
  → Context Manager
  → Planner (LLM policy)
  → Orchestrator
  → Tool Registry → Tool Runtime
  → Observation
  → Memory/Context Update
  → Reflection/Policy Update
```

---

## 3. 可扩展性 / 可维护性 / 可测试性

### 可扩展性
- Tool Registry + Manifest + Adapter 模式
- 多 Agent 协作通过 Event Bus / Task Queue 扩展

### 可维护性
- 统一工具契约、版本治理、依赖隔离
- 中央化配置（YAML/JSON）管理工具与策略

### 可测试性
- 工具层：契约测试（schema + mock）
- Orchestrator：流程回放测试（Trace replay）
- Memory：数据一致性与回归测试

---

## 4. 技术栈建议

### 核心层
- **语言**：TypeScript / Rust（性能关键组件）
- **记忆存储**：SQLite + Drizzle ORM
- **向量索引**：SQLite VSS / LanceDB

### 工具层
- JSON-RPC over HTTP/WebSocket
- Tool Runtime 采用 Node Sandbox 或 WASM

### 协作层
- 事件总线：NATS / Redis Streams
- 同步协议：gRPC or WebSocket + protobuf

### 可观测性
- Tracing：OpenTelemetry
- Metrics：Prometheus + Grafana
- Logs：Loki / ELK

---

## 5. 完整架构设计文档（摘要版）

### 5.1 架构图描述（逻辑视图）
```
┌──────────────┐        ┌───────────────┐
│   User/CLI   │  --->  │ Eve Core       │
└──────────────┘        │  - Policy      │
                        │  - Context     │
                        │  - Memory      │
                        │  - Orchestrator│
                        └─────┬─────────┘
                              │
                      ┌───────▼─────────┐
                      │ Tool Registry    │
                      └───────┬─────────┘
                              │
                    ┌─────────▼─────────┐
                    │ Tool Runtimes     │
                    └─────────┬─────────┘
                              │
                     ┌────────▼─────────┐
                     │ Wall-E Executor  │
                     └──────────────────┘
```

### 5.2 组件详细设计
- **Identity & Policy**：决策边界、人格偏好、风险等级、工具白名单
- **Context Manager**：任务上下文、用户画像、对话状态
- **Memory System**：
  - STM: 短期任务状态
  - LTM: 知识沉淀/事实记忆
  - Episodic: 事件溯源
- **Planner**：策略生成与分解（可插拔 LLM Policy）
- **Orchestrator**：执行调度、并发控制、回退策略
- **Tool Registry**：能力注册、版本管理、能力依赖解析
- **Sync Bridge**：事件流、状态同步、幂等对账

### 5.3 非功能需求（NFR）
- **并发**：任务级隔离（task_id），工具级限流
- **容错**：幂等与重试策略，失败回退与降级
- **可观测性**：Trace + Log + Metrics 全链路
- **安全**：本地优先、最小权限、敏感数据隔离

---

## 6. 实施路线图建议

### Phase 1 — MVP 基座
- 核心闭环 (Context → Planner → Orchestrator → Tool)
- 工具契约与注册机制
- 基础 Memory 与日志

### Phase 2 — 稳定化与观测
- Trace/Metric/Log 三件套
- Tool Sandbox 与权限隔离
- 工具失败重试与降级

### Phase 3 — 多 Agent 协作
- Event Bus + Sync Bridge
- Wall‑E 行为可靠性与回放

### Phase 4 — 生态扩展
- Skill Marketplace
- 多模型策略选择
- Auto‑tuning / Policy 学习

---

## 7. 结论
当前架构的方向正确，但需补齐 **状态机闭环、工具契约、事件驱动、可靠性与观测体系**。建议以“核心闭环 + 可观测 + 可插拔技能”为第一阶段目标，实现最小可用、可演进的智能体基座。
