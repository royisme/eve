# RFC: Email Scheduler & Multi-Account Enhancement

> **Status**: Draft  
> **Created**: 2026-01-20  
> **Author**: AI Assistant  

## Overview

本 RFC 描述了 Eve 邮件系统的增强方案，包括：

1. **多 Gmail 账户管理** - 支持主邮箱标记
2. **定时邮件同步 (Cron)** - 自动化邮件拉取
3. **TUI 交互配置** - 通过问答方式配置同步规则

---

## 1. 动机与背景

### 当前状态

| 功能 | 状态 | 代码位置 |
|------|------|----------|
| 多账户存储 | ✅ 已实现 | `ConfigManager.get("services.google.accounts")` |
| OAuth 授权 | ✅ 已实现 | `gog` CLI + `email_setup` tool |
| 邮件同步 | ✅ 已实现 | `email_sync` tool |
| 主账户标记 | ❌ 缺失 | - |
| 定时调度 | ❌ 缺失 | - |
| 交互式配置 | ❌ 缺失 | - |

### 用户痛点

1. **手动同步繁琐** - 每次需要手动触发 `email:sync`
2. **无法区分主次账户** - 多账户场景下不知道哪个是主要的
3. **配置不直观** - 需要手写 Gmail query 语法

---

## 2. 设计目标

1. **零配置开始** - 默认配置即可工作
2. **渐进式增强** - 高级用户可细粒度控制
3. **本地优先** - 所有配置持久化到 SQLite
4. **可观测** - 同步历史可追溯
5. **上下文隔离** - 后台任务不污染用户对话

---

## 3. 架构设计

### 3.0 核心架构：Gateway 守护进程模式

参考 Clawdbot 的设计，Eve 的 Cron 系统采用 **Gateway (守护进程) 驱动** 模式：

```
┌─────────────────────────────────────────────────────────────────┐
│                     Eve Gateway (Daemon)                        │
│                   长期运行的后台进程                              │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                    Scheduler (croner)                      │  │
│  │           管理所有 Cron 任务的注册与触发                      │  │
│  └─────────────────────────┬─────────────────────────────────┘  │
│                            │                                     │
│            ┌───────────────┴───────────────┐                    │
│            ▼                               ▼                    │
│  ┌─────────────────────┐      ┌─────────────────────────────┐  │
│  │   Main Session Mode │      │     Isolated Session Mode   │  │
│  │    (System Event)   │      │       (Background Job)      │  │
│  │                     │      │                             │  │
│  │  • 提醒类任务        │      │  • 邮件同步                  │  │
│  │  • 注入到用户对话    │      │  • 每日汇总                  │  │
│  │  • 立即可见          │      │  • 独立 Session ID          │  │
│  └─────────────────────┘      │  • 不污染主对话上下文         │  │
│                               └─────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

#### 关键设计决策

| 决策 | 说明 |
|------|------|
| **Daemon 驱动** | Scheduler 运行在 Gateway 进程，而非 AI Agent 内部 |
| **双模式执行** | 区分"主会话注入"和"隔离后台执行" |
| **唤醒机制** | 支持 `wakeMode: "now"` 强制立即触发 |
| **持久化存储** | 任务存储在 SQLite，重启后自动恢复 |

#### 任务契约 (Job Contract)

```typescript
interface CronJob {
  id: number;
  name: string;
  schedule: string;           // Cron 表达式
  
  // 执行目标
  target: "main" | "isolated";  // 主会话 or 隔离执行
  wakeMode?: "lazy" | "now";    // lazy=下次心跳, now=立即唤醒
  
  // 任务载荷
  payload: {
    type: "email_sync" | "reminder" | "daily_briefing" | "custom";
    params: Record<string, any>;
  };
  
  enabled: boolean;
  lastRunAt?: string;
  nextRunAt?: string;
}
```

#### 执行模式详解

**1. 主会话模式 (Main Session + System Event)**

适用场景：提醒、待办检查、需要用户立即感知的通知

```typescript
// 触发时：向主会话消息队列注入 SystemEvent
await mainSession.injectSystemEvent({
  type: "cron_trigger",
  jobId: job.id,
  jobName: job.name,
  payload: job.payload,
  timestamp: new Date().toISOString(),
});

// Agent 在下次 Heartbeat 时会看到这个事件
// 并以用户设定的语气在当前聊天中反馈
```

**2. 隔离模式 (Isolated Session)**

适用场景：邮件同步、每日新闻汇总、自动清理等后台任务

```typescript
// 触发时：创建临时独立会话
const isolatedSessionId = `cron:${job.name}:${Date.now()}`;

const result = await executeInIsolation(isolatedSessionId, async (agent) => {
  // 在独立上下文中执行
  return await agent.runTool(job.payload.type, job.payload.params);
});

