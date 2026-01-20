# 任务文档：功能增强（Email + UX）

## 目标
在 Gateway + Cron 基础能力之上，实现 **可用的邮件功能增强**，提升用户体验。

---

## 交付范围

### 1. 多账户管理
- email_accounts 表
- primary 账号支持
- 账户别名、授权状态

### 2. 执行器接入
- email_sync executor
- 支持 query / accounts / maxThreads

### 3. 预设任务模板
- Job Alerts Sync
- Morning Briefing
- Recruiter Check

### 4. TUI 配置向导
- 增删账号
- 创建/查看 cron job
- 运行任务

### 5. Agent 工具
- 账户管理工具
- Cron job 管理工具

### 6. 用户交互
- 对话中创建任务
- 对话查询任务状态

### 7. Wall‑E 设置页（可选）
- 账号管理 UI
- 任务管理 UI

---

## 关键产出

- `src/capabilities/email/services/account-service.ts`
- `src/capabilities/email/tools/accounts.ts`
- `src/capabilities/scheduler/tools/cron.ts`
- `src/cli/scheduler-config.ts`
- `src/core/scheduler-presets.ts`

---

## 完成标准

- 用户可配置多账户 + primary
- 可创建定时 email_sync 任务
- 可通过 TUI 管理任务
- 任务执行结果可在对话或 UI 中查询

---

## 验证方式

- 添加两个 Gmail 账户并指定 primary
- 创建 Job Alerts Sync 任务并执行
- TUI 输出可正确显示任务状态
- Agent 对话可查询 cron jobs / accounts
