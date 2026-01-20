# Eve Backend Tasks

> **Status**: In Progress  
> **Last Updated**: 2026-01-19

本文档追踪 Eve 后端（Bun + Hono + SQLite）的开发任务，为 Wall-E 前端提供 API 支持。

---

## 实现进度

### ✅ 已完成

| 日期 | 模块 | 任务 | 说明 |
|------|------|------|------|
| 2026-01-19 | Core | TUI-first 架构 | pi-tui 集成，Email capability |
| 2026-01-19 | Auth | 认证中间件 | Bearer token，`auth_tokens` 表 |
| 2026-01-19 | Jobs | HTTP API | `/jobs` 端点，CRUD + sync |
| 2026-01-19 | Jobs | SSE 同步 | `POST /jobs/sync` 实时进度 |
| 2026-01-19 | Jobs | 分析缓存 | `job_analysis` 表，避免重复 LLM 调用 |
| 2026-01-19 | Resume | Capability | 6 个 AgentTools (list/import/get/update/delete/set_default) |
| 2026-01-19 | Resume | HTTP API | `/resumes` 端点 |
| 2026-01-19 | Resume | PDF 解析 | pdftotext 集成 |
| 2026-01-19 | Resume | Tailoring API | `/resumes/tailor`，版本管理 |

### 🔄 待完成 (Wall-E 联调前)

| 优先级 | 模块 | 任务 | 说明 | 预估 |
|--------|------|------|------|------|
| **P0** | Jobs | URL 去重 | `url_hash` 避免重复导入 | 2h |
| **P1** | Resume | PDF 生成 | Playwright 后端，模板支持 | 8h |
| **P1** | Resume | PDF 缓存 | 按 tailored_version 缓存 | 2h |
| **P1** | Analytics | Funnel 查询 | 状态历史统计 | 4h |
| **P1** | Analytics | 技能提取 | 从 JD 提取关键技能 | 4h |
| **P2** | Security | 输入验证 | XSS/SQL 注入防护审计 | 3h |

### ⬜ 未开始 (后续阶段)

| 模块 | 任务 | 说明 |
|------|------|------|
| Auto-Apply | UAP Schema | 通用申请协议 |
| Auto-Apply | ATS 检测 | LinkedIn/Workday 识别 |

---

## API 端点清单

### Jobs API

| Method | Path | 说明 | 状态 |
|--------|------|------|------|
| `GET` | `/jobs` | 列出所有 jobs | ✅ |
| `GET` | `/jobs/:id` | 获取 job 详情 | ✅ |
| `GET` | `/jobs/stats` | 获取统计数据 | ✅ |
| `POST` | `/jobs/sync` | 触发邮件同步 (SSE) | ✅ |
| `PATCH` | `/jobs/:id/status` | 更新状态 | ✅ |
| `POST` | `/jobs/:id/analyze` | 触发 LLM 分析 | ✅ |
| `DELETE` | `/jobs/:id` | 删除 job | ✅ |

### Resume API

| Method | Path | 说明 | 状态 |
|--------|------|------|------|
| `GET` | `/resumes` | 列出所有简历 | ✅ |
| `GET` | `/resumes/:id` | 获取简历详情 | ✅ |
| `POST` | `/resumes` | 导入简历 (MD/PDF) | ✅ |
| `PUT` | `/resumes/:id` | 更新简历内容 | ✅ |
| `DELETE` | `/resumes/:id` | 删除简历 | ✅ |
| `POST` | `/resumes/:id/default` | 设为默认 | ✅ |
| `POST` | `/resumes/tailor` | 生成定制简历 | ✅ |
| `GET` | `/resumes/tailored/:jobId` | 获取定制版本列表 | ✅ |
| `PUT` | `/resumes/tailored/:id` | 更新定制版本 | ✅ |
| `POST` | `/resumes/tailored/:id/pdf` | 生成 PDF | ⬜ |

### Analytics API

| Method | Path | 说明 | 状态 |
|--------|------|------|------|
| `GET` | `/analytics/funnel` | 漏斗统计 | ⬜ |
| `GET` | `/analytics/skills` | 技能分析 | ⬜ |

---

## 数据库表

| 表名 | 说明 | 状态 |
|------|------|------|
| `jobs` | 职位信息 | ✅ |
| `job_analysis` | LLM 分析缓存 | ✅ |
| `resumes` | 简历库 | ✅ |
| `tailored_resumes` | 定制简历版本 | ✅ |
| `auth_tokens` | API 认证令牌 | ✅ |
| `sys_config` | 系统配置 | ✅ |

---

## 下一步行动

1. **完成 P0**: Job URL 去重
2. **完成 P1**: PDF 生成 + Analytics API
3. **联调测试**: 与 Wall-E 端到端测试
4. **安全审计**: 输入验证和 XSS 防护