// 结果可以：
// 1. 静默记录到 sync_history
// 2. 发送通知给用户 (可选)
// 3. 写入数据库供后续查询
```

#### 唤醒机制

```typescript
// 当 wakeMode === "now" 时
if (job.wakeMode === "now") {
  // 发送强制唤醒信号，打断 Agent 的空闲等待
  await gateway.sendWakeSignal({
    reason: "cron_trigger",
    jobId: job.id,
    priority: "high",
  });
}
```

---

### 3.1 数据模型

#### 3.1.1 邮箱账户表 (新增)

```sql
CREATE TABLE email_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  is_primary INTEGER DEFAULT 0,       -- 是否主邮箱
  is_authorized INTEGER DEFAULT 0,    -- 是否已授权
  alias TEXT,                         -- 别名 (如 "Work", "Personal")
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  last_sync_at TEXT                   -- 最后同步时间
);
```

#### 3.1.2 Cron 任务表 (新增)

```sql
CREATE TABLE cron_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,                 -- 任务名称
  description TEXT,                   -- 任务描述
  schedule TEXT NOT NULL,             -- Cron 表达式 (如 "0 9 * * *")
  
  -- 执行模式
  target TEXT NOT NULL DEFAULT 'isolated',  -- 'main' | 'isolated'
  wake_mode TEXT DEFAULT 'lazy',            -- 'lazy' | 'now'
  
  -- 任务载荷
  payload_type TEXT NOT NULL,         -- 'email_sync' | 'reminder' | 'daily_briefing'
  payload_params TEXT,                -- JSON 参数
  
  enabled INTEGER DEFAULT 1,
  timezone TEXT DEFAULT 'America/Toronto',
  
  last_run_at TEXT,
  next_run_at TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
```

#### 3.1.3 执行历史表 (新增)

```sql
CREATE TABLE cron_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER REFERENCES cron_jobs(id) ON DELETE CASCADE,
  session_id TEXT,                    -- 执行时的 Session ID
  started_at TEXT NOT NULL,
  finished_at TEXT,
  status TEXT NOT NULL,               -- 'running' | 'success' | 'failed'
  
  -- 结果统计
  result_summary TEXT,                -- JSON 执行摘要
  error_message TEXT,
  
  -- 调试信息
  trigger_reason TEXT                 -- 'scheduled' | 'manual' | 'wake'
);
```

#### Drizzle Schema 实现

```typescript
// src/db/schema.ts (新增)

export const emailAccounts = sqliteTable('email_accounts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  email: text('email').notNull().unique(),
  isPrimary: integer('is_primary').default(0),
  isAuthorized: integer('is_authorized').default(0),
  alias: text('alias'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  lastSyncAt: text('last_sync_at'),
});

export const cronJobs = sqliteTable('cron_jobs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  description: text('description'),
  schedule: text('schedule').notNull(),
  
  // 执行模式
  target: text('target').notNull().default('isolated'),  // 'main' | 'isolated'
  wakeMode: text('wake_mode').default('lazy'),           // 'lazy' | 'now'
  
  // 载荷
  payloadType: text('payload_type').notNull(),
  payloadParams: text('payload_params'),  // JSON
  
  enabled: integer('enabled').default(1),
  timezone: text('timezone').default('America/Toronto'),
  
  lastRunAt: text('last_run_at'),
  nextRunAt: text('next_run_at'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
});

export const cronRuns = sqliteTable('cron_runs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  jobId: integer('job_id').references(() => cronJobs.id, { onDelete: 'cascade' }),
  sessionId: text('session_id'),
  startedAt: text('started_at').notNull(),
  finishedAt: text('finished_at'),
  status: text('status').notNull(),
  resultSummary: text('result_summary'),  // JSON
  errorMessage: text('error_message'),
  triggerReason: text('trigger_reason'),
});
```

---

### 3.2 核心服务

#### 3.2.1 Gateway Scheduler Service

```typescript
// src/core/scheduler.ts

import { Cron } from 'croner';
import { db } from './db';
import { cronJobs, cronRuns } from '../db/schema';
import { eq } from 'drizzle-orm';

interface ScheduledJob {
  jobId: number;
  cron: Cron;
}

type JobExecutor = (job: typeof cronJobs.$inferSelect, sessionId: string) => Promise<{
  success: boolean;
  summary?: Record<string, any>;
  error?: string;
}>;

class GatewayScheduler {
  private jobs: Map<number, ScheduledJob> = new Map();
  private executors: Map<string, JobExecutor> = new Map();
  private isRunning = false;
  private mainSessionEventQueue: any[] = [];  // 主会话事件队列

  // 注册任务执行器
  registerExecutor(payloadType: string, executor: JobExecutor): void {
    this.executors.set(payloadType, executor);
  }

  async start(): Promise<void> {
    if (this.isRunning) return;
    
    console.log('🕐 [Gateway] Starting Scheduler...');
    
    const jobs = await db.select().from(cronJobs)
      .where(eq(cronJobs.enabled, 1)).all();
    
    for (const job of jobs) {
      this.scheduleJob(job);
    }
    
    this.isRunning = true;
    console.log(`📅 [Gateway] Scheduler active with ${jobs.length} jobs`);
  }

