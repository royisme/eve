# 任务文档：基础构建（Gateway + Cron）

## 目标
建立稳定的 **Gateway 守护进程 + Cron 调度能力**，作为 Eve 未来所有定时任务的基础框架。

---

## 交付范围

### 1. Gateway 守护进程
- 长期运行的后台进程
- 承载 Scheduler
- 提供唤醒与事件分发能力

### 2. Cron 调度引擎
- 使用 `croner`
- 支持标准 Cron 表达式
- 支持时区参数

### 3. 数据模型
- `cron_jobs`（任务定义）
- `cron_runs`（执行历史）

### 4. 任务执行框架
- 注册执行器 (Executor Registry)
- 支持两种执行模式：
  - Main Session（注入主对话）
  - Isolated Session（独立后台任务）

### 5. 唤醒机制
- 支持 `wakeMode: "now"`
- 触发时向 Agent 发送 wake signal

### 6. API
- `GET /api/scheduler/status`
- `POST /api/scheduler/jobs/:jobId/run`
- `GET /api/scheduler/events`

---

## 关键产出

- `src/core/scheduler.ts`（Gateway Scheduler）
- `src/core/scheduler-executors.ts`（执行器注册）
- DB schema 更新（cron_jobs, cron_runs）
- Server 启动时自动拉起 Scheduler

---

## 完成标准

- Scheduler 可启动并加载 cron_jobs
- 任务触发后写入 cron_runs
- Main Session 事件队列可被消费
- wakeMode=now 可触发唤醒信号

---

## 验证方式

- 创建一个测试 job (每分钟)
- 观察 cron_runs 是否写入
- main 模式任务能注入事件队列
- isolated 模式任务可独立执行