  async stop(): Promise<void> {
    for (const job of this.jobs.values()) {
      job.cron.stop();
    }
    this.jobs.clear();
    this.isRunning = false;
    console.log('🛑 [Gateway] Scheduler stopped');
  }

  private scheduleJob(job: typeof cronJobs.$inferSelect): void {
    const cron = new Cron(job.schedule, {
      timezone: job.timezone || 'America/Toronto',
    }, async () => {
      await this.executeJob(job.id, 'scheduled');
    });
    
    this.jobs.set(job.id, { jobId: job.id, cron });
    
    const nextRun = cron.nextRun();
    console.log(`  ✓ Job "${job.name}" scheduled: ${job.schedule} (next: ${nextRun?.toISOString()})`);
    
    // 更新 next_run_at
    db.update(cronJobs)
      .set({ nextRunAt: nextRun?.toISOString() })
      .where(eq(cronJobs.id, job.id))
      .run();
  }

  private async executeJob(jobId: number, triggerReason: 'scheduled' | 'manual' | 'wake'): Promise<void> {
    const job = await db.select().from(cronJobs)
      .where(eq(cronJobs.id, jobId)).get();
    
    if (!job) return;

    // 根据 target 决定执行模式
    if (job.target === 'main') {
      await this.executeInMainSession(job, triggerReason);
    } else {
      await this.executeInIsolation(job, triggerReason);
    }
  }

  // 主会话模式：注入 System Event
  private async executeInMainSession(
    job: typeof cronJobs.$inferSelect, 
    triggerReason: string
  ): Promise<void> {
    console.log(`🔔 [Gateway] Injecting event to main session: ${job.name}`);
    
    const systemEvent = {
      type: 'cron_trigger',
      jobId: job.id,
      jobName: job.name,
      payloadType: job.payloadType,
      payloadParams: job.payloadParams ? JSON.parse(job.payloadParams) : {},
      timestamp: new Date().toISOString(),
      triggerReason,
    };
    
    // 添加到主会话事件队列
    this.mainSessionEventQueue.push(systemEvent);
    
    // 如果 wakeMode === 'now'，发送唤醒信号
    if (job.wakeMode === 'now') {
      await this.sendWakeSignal(job.id);
    }
    
    // 记录执行
    await db.insert(cronRuns).values({
      jobId: job.id,
      sessionId: 'main',
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      status: 'success',
      resultSummary: JSON.stringify({ eventInjected: true }),
      triggerReason,
    });
    
    // 更新 last_run_at
    await db.update(cronJobs)
      .set({ lastRunAt: new Date().toISOString() })
      .where(eq(cronJobs.id, job.id));
  }

  // 隔离模式：独立 Session 执行
  private async executeInIsolation(
    job: typeof cronJobs.$inferSelect, 
    triggerReason: string
  ): Promise<void> {
    const sessionId = `cron:${job.name.replace(/\s+/g, '-').toLowerCase()}:${Date.now()}`;
    
    console.log(`🔄 [Gateway] Executing in isolation: ${job.name} (${sessionId})`);
    
    // 记录开始
    const [runRecord] = await db.insert(cronRuns).values({
      jobId: job.id,
      sessionId,
      startedAt: new Date().toISOString(),
      status: 'running',
      triggerReason,
    }).returning();

    try {
      // 获取对应的执行器
      const executor = this.executors.get(job.payloadType);
      
      if (!executor) {
        throw new Error(`No executor registered for payload type: ${job.payloadType}`);
      }
      
      const result = await executor(job, sessionId);
      
      // 记录成功
      await db.update(cronRuns).set({
        finishedAt: new Date().toISOString(),
        status: result.success ? 'success' : 'failed',
        resultSummary: JSON.stringify(result.summary || {}),
        errorMessage: result.error,
      }).where(eq(cronRuns.id, runRecord.id));
      
      console.log(`✅ [Gateway] Job "${job.name}" complete`);
    } catch (error) {
      // 记录失败
      await db.update(cronRuns).set({
        finishedAt: new Date().toISOString(),
        status: 'failed',
        errorMessage: (error as Error).message,
      }).where(eq(cronRuns.id, runRecord.id));
      
      console.error(`❌ [Gateway] Job "${job.name}" failed:`, error);
    }
    
    // 更新 last_run_at 和 next_run_at
    const cronInstance = this.jobs.get(job.id)?.cron;
    await db.update(cronJobs).set({ 
      lastRunAt: new Date().toISOString(),
      nextRunAt: cronInstance?.nextRun()?.toISOString(),
    }).where(eq(cronJobs.id, job.id));
  }

  // 唤醒信号
  private async sendWakeSignal(jobId: number): Promise<void> {
    // TODO: 实现与 Agent 心跳系统的集成
    // 可以通过 EventEmitter、Redis Pub/Sub、或内部 HTTP 调用
    console.log(`⚡ [Gateway] Wake signal sent for job ${jobId}`);
  }

  // 获取主会话待处理事件
  consumeMainSessionEvents(): any[] {
    const events = [...this.mainSessionEventQueue];
    this.mainSessionEventQueue = [];
    return events;
  }

  // 手动触发
  async runNow(jobId: number): Promise<void> {
    await this.executeJob(jobId, 'manual');
  }

  // 动态更新任务
  async upsertJob(job: typeof cronJobs.$inferSelect): Promise<void> {
    const existing = this.jobs.get(job.id);
    if (existing) {
      existing.cron.stop();
      this.jobs.delete(job.id);
    }
    
    if (job.enabled) {
      this.scheduleJob(job);
    }
  }

  // 状态查询
  getStatus(): {
    running: boolean;
    jobCount: number;
    jobs: { id: number; name: string; nextRun: Date | null; lastRun: string | null }[];
    pendingMainEvents: number;
  } {
    const jobList: any[] = [];
    
    for (const [id, scheduled] of this.jobs) {
      jobList.push({
        id,
        nextRun: scheduled.cron.nextRun(),
      });
    }
    
    return {
      running: this.isRunning,
      jobCount: this.jobs.size,
      jobs: jobList,
      pendingMainEvents: this.mainSessionEventQueue.length,
    };
  }
}

export const Scheduler = new GatewayScheduler();
```

#### 3.2.2 任务执行器注册

```typescript
// src/core/scheduler-executors.ts

import { Scheduler } from './scheduler';
import { syncEmails } from '../capabilities/email/services/email-service';

// 注册邮件同步执行器
Scheduler.registerExecutor('email_sync', async (job, sessionId) => {
  const params = job.payloadParams ? JSON.parse(job.payloadParams) : {};
  
  const query = params.query || 'from:linkedin OR from:indeed';
  const maxThreads = params.maxThreads || 50;
  const accounts = params.accounts;
  
  try {
    const result = await syncEmails(query, maxThreads, undefined, accounts);
    
    return {
      success: true,
      summary: {
        emailsFound: result.synced,
        newItems: result.newJobs,
        query,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: (error as Error).message,
    };
  }
});

// 注册每日简报执行器
Scheduler.registerExecutor('daily_briefing', async (job, sessionId) => {
  // TODO: 实现每日简报生成
  return { success: true, summary: { type: 'daily_briefing' } };
});

// 注册提醒执行器 (用于 main session 模式)
Scheduler.registerExecutor('reminder', async (job, sessionId) => {
  // 提醒类任务通常不需要实际执行逻辑
  // 主会话模式下，Agent 会在收到 System Event 后自行处理
  return { success: true, summary: { reminder: true } };
});
```

#### 3.2.2 Account Service (增强)

```typescript
// src/capabilities/email/services/account-service.ts

import { db } from '../../../core/db';
import { emailAccounts } from '../../../db/schema';
import { eq } from 'drizzle-orm';

export interface EmailAccount {
  id: number;
  email: string;
  isPrimary: boolean;
  isAuthorized: boolean;
  alias?: string;
  lastSyncAt?: string;
}

export async function listAccounts(): Promise<EmailAccount[]> {
  const rows = await db.select().from(emailAccounts).all();
  return rows.map(r => ({
    ...r,
    isPrimary: !!r.isPrimary,
    isAuthorized: !!r.isAuthorized,
  }));
}

export async function getPrimaryAccount(): Promise<EmailAccount | null> {
  const row = await db.select().from(emailAccounts)
    .where(eq(emailAccounts.isPrimary, 1)).get();
  return row ? { ...row, isPrimary: true, isAuthorized: !!row.isAuthorized } : null;
}

export async function setPrimaryAccount(email: string): Promise<void> {
  await db.transaction(async (tx) => {
    // 先清除所有 primary
    await tx.update(emailAccounts).set({ isPrimary: 0 });
    // 设置新的 primary
    await tx.update(emailAccounts)
      .set({ isPrimary: 1 })
      .where(eq(emailAccounts.email, email));
  });
}

export async function addAccount(email: string, options?: { 
  alias?: string; 
  isPrimary?: boolean 
}): Promise<EmailAccount> {
  const existing = await db.select().from(emailAccounts)
    .where(eq(emailAccounts.email, email)).get();
  
  if (existing) {
    // 更新现有
    await db.update(emailAccounts).set({
      alias: options?.alias ?? existing.alias,
      isPrimary: options?.isPrimary ? 1 : existing.isPrimary,
    }).where(eq(emailAccounts.id, existing.id));
    
    return { ...existing, isPrimary: !!options?.isPrimary };
  }
  
  // 新建
  const result = await db.insert(emailAccounts).values({
    email,
    alias: options?.alias,
    isPrimary: options?.isPrimary ? 1 : 0,
  }).returning();
  
  return { ...result[0], isPrimary: !!options?.isPrimary, isAuthorized: false };
}

export async function removeAccount(email: string): Promise<void> {
  await db.delete(emailAccounts).where(eq(emailAccounts.email, email));
}

export async function updateAccountAuth(email: string, isAuthorized: boolean): Promise<void> {
  await db.update(emailAccounts)
    .set({ isAuthorized: isAuthorized ? 1 : 0 })
    .where(eq(emailAccounts.email, email));
}
```

---

### 3.3 新增 AgentTools

#### 3.3.1 账户管理工具

```typescript
// src/capabilities/email/tools/accounts.ts

export const listAccountsTool: AgentTool = {
  name: "email_accounts_list",
  label: "List Email Accounts",
  description: "List all configured email accounts with their status",
  parameters: Type.Object({}),
  execute: async () => {
    const accounts = await listAccounts();
    
    let text = "📧 **Email Accounts**\n\n";
    for (const acc of accounts) {
      const icons = [
        acc.isPrimary ? "⭐" : "",
        acc.isAuthorized ? "✅" : "⚠️",
      ].filter(Boolean).join(" ");
      text += `- ${icons} ${acc.email}${acc.alias ? ` (${acc.alias})` : ""}\n`;
    }
    
    if (accounts.length === 0) {
      text = "No email accounts configured. Use `email_setup` to add one.";
    }
    
    return { content: [{ type: "text", text }] };
  },
};

export const setPrimaryAccountTool: AgentTool = {
  name: "email_set_primary",
  label: "Set Primary Account",
  description: "Set an email account as the primary account",
  parameters: Type.Object({
    email: Type.String({ description: "Email address to set as primary" }),
  }),
  execute: async (_, { email }) => {
    await setPrimaryAccount(email);
    return { 
      content: [{ type: "text", text: `⭐ Set ${email} as primary account.` }] 
    };
  },
};
```

#### 3.3.2 Cron 任务工具

```typescript
// src/capabilities/scheduler/tools/cron.ts

export const listCronJobsTool: AgentTool = {
  name: "cron_jobs_list",
  label: "List Cron Jobs",
  description: "List all scheduled cron jobs and their status",
  parameters: Type.Object({}),
  execute: async () => {
    const jobs = await db.select().from(cronJobs).all();
    
    if (jobs.length === 0) {
      return { 
        content: [{ type: "text", text: "No cron jobs configured." }] 
      };
    }
    
    let text = "📅 **Scheduled Jobs**\n\n";
    for (const job of jobs) {
      const status = job.enabled ? "🟢" : "⚪";
      const targetIcon = job.target === 'main' ? "💬" : "🔇";
      text += `### ${status} ${job.name} ${targetIcon}\n`;
      text += `- **Schedule**: \`${job.schedule}\`\n`;
      text += `- **Type**: ${job.payloadType}\n`;
      text += `- **Mode**: ${job.target === 'main' ? 'Main Session' : 'Isolated'}\n`;
      if (job.lastRunAt) text += `- **Last Run**: ${job.lastRunAt}\n`;
      if (job.nextRunAt) text += `- **Next Run**: ${job.nextRunAt}\n`;
      text += `\n`;
    }
    
    return { content: [{ type: "text", text }] };
  },
};

export const createCronJobTool: AgentTool = {
  name: "cron_job_create",
  label: "Create Cron Job",
  description: "Create a new scheduled cron job",
  parameters: Type.Object({
    name: Type.String({ description: "Job name" }),
    schedule: Type.String({ description: "Cron expression (e.g., '0 9 * * *' for 9am daily)" }),
    payloadType: Type.String({ description: "Job type: 'email_sync', 'reminder', 'daily_briefing'" }),
    payloadParams: Type.Optional(Type.Object({}, { additionalProperties: true })),
    target: Type.Optional(Type.Union([
      Type.Literal('main'),
      Type.Literal('isolated')
    ], { description: "'main' for chat injection, 'isolated' for background" })),
    wakeMode: Type.Optional(Type.Union([
      Type.Literal('lazy'),
      Type.Literal('now')
    ], { description: "'now' to wake agent immediately" })),
  }),
  execute: async (_, params) => {
    const result = await db.insert(cronJobs).values({
      name: params.name,
      schedule: params.schedule,
      payloadType: params.payloadType,
      payloadParams: params.payloadParams ? JSON.stringify(params.payloadParams) : null,
      target: params.target || 'isolated',
      wakeMode: params.wakeMode || 'lazy',
    }).returning();
    
    await Scheduler.upsertJob(result[0]);
    
    return { 
      content: [{ 
        type: "text", 
        text: `✅ Created cron job "${params.name}"\n- Schedule: ${params.schedule}\n- Mode: ${params.target || 'isolated'}` 
      }] 
    };
  },
};

export const runCronJobTool: AgentTool = {
  name: "cron_job_run",
  label: "Run Cron Job Now",
  description: "Execute a cron job immediately",
  parameters: Type.Object({
    jobId: Type.Number({ description: "Job ID to execute" }),
  }),
  execute: async (_, { jobId }) => {
    await Scheduler.runNow(jobId);
    return { 
      content: [{ type: "text", text: `🔄 Cron job #${jobId} triggered.` }] 
    };
  },
};

export const schedulerStatusTool: AgentTool = {
  name: "scheduler_status",
  label: "Scheduler Status",
  description: "Get the current status of the Gateway scheduler",
  parameters: Type.Object({}),
  execute: async () => {
    const status = Scheduler.getStatus();
    
    let text = `📊 **Scheduler Status**\n\n`;
    text += `- **State**: ${status.running ? '🟢 Running' : '⚪ Stopped'}\n`;
    text += `- **Active Jobs**: ${status.jobCount}\n`;
    text += `- **Pending Events**: ${status.pendingMainEvents}\n`;
    
    return { content: [{ type: "text", text }] };
  },
};
```

---

### 3.4 TUI 交互配置

#### 3.4.1 CLI 命令

```typescript
// src/cli/scheduler-config.ts

import { select, input, confirm } from '@inquirer/prompts';
import { db } from '../core/db';
import { cronJobs } from '../db/schema';
import { Scheduler } from '../core/scheduler';
import { listAccounts, addAccount, setPrimaryAccount } from '../capabilities/email/services/account-service';

export async function interactiveSchedulerSetup(): Promise<void> {
  console.log("\n🔧 Eve Scheduler Configuration\n");

  const action = await select({
    message: "What would you like to configure?",
    choices: [
      { name: "📧 Email Accounts", value: "accounts" },
      { name: "📅 Scheduled Jobs", value: "jobs" },
      { name: "📊 View Status", value: "status" },
      { name: "❌ Exit", value: "exit" },
    ],
  });

  switch (action) {
    case "accounts":
      await accountsMenu();
      break;
    case "jobs":
      await jobsMenu();
      break;
    case "status":
      await showStatus();
      break;
    case "exit":
      return;
  }

  await interactiveSchedulerSetup();
}

async function accountsMenu(): Promise<void> {
  const action = await select({
    message: "Email Accounts",
    choices: [
      { name: "➕ Add account", value: "add" },
      { name: "⭐ Set primary", value: "primary" },
      { name: "📋 List accounts", value: "list" },
      { name: "← Back", value: "back" },
    ],
  });

  if (action === "add") {
    const email = await input({
      message: "Gmail address:",
      validate: (v) => v.includes("@gmail") || "Must be a Gmail address",
    });
    const alias = await input({ message: "Nickname (optional):" });
    const isPrimary = await confirm({ message: "Set as primary?", default: false });
    
    await addAccount(email, { alias: alias || undefined, isPrimary });
    console.log(`✅ Added ${email}`);
  } else if (action === "primary") {
    const accounts = await listAccounts();
    if (accounts.length === 0) {
      console.log("No accounts configured.");
      return;
    }
    const email = await select({
      message: "Select primary account:",
      choices: accounts.map(a => ({ name: a.email, value: a.email })),
    });
    await setPrimaryAccount(email);
    console.log(`⭐ ${email} is now primary`);
  } else if (action === "list") {
    const accounts = await listAccounts();
    console.log("\n📧 Accounts:");
    for (const a of accounts) {
      console.log(`  ${a.isPrimary ? "⭐" : " "} ${a.email}${a.alias ? ` (${a.alias})` : ""}`);
    }
    console.log("");
  }
}

async function jobsMenu(): Promise<void> {
  const action = await select({
    message: "Scheduled Jobs",
    choices: [
      { name: "➕ Create job", value: "create" },
      { name: "📋 List jobs", value: "list" },
      { name: "▶️ Run job now", value: "run" },
      { name: "← Back", value: "back" },
    ],
  });

  if (action === "create") {
    await createJobFlow();
  } else if (action === "list") {
    const jobs = await db.select().from(cronJobs).all();
    console.log("\n📅 Jobs:");
    for (const j of jobs) {
      const mode = j.target === 'main' ? '💬' : '🔇';
      console.log(`  ${j.enabled ? "🟢" : "⚪"} [${j.id}] ${j.name} ${mode}`);
      console.log(`      Schedule: ${j.schedule} | Type: ${j.payloadType}`);
    }
    console.log("");
  } else if (action === "run") {
    const jobs = await db.select().from(cronJobs).all();
    if (jobs.length === 0) {
      console.log("No jobs configured.");
      return;
    }
    const jobId = await select({
      message: "Select job to run:",
      choices: jobs.map(j => ({ name: `[${j.id}] ${j.name}`, value: j.id })),
    });
    await Scheduler.runNow(jobId);
    console.log(`🔄 Job triggered`);
  }
}

async function createJobFlow(): Promise<void> {
  // Step 1: 选择任务类型
  const jobType = await select({
    message: "What type of job?",
    choices: [
      { name: "📧 Email Sync (Job Alerts)", value: "email_sync_jobs" },
      { name: "📧 Email Sync (Custom)", value: "email_sync_custom" },
      { name: "🔔 Reminder", value: "reminder" },
      { name: "📰 Daily Briefing", value: "daily_briefing" },
    ],
  });

  let name: string;
  let payloadType: string;
  let payloadParams: Record<string, any> = {};
  let target: 'main' | 'isolated' = 'isolated';

  switch (jobType) {
    case "email_sync_jobs":
      name = "Job Alerts Sync";
      payloadType = "email_sync";
      payloadParams = {
        query: "from:linkedin OR from:indeed OR from:glassdoor OR from:greenhouse",
      };
      break;
    case "email_sync_custom":
      name = await input({ message: "Job name:" });
      payloadType = "email_sync";
      payloadParams = {
        query: await input({ message: "Gmail search query:" }),
      };
      break;
    case "reminder":
      name = await input({ message: "Reminder name:" });
      payloadType = "reminder";
      payloadParams = {
        message: await input({ message: "Reminder message:" }),
      };
      target = 'main';  // 提醒注入到主会话
      break;
    case "daily_briefing":
      name = "Daily Briefing";
      payloadType = "daily_briefing";
      target = 'main';
      break;
    default:
      return;
  }

  // Step 2: 选择频率
  const schedule = await select({
    message: "Schedule:",
    choices: [
      { name: "Every hour", value: "0 * * * *" },
      { name: "Every 4 hours", value: "0 */4 * * *" },
      { name: "Daily at 9 AM", value: "0 9 * * *" },
      { name: "Daily at 6 PM", value: "0 18 * * *" },
      { name: "Twice daily (9 AM & 6 PM)", value: "0 9,18 * * *" },
      { name: "Custom", value: "custom" },
    ],
  });

  const finalSchedule = schedule === "custom" 
    ? await input({ message: "Cron expression:" })
    : schedule;

  // Step 3: 唤醒模式 (仅 main 模式)
  let wakeMode: 'lazy' | 'now' = 'lazy';
  if (target === 'main') {
    const immediate = await confirm({ 
      message: "Wake agent immediately when triggered?",
      default: false,
    });
    wakeMode = immediate ? 'now' : 'lazy';
  }

  // 保存
  const result = await db.insert(cronJobs).values({
    name,
    schedule: finalSchedule,
    payloadType,
    payloadParams: JSON.stringify(payloadParams),
    target,
    wakeMode,
  }).returning();

  await Scheduler.upsertJob(result[0]);

  console.log(`\n✅ Created job "${name}"`);
  console.log(`   Schedule: ${finalSchedule}`);
  console.log(`   Mode: ${target === 'main' ? 'Main Session 💬' : 'Isolated 🔇'}\n`);
}

async function showStatus(): Promise<void> {
  const status = Scheduler.getStatus();
  
  console.log("\n📊 Scheduler Status");
  console.log(`   State: ${status.running ? "🟢 Running" : "⚪ Stopped"}`);
  console.log(`   Active Jobs: ${status.jobCount}`);
  console.log(`   Pending Events: ${status.pendingMainEvents}`);
  
  if (status.jobs.length > 0) {
    console.log("\n   Upcoming:");
    for (const j of status.jobs.slice(0, 5)) {
      console.log(`     [${j.id}] Next: ${j.nextRun?.toLocaleString() || 'N/A'}`);
    }
  }
  console.log("");
}
```

#### 3.4.2 注册 CLI 命令

```typescript
// src/cli/index.ts (新增)

cli
  .command("config", "Interactive configuration wizard")
  .action(async () => {
    const { interactiveSchedulerSetup } = await import("./scheduler-config");
    await interactiveSchedulerSetup();
  });

cli
  .command("scheduler:start", "Start the Gateway scheduler daemon")
  .action(async () => {
    const { bootstrap } = await import("../core/bootstrap");
    await bootstrap();
    
    const { Scheduler } = await import("../core/scheduler");
    await import("../core/scheduler-executors");  // 注册执行器
    
    await Scheduler.start();
    console.log("🕐 Gateway Scheduler running. Press Ctrl+C to stop.");
    await new Promise(() => {});  // 保持进程
  });

cli
  .command("scheduler:status", "Show scheduler status")
  .action(async () => {
    const { Scheduler } = await import("../core/scheduler");
    console.log(JSON.stringify(Scheduler.getStatus(), null, 2));
  });

cli
  .command("scheduler:run <jobId>", "Run a job immediately")
  .action(async (jobId: string) => {
    const { Scheduler } = await import("../core/scheduler");
    await Scheduler.runNow(parseInt(jobId));
    console.log(`✅ Job ${jobId} triggered`);
  });
```

---

### 3.5 服务器集成

```typescript
// src/server.ts (修改)

import { Scheduler } from "./core/scheduler";
import "./core/scheduler-executors";  // 注册执行器

export async function startServer(port: number): Promise<void> {
  const { bootstrap } = await import("./core/bootstrap");
  await bootstrap();

  // 启动 Gateway Scheduler
  await Scheduler.start();

  const app = new Hono();
  // ... existing routes ...

  // Scheduler API
  app.get("/api/scheduler/status", (c) => {
    return c.json(Scheduler.getStatus());
  });

  app.post("/api/scheduler/jobs/:jobId/run", async (c) => {
    const jobId = parseInt(c.req.param("jobId"));
    await Scheduler.runNow(jobId);
    return c.json({ success: true });
  });

  // 主会话事件轮询 (供 Agent 心跳调用)
  app.get("/api/scheduler/events", (c) => {
    const events = Scheduler.consumeMainSessionEvents();
    return c.json({ events });
  });

  const status = Scheduler.getStatus();
  console.log(`🚀 Eve server running on http://localhost:${port}`);
  console.log(`📅 Gateway Scheduler: ${status.jobCount} jobs active`);
  
  Bun.serve({ port, fetch: app.fetch });
}
```

### 3.6 Agent 心跳集成

```typescript
// src/core/agent-heartbeat.ts

import { Scheduler } from './scheduler';

/**
 * Agent 心跳时检查是否有待处理的 Cron 事件
 * 这是 "Main Session Mode" 的核心：
 * - Scheduler 注入事件到队列
 * - Agent 在心跳时消费事件
 * - 事件被转化为 System Message 供 LLM 处理
 */
export async function checkSchedulerEvents(): Promise<CronEvent[]> {
  return Scheduler.consumeMainSessionEvents();
}

export interface CronEvent {
  type: 'cron_trigger';
  jobId: number;
  jobName: string;
  payloadType: string;
  payloadParams: Record<string, any>;
  timestamp: string;
  triggerReason: string;
}

/**
 * 将 Cron 事件转化为 Agent 可理解的 System Message
 */
export function cronEventToSystemMessage(event: CronEvent): string {
  switch (event.payloadType) {
    case 'reminder':
      return `[REMINDER] ${event.payloadParams.message}`;
    case 'daily_briefing':
      return `[SYSTEM] Time for your daily briefing. Please summarize today's updates.`;
    default:
      return `[SYSTEM] Scheduled task "${event.jobName}" triggered.`;
  }
}
```

---

## 4. 预设任务模板

为了降低配置门槛，提供开箱即用的预设：

| 模板名称 | 类型 | Schedule | 执行模式 |
|----------|------|----------|----------|
| Job Alerts Sync | email_sync | `0 */4 * * *` | Isolated |
| Morning Briefing | daily_briefing | `0 9 * * *` | Main |
| Evening Digest | daily_briefing | `0 18 * * *` | Main |
| Recruiter Check | email_sync | `0 10 * * 1-5` | Isolated |

```typescript
// src/core/scheduler-presets.ts

export const JOB_PRESETS = {
  job_alerts: {
    name: "Job Alerts Sync",
    schedule: "0 */4 * * *",
    payloadType: "email_sync",
    payloadParams: {
      query: "from:linkedin OR from:indeed OR from:glassdoor OR from:greenhouse OR from:lever",
    },
    target: "isolated",
    wakeMode: "lazy",
  },
  morning_briefing: {
    name: "Morning Briefing",
    schedule: "0 9 * * *",
    payloadType: "daily_briefing",
    payloadParams: {},
    target: "main",
    wakeMode: "now",  // 立即唤醒，用户能马上看到
  },
  recruiter_check: {
    name: "Recruiter Outreach Check",
    schedule: "0 10 * * 1-5",  // 工作日 10am
    payloadType: "email_sync",
    payloadParams: {
      query: "subject:(opportunity OR position OR role) from:*recruit*",
    },
    target: "isolated",
    wakeMode: "lazy",
  },
} as const;

export type PresetKey = keyof typeof JOB_PRESETS;
```

---

## 5. 实现优先级

| 阶段 | 范围 | 预计工时 |
|------|------|----------|
| **P0** | DB Schema (email_accounts, cron_jobs, cron_runs) | 1h |
| **P1** | GatewayScheduler + Executors | 4h |
| **P2** | Account Service | 1h |
| **P3** | AgentTools (accounts, cron) | 2h |
| **P4** | Agent 心跳集成 (Main Session Mode) | 2h |
| **P5** | TUI 配置向导 | 2h |
| **P6** | 服务器集成 + API | 1h |

**总计**: ~13 小时

---

## 6. 依赖

```json
{
  "dependencies": {
    "croner": "^8.0.0",           // Cron scheduler
    "@inquirer/prompts": "^5.0.0" // TUI prompts
  }
}
```

---

## 7. 测试计划

### 单元测试

- [ ] AccountService CRUD
- [ ] SyncRule CRUD
- [ ] Scheduler job registration/execution

### 集成测试

- [ ] Full sync flow: rule trigger → gmail fetch → dispatcher → job creation
- [ ] TUI wizard flow (manual)

### E2E 测试

- [ ] `eve email:config` 完整流程
- [ ] `eve serve` 启动后 scheduler 自动运行

---

## 8. 未来扩展

1. **Webhook 通知** - 任务完成后推送到 Slack/Discord
2. **智能调度** - 基于历史数据自动调整频率
3. **任务依赖** - 支持 DAG 式任务编排
4. **分布式执行** - 多 Gateway 实例负载均衡

---

## 9. 参考

- [croner - Cron for JS](https://github.com/Hexagon/croner) - Eve 使用的调度库
- [Gmail Search Operators](https://support.google.com/mail/answer/7190)
- [Inquirer.js Prompts](https://github.com/SBoudrias/Inquirer.js)
- **Clawdbot Gateway Pattern** - 本设计的主要参考架构
