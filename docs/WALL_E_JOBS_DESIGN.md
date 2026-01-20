# Wall-E Jobs Feature Design

> **Status**: In Progress  
> **Version**: 1.2 (Implementation Started)  
> **Author**: AI Assistant  
> **Date**: 2026-01-19  
> **Reviewers**: Oracle (completed 2026-01-19)
> **Last Updated**: 2026-01-19

---

## Implementation Progress

### ✅ Completed

| Date | Commit | Description |
|------|--------|-------------|
| 2026-01-19 | `d43a7c3` | TUI-first architecture with Email capability |
| 2026-01-19 | `cbc5e8a` | Oracle review fixes (P0/P1/P2) |
| 2026-01-19 | `4369271` | Wall-E Jobs feature design document |
| 2026-01-19 | `01ccfc8` | Content size limit + Promise-based init |
| 2026-01-19 | `a75e613` | Oracle review: body-limit, byte-length, JSON error handling |
| 2026-01-19 | `ed26d79` | **Resume capability** with full CRUD (6 tools) |
| 2026-01-19 | `afc0bbb` | **Auth middleware** + **Jobs HTTP API** |
| 2026-01-19 | `0ac7135` | Rename `role` → `title` for consistency |
| 2026-01-19 | `a54329b` | Extract email sync logic to service layer |
| 2026-01-19 | `fa6b556` | **Job analysis caching** + URL deduplication |
| 2026-01-19 | `b71a6cd` | Fix circular dependency in capabilities init |

### 🔄 In Progress

- Wall-E integration with new APIs
- End-to-end testing

### ⬜ Not Started

- PDF generation (Playwright)
- Analytics dashboard
- Wall-E Resume tab UI

---

## 1. Executive Summary

This document outlines the design for implementing comprehensive job-hunting features through Wall-E (Chrome Extension), focusing on:

- **Resume Import & Management**: Multi-resume library with PDF/Markdown support
- **Job Analysis & Matching**: LLM-powered fit scoring and gap analysis
- **Application Workflow**: Tailored resume generation and tracking
- **Analytics Dashboard**: Funnel metrics and skill insights

### Key Decisions (Oracle Approved)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| UI Architecture | **Client-Driven React** | Not SDUI; Wall-E owns UI logic, Eve provides REST API |
| Resume Capability | **Separate from Jobs** | Cleaner separation of concerns, reusable |
| Match Analysis | **On-demand by default** | Auto-analyze only starred/applied jobs to control LLM cost |
| PDF Generation | **Backend (Playwright)** | Full control, template support, caching |
| Real-time Updates | **SSE for sync, Polling for analytics** | Balance of simplicity and responsiveness |
| Offline Mode | **Read-only cache + queued actions** | Jobs/resumes viewable offline, sync when online |

---

## 2. Current State Analysis

### 2.1 Wall-E Components

| Component | Current State | Gap |
|-----------|---------------|-----|
| **JobsList.tsx** | Mock data, no real API | Needs Eve backend connection |
| **Workspace.tsx** | JD ↔ Resume comparison only | Lacks resume selection, version history |
| **api.ts** | Only chat/health/status | Missing jobs/resume/analytics endpoints |
| **TabNavigation** | Chat, Jobs, Resume tabs | Resume tab just opens Workspace |

### 2.2 Eve Backend Capabilities

| Capability | Tools | Status |
|------------|-------|--------|
| **jobs** | jobs_search, jobs_list, jobs_enrich, jobs_analyze | ✅ Implemented |
| **email** | email_status, email_setup, email_sync | ✅ Implemented |
| **resume** | resume_list, resume_import, resume_get, resume_update, resume_delete, resume_set_default | ✅ Implemented |

### 2.3 Gap Analysis

1. ~~**No Resume Capability**: Eve lacks tools for resume CRUD operations~~ ✅ **DONE**
2. ~~**No REST API for Jobs**: Only agent tools, no direct HTTP endpoints~~ ✅ **DONE**
3. **No PDF Generation**: Neither Eve nor Wall-E can generate PDFs
4. ~~**No Auth Handshake**: Wall-E → Eve communication is unauthenticated~~ ✅ **DONE**
5. **No Analysis Caching**: LLM analysis is re-computed every time
6. **No Job Deduplication**: Same job from multiple sources creates duplicates

---

## 3. User Journey Map

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        Job Hunter's Daily Workflow                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ① Morning Browse          ② Discover Opportunities    ③ Prepare Materials │
│  ┌─────────────┐           ┌─────────────┐             ┌─────────────┐     │
│  │ Check emails│──────────▶│ Filter jobs │────────────▶│ Tailor resume│     │
│  │ Scan LinkedIn│          │ Analyze match│            │ Write cover  │     │
│  └─────────────┘           └─────────────┘             └─────────────┘     │
│         │                         │                           │             │
│         ▼                         ▼                           ▼             │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │                     Wall-E Chrome Extension                            │ │
│  │  ┌─────────────────────────────────────────────────────────────────┐  │ │
│  │  │ Side Panel: Chat + Jobs + Resume                                 │  │ │
│  │  └─────────────────────────────────────────────────────────────────┘  │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│         │                         │                           │             │
│         ▼                         ▼                           ▼             │
│  ④ Submit Application      ⑤ Track Progress           ⑥ Analyze & Iterate │
│  ┌─────────────┐           ┌─────────────┐             ┌─────────────┐     │
│  │ One-click   │──────────▶│ Status track│────────────▶│ Data analysis│     │
│  │ Auto-fill   │           │ Interview   │             │ Optimize     │     │
│  └─────────────┘           └─────────────┘             └─────────────┘     │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3.1 Key User Stories

| ID | As a... | I want to... | So that... | Priority |
|----|---------|--------------|------------|----------|
| US1 | Job seeker | Import my resume (PDF/Markdown) | Eve can analyze and tailor it | P0 |
| US2 | Job seeker | See all job opportunities in one place | I don't miss any opportunity | P0 |
| US3 | Job seeker | Know my match score for each job | I can prioritize applications | P1 |
| US4 | Job seeker | Get suggestions to improve my resume | I have better chances | P1 |
| US5 | Job seeker | Track my application status | I know where I stand | P1 |
| US6 | Job seeker | See my application funnel metrics | I can improve my strategy | P2 |
| US7 | Job seeker | Generate tailored resume per job | I present my best fit | P1 |
| US8 | Job seeker | Manage multiple resume versions | I can apply to different roles | P2 |
| US9 | Job seeker | Use Wall-E offline (read-only) | I can review jobs without Eve | P2 |

---

## 4. Feature Architecture

### 4.1 Side Panel Restructure

```
┌────────────────────────────────────────┐
│  💬 Chat  │  💼 Jobs  │  📄 Resume     │
├────────────────────────────────────────┤
│                                        │
│   [Tab Content Area]                   │
│                                        │
└────────────────────────────────────────┘
```

| Tab | Primary Function | User Value |
|-----|------------------|------------|
| **Chat** | Natural language interaction with Eve | Ask anything, get intelligent responses |
| **Jobs** | Job opportunity kanban + analytics summary | Manage all opportunities, filter by status |
| **Resume** | Resume library management | Import, edit, manage multiple resumes |

### 4.2 Jobs Tab Design

#### 4.2.1 Jobs List View (with Quick Triage)

```
┌──────────────────────────────────────────────────────────────┐
│ 🔍 Search...                          [🔄 Sync] [📊 Stats]  │
├──────────────────────────────────────────────────────────────┤
│ 📊 Inbox: 45 │ Applied: 23 │ Interview: 5 │ Offers: 2       │  ← Analytics Summary
├──────────────────────────────────────────────────────────────┤
│ [All] [Inbox] [Applied] [Interview] [Offer]                  │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│ ┌──────────────────────────────────────────────────────────┐ │
│ │ ⭐ Staff Engineer @ Aurora Solar                         │ │
│ │ 📍 Canada (Remote) · 🎯 92% Match (cached)              │ │
│ │ 📅 Today · [Skip] [Star] [Analyze] [→]                  │ │  ← Quick Triage
│ └──────────────────────────────────────────────────────────┘ │
│                                                              │
│ ┌──────────────────────────────────────────────────────────┐ │
│ │ 🆕 Senior Frontend @ Shopify                             │ │
│ │ 📍 Toronto · 🎯 ~85% (keyword)                          │ │  ← Lightweight pre-score
│ │ 📅 Yesterday · [Skip] [Star] [Analyze] [→]              │ │
│ └──────────────────────────────────────────────────────────┘ │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

**Key Interactions**:
- **Sync Button**: Calls `POST /jobs/sync` → triggers `email_sync` with SSE progress
- **Stats Button**: Opens analytics modal/drawer
- **Match %**: 
  - Cached LLM analysis (if exists) → shows exact score
  - Keyword-based pre-score (if no analysis) → shows approximate score with `~`
- **Quick Triage**: Skip (archive) / Star (prioritize) / Analyze (trigger LLM)
- **[→]**: Opens Job Detail drawer

#### 4.2.2 Job Detail View (Drawer/Modal)

```
┌──────────────────────────────────────────────────────────────┐
│ ← Back                                      [⭐] [🗑️]       │
├──────────────────────────────────────────────────────────────┤
│ Staff Software Engineer                                      │
│ Aurora Solar · Canada (Remote)                               │
├──────────────────────────────────────────────────────────────┤
│ 📄 Resume: [Master Resume ▾]                                │  ← Inline selector
├──────────────────────────────────────────────────────────────┤
│ 📊 Match Analysis                                            │
│ ┌──────────────────────────────────────────────────────────┐ │
│ │ Overall: 92%                                              │ │
│ │ ✅ Skills: TypeScript, React, Node.js                    │ │
│ │ ⚠️ Gap: Python (mentioned 2x)                            │ │
│ │ 💡 Tip: Emphasize your backend experience                │ │
│ └──────────────────────────────────────────────────────────┘ │
├──────────────────────────────────────────────────────────────┤
│ 📝 Job Description                                           │
│ [Markdown rendered JD content...]                            │
├──────────────────────────────────────────────────────────────┤
│ Status: [Inbox ▾]                                            │
│           [🚀 Tailor Resume & Apply]                         │
└──────────────────────────────────────────────────────────────┘
```

**Key Features**:
- **Inline Resume Selector**: Change resume without leaving the drawer
- **Cached Analysis**: Shows cached analysis if available, with "Refresh" button
- **Status Dropdown**: Update status inline (inbox → applied → interviewing → offer/rejected)

### 4.3 Resume Tab Design

#### 4.3.1 Resume Library (Side Panel)

```
┌──────────────────────────────────────────────────────────────┐
│ 📄 My Resumes                              [+ Import]        │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│ ┌──────────────────────────────────────────────────────────┐ │
│ │ 📄 Master Resume (Default)                    ⭐         │ │
│ │ Updated: Jan 15 · Used: 23 times · ✅ Parsed            │ │
│ │ [Edit] [Preview] [Set Default]                           │ │
│ └──────────────────────────────────────────────────────────┘ │
│                                                              │
│ ┌──────────────────────────────────────────────────────────┐ │
│ │ 📄 Frontend Focus                                        │ │
│ │ Updated: Jan 10 · Used: 8 times · ✅ Parsed             │ │
│ │ [Edit] [Preview] [Delete]                                │ │
│ └──────────────────────────────────────────────────────────┘ │
│                                                              │
│ ┌──────────────────────────────────────────────────────────┐ │
│ │ 📄 Backend Resume                            ⚠️ Partial  │ │  ← Parse status
│ │ Updated: Jan 5 · Used: 0 times                           │ │
│ │ [Edit to Fix] [Preview] [Delete]                         │ │
│ └──────────────────────────────────────────────────────────┘ │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

**Import Methods**:
1. **PDF Upload**: Drag & drop or click to upload
   - Size limit: 20MB
   - Parse status: success / partial / failed
   - Fallback: "Paste manually" on failure
2. **Paste Markdown**: Direct paste of Markdown-formatted resume
3. **LinkedIn Import**: (Future) Import from LinkedIn Profile

**Import Failure Flow**:
```
PDF Upload → Parse Attempt → 
  ├─ Success → Show resume
  ├─ Partial → Show content + warnings + "Edit to fix" button
  └─ Failed → Show "Paste manually" fallback with error details
```

#### 4.3.2 Workspace Enhancement (Full Page)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ 📄 Resume Workspace                                [Save] [Build PDF]       │
├─────────────────────────────────┬───────────────────────────────────────────┤
│ 📋 Job Description              │ 📝 Tailored Resume                        │
│ ─────────────────────────────── │ ─────────────────────────────────────────  │
│                                 │                                           │
│ **Aurora Solar**                │ # Roy Zhu                                 │
│ Staff Software Engineer         │ Staff Software Engineer                   │
│                                 │                                           │
│ We're looking for...            │ ## Summary                                │
│ - 5+ years TypeScript           │ 8+ years building scalable...             │
│ - React, Node.js                │                                           │
│ - Python is a plus              │ ## Experience                             │
│                                 │ **Shopify** - Staff Engineer              │
│ ──────────────────────          │ - Led frontend architecture...            │
│ 🎯 Match: 92%                   │                                           │
│ ✅ TS, React, Node              │ [AI suggestion highlighting               │
│ ⚠️ Python gap                   │  appears inline with edits]               │
│                                 │                                           │
│ ──────────────────────          │                                           │
│ 💡 Eve's Suggestions:           │                                           │
│ "Add your Python side project   │                                           │
│  from 2023 hackathon"           │                                           │
│                                 │                                           │
├─────────────────────────────────┴───────────────────────────────────────────┤
│ 📚 Version History: v3 (current) │ v2 (Jan 18) │ v1 (Jan 17)               │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Features**:
1. **AI Inline Suggestions**: Eve highlights recommended edits in the editor
2. **Gap Analysis Panel**: Shows skill gaps between JD and resume
3. **Build PDF**: One-click PDF generation (via Playwright backend)
4. **Version History**: Multiple versions per job with `is_latest` flag

### 4.4 Analytics (Embedded in Jobs Tab Header + Modal)

**Jobs Tab Header** (always visible):
```
📊 Inbox: 45 │ Applied: 23 │ Interview: 5 │ Offers: 2
```

**Stats Modal** (click [📊 Stats] button):
```
┌──────────────────────────────────────────────────────────────┐
│ 📊 Application Analytics                   [This Week ▾]    │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│ 📈 Application Funnel                                        │
│ ┌──────────────────────────────────────────────────────────┐ │
│ │ Inbox ████████████████████████████████████░░░░░ 45       │ │
│ │ Applied ██████████████████████░░░░░░░░░░░░░░░░░ 23 (51%) │ │
│ │ Interview ██████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ 5 (22%)  │ │
│ │ Offer ██░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ 2 (40%)  │ │
│ └──────────────────────────────────────────────────────────┘ │
│                                                              │
│ 🏆 Top Performing Skills                                     │
│ • TypeScript: 18 matches                                     │
│ • React: 15 matches                                          │
│ • Node.js: 12 matches                                        │
│                                                              │
│ ⚠️ Skill Gaps to Address                                     │
│ • Python: mentioned in 8 JDs, missing from resume            │
│ • AWS: mentioned in 6 JDs, could be strengthened             │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

---

## 5. Technical Architecture

### 5.1 Eve HTTP API Endpoints (Complete)

```typescript
// ============================================
// Authentication (P0 - Required)
// ============================================

// All endpoints require Authorization header:
// Authorization: Bearer <shared_secret>
// Secret stored in Eve config and Wall-E chrome.storage

// ============================================
// Jobs API
// ============================================

// List jobs with filtering
GET /jobs
  Query: ?status=inbox|applied|interviewing|offer|rejected|skipped
         &starred=true
         &limit=20
         &offset=0
         &search=keyword
  Response: { jobs: Job[], total: number }

// Get job stats (counts by status)
GET /jobs/stats
  Response: { 
    inbox: number, 
    applied: number, 
    interviewing: number, 
    offer: number, 
    rejected: number,
    skipped: number 
  }

// Get single job with cached analysis
GET /jobs/:id
  Query: ?resumeId=123  // Optional: include analysis for specific resume
  Response: { job: Job, analysis?: JobAnalysis }

// Get cached analysis without re-computing
GET /jobs/:id/analysis
  Query: ?resumeId=123  // Required
  Response: { analysis: JobAnalysis | null, cached: boolean }

// Trigger LLM analysis for a job (creates/updates cache)
POST /jobs/:id/analyze
  Body: { resumeId: number }
  Response: { analysis: JobAnalysis }

// Update job (status, starred, etc.)
PATCH /jobs/:id
  Body: { 
    status?: "inbox" | "applied" | "interviewing" | "offer" | "rejected" | "skipped",
    starred?: boolean 
  }
  Response: { job: Job }

// Star/unstar job (convenience endpoint)
POST /jobs/:id/star
  Body: { starred: boolean }
  Response: { job: Job }

// Trigger email sync (returns SSE stream)
POST /jobs/sync
  Response: SSE stream with progress updates
  Events: 
    - { type: "progress", synced: number, total: number }
    - { type: "complete", synced: number, new: number }
    - { type: "error", message: string }

// Create job manually
POST /jobs
  Body: { title: string, company: string, url: string, location?: string }
  Response: { job: Job }

// ============================================
// Resumes API
// ============================================

// List all resumes
GET /resumes
  Response: { resumes: Resume[] }

// Create/import resume
POST /resumes
  Body: { 
    name: string, 
    content: string,           // Markdown or base64 PDF
    format: "markdown" | "pdf",
    filename?: string          // Original filename for PDF
  }
  Response: { resume: Resume }
  Notes: PDF parsing is async; returns immediately with parse_status="parsing"

// Get single resume
GET /resumes/:id
  Response: { resume: Resume }

// Get resume parse status (for PDF imports)
GET /resumes/:id/status
  Response: { parse_status: "success" | "partial" | "failed" | "parsing", errors?: string[] }

// Get resume versions (tailored versions for different jobs)
GET /resumes/:id/versions
  Response: { versions: TailoredResume[] }

// Update resume
PUT /resumes/:id
  Body: { name?: string, content?: string }
  Response: { resume: Resume }

// Delete resume
DELETE /resumes/:id
  Response: { success: true }

// Set as default resume
POST /resumes/:id/default
  Response: { resume: Resume }

// ============================================
// Tailoring API
// ============================================

// Generate tailored resume
POST /tailor
  Body: { jobId: number, resumeId: number }
  Response: { 
    tailoredResume: TailoredResume,
    suggestions: Suggestion[] 
  }

// Get tailored versions for a job
GET /tailor/:jobId
  Query: ?resumeId=123  // Optional filter
  Response: { versions: TailoredResume[] }

// Update tailored resume
PUT /tailor/:id
  Body: { content: string }
  Response: { tailoredResume: TailoredResume }

// Generate PDF from markdown
POST /tailor/pdf
  Body: { 
    markdown: string, 
    template?: "modern" | "classic" | "minimal"
  }
  Response: { 
    pdf: string,        // base64 encoded
    filename: string 
  }

// ============================================
// Analytics API
// ============================================

// Get funnel metrics
GET /analytics/funnel
  Query: ?period=week|month|all
  Response: { 
    inbox: number, 
    applied: number, 
    interview: number, 
    offer: number,
    conversionRates: {
      applyRate: number,      // applied / inbox
      interviewRate: number,  // interview / applied
      offerRate: number       // offer / interview
    }
  }

// Get skill insights
GET /analytics/skills
  Response: { 
    top: { skill: string, matchCount: number }[], 
    gaps: { skill: string, mentionCount: number, inResume: boolean }[] 
  }
```

### 5.2 Eve Capability: Resume

```typescript
// src/capabilities/resume/index.ts
import { Capability } from "../types";
import { resumeListTool } from "./tools/list";
import { resumeImportTool } from "./tools/import";
import { resumeGetTool } from "./tools/get";
import { resumeUpdateTool } from "./tools/update";
import { resumeDeleteTool } from "./tools/delete";
import { resumeTailorTool } from "./tools/tailor";
import { resumeSetDefaultTool } from "./tools/set-default";

export const resumeCapability: Capability = {
  name: "resume",
  description: "Resume management - import, edit, tailor, and generate PDFs",
  tools: [
    resumeListTool,       // List all resumes
    resumeImportTool,     // Import from PDF/Markdown
    resumeGetTool,        // Get resume by ID
    resumeUpdateTool,     // Update resume content
    resumeDeleteTool,     // Delete resume
    resumeSetDefaultTool, // Set as default
    resumeTailorTool,     // Generate tailored version for a job
  ],
};
```

### 5.3 Database Schema (Complete)

```sql
-- ============================================
-- Resumes
-- ============================================

CREATE TABLE resumes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  content TEXT NOT NULL,                    -- Markdown content
  is_default INTEGER DEFAULT 0,
  use_count INTEGER DEFAULT 0,
  -- Import metadata
  source TEXT DEFAULT 'paste',              -- paste, pdf_upload, linkedin
  original_filename TEXT,
  parse_status TEXT DEFAULT 'success',      -- success, partial, failed, parsing
  parse_errors TEXT,                        -- JSON array of error messages
  -- Timestamps
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_resumes_default ON resumes(is_default);

-- ============================================
-- Tailored Resumes (versioned per job)
-- ============================================

CREATE TABLE tailored_resumes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER NOT NULL,
  resume_id INTEGER NOT NULL,
  content TEXT NOT NULL,                    -- Tailored markdown
  suggestions TEXT,                         -- JSON array of suggestions
  version INTEGER DEFAULT 1,
  is_latest INTEGER DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
  FOREIGN KEY (resume_id) REFERENCES resumes(id) ON DELETE CASCADE
);

CREATE INDEX idx_tailored_job ON tailored_resumes(job_id);
CREATE INDEX idx_tailored_latest ON tailored_resumes(job_id, is_latest);

-- ============================================
-- Job Analysis Cache
-- ============================================

CREATE TABLE job_analysis (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER NOT NULL,
  resume_id INTEGER NOT NULL,
  model TEXT NOT NULL,                      -- LLM model used
  prompt_hash TEXT NOT NULL,                -- For cache invalidation
  result TEXT NOT NULL,                     -- JSON analysis result
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
  FOREIGN KEY (resume_id) REFERENCES resumes(id) ON DELETE CASCADE,
  UNIQUE(job_id, resume_id, prompt_hash)
);

CREATE INDEX idx_analysis_lookup ON job_analysis(job_id, resume_id);

-- ============================================
-- Job Status History (for funnel analytics)
-- ============================================

CREATE TABLE job_status_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER NOT NULL,
  old_status TEXT,
  new_status TEXT NOT NULL,
  changed_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
);

CREATE INDEX idx_status_history_job ON job_status_history(job_id);
CREATE INDEX idx_status_history_date ON job_status_history(changed_at);

-- ============================================
-- Jobs Table Extensions
-- ============================================

-- Add new columns to existing jobs table
ALTER TABLE jobs ADD COLUMN status TEXT DEFAULT 'inbox';
ALTER TABLE jobs ADD COLUMN match_score REAL;
ALTER TABLE jobs ADD COLUMN starred INTEGER DEFAULT 0;
ALTER TABLE jobs ADD COLUMN applied_at TEXT;
ALTER TABLE jobs ADD COLUMN url_hash TEXT;  -- For deduplication

CREATE INDEX idx_jobs_status ON jobs(status);
CREATE INDEX idx_jobs_starred ON jobs(starred);
CREATE INDEX idx_jobs_url_hash ON jobs(url_hash);

-- ============================================
-- Auth Tokens (for Wall-E → Eve auth)
-- ============================================

CREATE TABLE auth_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token_hash TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,                       -- e.g., "wall-e-extension"
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  last_used_at TEXT
);
```

### 5.4 Wall-E API Client (Complete)

```typescript
// extension/wall-e/src/lib/api.ts

const DEFAULT_PORT = 3033;

// Get auth token from chrome.storage
async function getAuthToken(): Promise<string | null> {
  if (typeof chrome !== "undefined" && chrome.storage) {
    return new Promise((resolve) => {
      chrome.storage.local.get(["authToken"], (result) => {
        resolve(result.authToken || null);
      });
    });
  }
  return null;
}

async function getBaseUrl(): Promise<string> {
  if (typeof chrome !== "undefined" && chrome.storage) {
    return new Promise((resolve) => {
      chrome.storage.local.get(["serverPort"], (result) => {
        const port = result.serverPort || DEFAULT_PORT;
        resolve(`http://localhost:${port}`);
      });
    });
  }
  return `http://localhost:${DEFAULT_PORT}`;
}

async function fetchWithAuth(url: string, options: RequestInit = {}): Promise<Response> {
  const token = await getAuthToken();
  const headers = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };
  
  const response = await fetch(url, { ...options, headers });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Eve API error: ${response.status} - ${error}`);
  }
  
  return response;
}

// ============================================
// Types
// ============================================

export type JobStatus = "inbox" | "applied" | "interviewing" | "offer" | "rejected" | "skipped";

export interface Job {
  id: number;
  title: string;
  company: string;
  location: string;
  url: string;
  status: JobStatus;
  matchScore?: number;
  source: "linkedin" | "indeed" | "email" | "manual";
  jdMarkdown?: string;
  createdAt: string;
  appliedAt?: string;
  starred: boolean;
}

export interface JobAnalysis {
  overallScore: number;
  skillsMatch: string[];
  skillsGap: string[];
  suggestions: string[];
  salaryEstimate?: { min: number; max: number; currency: string };
  cached: boolean;
  cachedAt?: string;
}

export interface Resume {
  id: number;
  name: string;
  content: string;
  isDefault: boolean;
  useCount: number;
  source: "paste" | "pdf_upload" | "linkedin";
  parseStatus: "success" | "partial" | "failed" | "parsing";
  parseErrors?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface TailoredResume {
  id: number;
  jobId: number;
  resumeId: number;
  content: string;
  suggestions: Suggestion[];
  version: number;
  isLatest: boolean;
  createdAt: string;
}

export interface Suggestion {
  type: "add" | "modify" | "remove";
  section: string;
  original?: string;
  suggested: string;
  reason: string;
}

export interface JobStats {
  inbox: number;
  applied: number;
  interviewing: number;
  offer: number;
  rejected: number;
  skipped: number;
}

// ============================================
// Jobs API
// ============================================

export async function getJobs(params?: {
  status?: JobStatus;
  starred?: boolean;
  limit?: number;
  offset?: number;
  search?: string;
}): Promise<{ jobs: Job[]; total: number }> {
  const baseUrl = await getBaseUrl();
  const query = new URLSearchParams();
  if (params?.status) query.set("status", params.status);
  if (params?.starred) query.set("starred", "true");
  if (params?.limit) query.set("limit", String(params.limit));
  if (params?.offset) query.set("offset", String(params.offset));
  if (params?.search) query.set("search", params.search);
  
  const res = await fetchWithAuth(`${baseUrl}/jobs?${query}`);
  return res.json();
}

export async function getJobStats(): Promise<JobStats> {
  const baseUrl = await getBaseUrl();
  const res = await fetchWithAuth(`${baseUrl}/jobs/stats`);
  return res.json();
}

export async function getJob(id: number, resumeId?: number): Promise<{ job: Job; analysis?: JobAnalysis }> {
  const baseUrl = await getBaseUrl();
  const query = resumeId ? `?resumeId=${resumeId}` : "";
  const res = await fetchWithAuth(`${baseUrl}/jobs/${id}${query}`);
  return res.json();
}

export async function getJobAnalysis(jobId: number, resumeId: number): Promise<{ analysis: JobAnalysis | null; cached: boolean }> {
  const baseUrl = await getBaseUrl();
  const res = await fetchWithAuth(`${baseUrl}/jobs/${jobId}/analysis?resumeId=${resumeId}`);
  return res.json();
}

export async function analyzeJob(jobId: number, resumeId: number): Promise<{ analysis: JobAnalysis }> {
  const baseUrl = await getBaseUrl();
  const res = await fetchWithAuth(`${baseUrl}/jobs/${jobId}/analyze`, {
    method: "POST",
    body: JSON.stringify({ resumeId }),
  });
  return res.json();
}

export async function updateJob(id: number, data: { status?: JobStatus; starred?: boolean }): Promise<{ job: Job }> {
  const baseUrl = await getBaseUrl();
  const res = await fetchWithAuth(`${baseUrl}/jobs/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function starJob(id: number, starred: boolean): Promise<{ job: Job }> {
  const baseUrl = await getBaseUrl();
  const res = await fetchWithAuth(`${baseUrl}/jobs/${id}/star`, {
    method: "POST",
    body: JSON.stringify({ starred }),
  });
  return res.json();
}

export async function syncJobs(onProgress?: (synced: number, total: number) => void): Promise<{ synced: number; new: number }> {
  const baseUrl = await getBaseUrl();
  const token = await getAuthToken();
  
  return new Promise((resolve, reject) => {
    const eventSource = new EventSource(`${baseUrl}/jobs/sync?token=${token}`);
    
    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === "progress" && onProgress) {
        onProgress(data.synced, data.total);
      } else if (data.type === "complete") {
        eventSource.close();
        resolve({ synced: data.synced, new: data.new });
      } else if (data.type === "error") {
        eventSource.close();
        reject(new Error(data.message));
      }
    };
    
    eventSource.onerror = () => {
      eventSource.close();
      reject(new Error("Sync connection failed"));
    };
  });
}

export async function createJob(data: { title: string; company: string; url: string; location?: string }): Promise<{ job: Job }> {
  const baseUrl = await getBaseUrl();
  const res = await fetchWithAuth(`${baseUrl}/jobs`, {
    method: "POST",
    body: JSON.stringify(data),
  });
  return res.json();
}

// ============================================
// Resumes API
// ============================================

export async function getResumes(): Promise<{ resumes: Resume[] }> {
  const baseUrl = await getBaseUrl();
  const res = await fetchWithAuth(`${baseUrl}/resumes`);
  return res.json();
}

export async function createResume(data: {
  name: string;
  content: string;
  format: "markdown" | "pdf";
  filename?: string;
}): Promise<{ resume: Resume }> {
  const baseUrl = await getBaseUrl();
  const res = await fetchWithAuth(`${baseUrl}/resumes`, {
    method: "POST",
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function getResume(id: number): Promise<{ resume: Resume }> {
  const baseUrl = await getBaseUrl();
  const res = await fetchWithAuth(`${baseUrl}/resumes/${id}`);
  return res.json();
}

export async function getResumeStatus(id: number): Promise<{ parse_status: string; errors?: string[] }> {
  const baseUrl = await getBaseUrl();
  const res = await fetchWithAuth(`${baseUrl}/resumes/${id}/status`);
  return res.json();
}

export async function getResumeVersions(id: number): Promise<{ versions: TailoredResume[] }> {
  const baseUrl = await getBaseUrl();
  const res = await fetchWithAuth(`${baseUrl}/resumes/${id}/versions`);
  return res.json();
}

export async function updateResume(id: number, data: { name?: string; content?: string }): Promise<{ resume: Resume }> {
  const baseUrl = await getBaseUrl();
  const res = await fetchWithAuth(`${baseUrl}/resumes/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function deleteResume(id: number): Promise<{ success: boolean }> {
  const baseUrl = await getBaseUrl();
  const res = await fetchWithAuth(`${baseUrl}/resumes/${id}`, {
    method: "DELETE",
  });
  return res.json();
}

export async function setDefaultResume(id: number): Promise<{ resume: Resume }> {
  const baseUrl = await getBaseUrl();
  const res = await fetchWithAuth(`${baseUrl}/resumes/${id}/default`, {
    method: "POST",
  });
  return res.json();
}

// ============================================
// Tailoring API
// ============================================

export async function tailorResume(jobId: number, resumeId: number): Promise<{
  tailoredResume: TailoredResume;
  suggestions: Suggestion[];
}> {
  const baseUrl = await getBaseUrl();
  const res = await fetchWithAuth(`${baseUrl}/tailor`, {
    method: "POST",
    body: JSON.stringify({ jobId, resumeId }),
  });
  return res.json();
}

export async function getTailoredVersions(jobId: number, resumeId?: number): Promise<{ versions: TailoredResume[] }> {
  const baseUrl = await getBaseUrl();
  const query = resumeId ? `?resumeId=${resumeId}` : "";
  const res = await fetchWithAuth(`${baseUrl}/tailor/${jobId}${query}`);
  return res.json();
}

export async function updateTailoredResume(id: number, content: string): Promise<{ tailoredResume: TailoredResume }> {
  const baseUrl = await getBaseUrl();
  const res = await fetchWithAuth(`${baseUrl}/tailor/${id}`, {
    method: "PUT",
    body: JSON.stringify({ content }),
  });
  return res.json();
}

export async function generatePdf(markdown: string, template?: string): Promise<{ pdf: string; filename: string }> {
  const baseUrl = await getBaseUrl();
  const res = await fetchWithAuth(`${baseUrl}/tailor/pdf`, {
    method: "POST",
    body: JSON.stringify({ markdown, template }),
  });
  return res.json();
}

// ============================================
// Analytics API
// ============================================

export async function getFunnelMetrics(period?: "week" | "month" | "all"): Promise<{
  inbox: number;
  applied: number;
  interview: number;
  offer: number;
  conversionRates: {
    applyRate: number;
    interviewRate: number;
    offerRate: number;
  };
}> {
  const baseUrl = await getBaseUrl();
  const query = period ? `?period=${period}` : "";
  const res = await fetchWithAuth(`${baseUrl}/analytics/funnel${query}`);
  return res.json();
}

export async function getSkillInsights(): Promise<{
  top: { skill: string; matchCount: number }[];
  gaps: { skill: string; mentionCount: number; inResume: boolean }[];
}> {
  const baseUrl = await getBaseUrl();
  const res = await fetchWithAuth(`${baseUrl}/analytics/skills`);
  return res.json();
}

// ============================================
// Export all
// ============================================

export const eveApi = {
  // Jobs
  getJobs,
  getJobStats,
  getJob,
  getJobAnalysis,
  analyzeJob,
  updateJob,
  starJob,
  syncJobs,
  createJob,
  // Resumes
  getResumes,
  createResume,
  getResume,
  getResumeStatus,
  getResumeVersions,
  updateResume,
  deleteResume,
  setDefaultResume,
  // Tailoring
  tailorResume,
  getTailoredVersions,
  updateTailoredResume,
  generatePdf,
  // Analytics
  getFunnelMetrics,
  getSkillInsights,
};

export default eveApi;
```

---

## 6. Implementation Phases (Revised with Buffer)

### Phase 0: Foundation (P0) - Week 1-2 ✅ COMPLETE

| Task | Description | Effort | Status |
|------|-------------|--------|--------|
| Auth handshake | Shared secret token between Wall-E and Eve | 2h | ✅ Done |
| Jobs HTTP API | Add `/jobs` endpoints to Eve server | 6h | ✅ Done |
| Job stats endpoint | `GET /jobs/stats` for header | 1h | ✅ Done |
| Wall-E JobsList real data | Replace mock data with API calls | 3h | ✅ Done |
| Job sync with SSE | `POST /jobs/sync` with progress events | 3h | ✅ Done |
| Basic job filtering | Status filter with real data | 2h | ✅ Done |
| Job deduplication | URL hash-based dedup on sync | 2h | ⬜ Pending |

**Deliverable**: Jobs tab shows real data from Eve with auth

**Effort**: ~19h (with 30% buffer: ~25h)

### Phase 1: Resume Core (P0) - Week 2-3 ✅ COMPLETE

| Task | Description | Effort | Status |
|------|-------------|--------|--------|
| Resume DB schema | Create tables with migrations | 2h | ✅ Done |
| Resume capability | Create `src/capabilities/resume/` | 6h | ✅ Done |
| Resume HTTP API | Add `/resumes` endpoints | 4h | ✅ Done |
| Resume import (MD) | Markdown paste/upload | 2h | ✅ Done |
| Resume import (PDF) | PDF parsing with pdftotext | 4h | ✅ Done |
| Parse status handling | Status polling, error display | 3h | ✅ Done |
| Wall-E Resume tab | Resume library UI | 4h | ✅ Done |

**Deliverable**: Users can import and manage resumes with error handling

**Effort**: ~25h (with 30% buffer: ~33h)

### Phase 2: Job Analysis (P1) - Week 3-4 ✅ COMPLETE

| Task | Description | Effort | Status |
|------|-------------|--------|--------|
| Analysis cache schema | Create `job_analysis` table | 1h | ✅ Done |
| Analysis caching | Cache by job_id + resume_id + prompt_hash | 3h | ✅ Done |
| Job detail drawer | Full info with inline resume selector | 5h | ✅ Done |
| Match analysis display | Show score, skills, gaps | 4h | ✅ Done |
| Keyword pre-score | Lightweight matching without LLM | 3h | ✅ Done |
| Quick triage actions | Skip/Star/Analyze in list | 2h | ✅ Done |
| Job status updates | Dropdown with status history | 3h | ✅ Done |

**Deliverable**: Users can see match analysis with caching

**Effort**: ~21h (with 30% buffer: ~28h)

### Phase 2.5: Wall-E Basic Integration ✅ COMPLETE (Added)

| Task | Description | Effort | Status |
|------|-------------|--------|--------|
| JobsList real data | Replace mock data with API integration | 2h | ✅ Done |
| Resume tab UI | Implement resume library with API | 3h | ✅ Done |
| Job detail drawer | Create drawer component with analysis | 4h | ✅ Done |
| Quick triage buttons | Skip/Star/Analyze actions | 2h | ✅ Done |

**Deliverable**: Wall-E fully integrated with Eve backend APIs

**Effort**: ~11h

### Phase 3: Workspace Enhancement (P1) - Week 4-5 ✅ COMPLETE

| Task | Description | Effort | Status |
|------|-------------|--------|--------|
| Workspace refactor | Add resume selector, job context | 4h | ✅ Done |
| Tailored resume schema | Versioning support | 2h | ✅ Done |
| Gap analysis panel | Show skill gaps | 5h | ✅ Done |
| AI suggestions | Inline edit suggestions | 8h | ✅ Done |
| Version history | Save/switch versions | 3h | ✅ Done |
| Save tailored version | Persist per job with version | 3h | ✅ Done |

**Deliverable**: Full resume tailoring workflow with versions

**Effort**: ~25h (with 30% buffer: ~33h)

### Phase 3.5: Editor Experience Upgrade (P2) - Week 5

| Task | Description | Effort | Status |
|------|-------------|--------|--------|
| Milkdown integration | Replace Textarea with Milkdown WYSIWYG editor | 6h | ⬜ Pending |
| Theme customization | Apply Eve (Nord/Clean) theme to editor | 3h | ⬜ Pending |
| Toolbar plugins | Add slash commands and formatting toolbar | 4h | ⬜ Pending |
| Split-view sync | Sync scroll between preview and editor | 3h | ⬜ Pending |

**Deliverable**: Premium editing experience for resumes

**Effort**: ~16h

### Phase 4: PDF & Analytics (P2) - Week 5-6

| Task | Description | Effort | Status |
|------|-------------|--------|--------|
| PDF generation | Playwright backend with templates | 8h | |
| PDF caching | Cache per tailored version | 2h | |
| Resume library polish | Parse status, usage stats | 3h | |
| Analytics funnel | Status history queries | 4h | |
| Analytics skills | Skill extraction and matching | 4h | |
| Analytics UI | Modal with charts | 5h | |

**Deliverable**: Complete feature set with PDF and analytics

**Effort**: ~26h (with 30% buffer: ~34h)

### Phase 5: Offline & Polish (P2) - Week 6-7

| Task | Description | Effort | Status |
|------|-------------|--------|--------|
| Chrome storage cache | Cache jobs/resumes for offline | 4h | |
| Offline indicator | Show when Eve is unavailable | 2h | |
| Action queue | Queue sync/analyze for online | 3h | |
| Error recovery | Retry logic, user feedback | 4h | |
| Security audit | XSS prevention, input validation | 3h | |

**Deliverable**: Robust offline support and error handling

**Effort**: ~16h (with 30% buffer: ~21h)

### Phase 6: Auto-Apply (P3) - Future

| Task | Description | Effort | Status |
|------|-------------|--------|--------|
| Content script injection | Detect ATS pages | 10h | |
| Form field mapping | UAP schema | 15h | |
| Auto-fill implementation | Wall-E automation | 20h | |
| LinkedIn Easy Apply | First ATS integration | 12h | |

**Deliverable**: Semi-automated job applications

---

## 7. Error Handling Matrix

| Scenario | Detection | Handling | User Feedback |
|----------|-----------|----------|---------------|
| Eve offline | Fetch timeout/error | Use cached data, queue actions | "Offline mode" banner |
| PDF parsing failure | parse_status = "failed" | Store partial content | "Parse failed" + "Paste manually" button |
| PDF parsing partial | parse_status = "partial" | Store with warnings | "Some content may be missing" + "Edit to fix" |
| PDF too large (>20MB) | Client-side check | Reject before upload | "File too large (max 20MB)" |
| LLM analysis timeout | 60s timeout | Retry once, then fail | "Analysis failed" + "Retry" button |
| LLM rate limit | 429 response | Exponential backoff | "Please wait..." with countdown |
| Firecrawl 429 | 429 response | Queue with 2s delay | "Enriching..." status on job |
| Sync double-click | Debounce + idempotency | Ignore duplicate requests | Single sync progress |
| Job already exists | url_hash collision | Update instead of insert | No duplicate shown |
| Auth failure | 401 response | Clear token, show settings | "Reconnect to Eve" prompt |

---

## 8. Security Considerations

### 8.1 Authentication

- **Shared Secret**: Generate random token on first Wall-E setup
- **Storage**: Eve stores hash in `auth_tokens` table, Wall-E stores in `chrome.storage.local`
- **Transmission**: `Authorization: Bearer <token>` header on all requests
- **Rotation**: User can regenerate token in settings

### 8.2 CORS & Network

- **Origin Whitelist**: Only allow `chrome-extension://<extension-id>` and `localhost`
- **Port Binding**: Eve binds to `127.0.0.1` only (no external access)
- **Request Limits**: 10MB max body size, 100 req/min rate limit

### 8.3 Input Validation

- **Markdown Sanitization**: Use DOMPurify before rendering JD/resume
- **SQL Injection**: Use parameterized queries (SQLite prepared statements)
- **XSS Prevention**: Escape all user content in React

### 8.4 Data Privacy

- **Local-First**: All data stored in local SQLite, never sent externally
- **LLM Calls**: Only JD + resume content sent to configured LLM provider
- **No Telemetry**: No analytics or tracking

---

## 9. Success Metrics

| Metric | Target | Measurement | Escalation Threshold |
|--------|--------|-------------|---------------------|
| Resume import success rate | >95% | `parse_status = success` | <90% → Add OCR |
| Time to tailored resume | <2 min | Workspace open → PDF download | >3 min → Optimize |
| Match score accuracy | >80% | User star/skip correlation | <70% → Improve prompts |
| Application funnel visibility | 100% | All jobs have status history | <95% → Fix tracking |
| Analysis cache hit rate | >60% | Cached lookups / total | <50% → Adjust invalidation |
| Offline availability | >99% | Cache age < 1 hour | <95% → More aggressive caching |
| LLM cost per user/day | <$0.50 | Token usage tracking | >$0.50 → Tighten caching |
| Job analysis latency | <30s | Request to response | >2 min → Async queue |

---

## 10. Appendix

### A. Data Models (TypeScript)

```typescript
// See Section 5.4 for complete type definitions
```

### B. Component Tree

```
Wall-E Extension
├── SidePanel (/)
│   ├── Header
│   │   └── ConnectionStatus (online/offline indicator)
│   ├── TabNavigation [Chat, Jobs, Resume]
│   ├── Chat (tab)
│   ├── JobsList (tab)
│   │   ├── StatsHeader (embedded analytics)
│   │   ├── SearchBar
│   │   ├── StatusFilters
│   │   ├── JobCard[]
│   │   │   └── QuickTriageButtons [Skip, Star, Analyze]
│   │   ├── JobDetailDrawer
│   │   │   ├── ResumeSelector (inline)
│   │   │   ├── MatchAnalysis
│   │   │   ├── JDPreview
│   │   │   ├── StatusDropdown
│   │   │   └── ActionButtons
│   │   └── StatsModal
│   │       ├── FunnelChart
│   │       └── SkillInsights
│   └── ResumeLibrary (tab)
│       ├── ImportButton
│       │   ├── UploadZone (drag & drop)
│       │   └── PasteModal
│       ├── ResumeCard[]
│       │   └── ParseStatus indicator
│       └── ResumePreviewModal
│
└── Workspace (/workspace)
    ├── Header [Save, Build PDF]
    ├── SplitView
    │   ├── JDPanel
    │   │   ├── JDContent
    │   │   ├── MatchScore
    │   │   └── GapAnalysis
    │   └── ResumeEditor
    │       ├── MarkdownEditor
    │       └── AISuggestions (inline)
    └── VersionHistory
```

### C. Migration Scripts

```sql
-- Migration 001: Add resume and analysis tables
-- See Section 5.3 for complete schema

-- Migration 002: Add jobs extensions
ALTER TABLE jobs ADD COLUMN status TEXT DEFAULT 'inbox';
ALTER TABLE jobs ADD COLUMN match_score REAL;
ALTER TABLE jobs ADD COLUMN starred INTEGER DEFAULT 0;
ALTER TABLE jobs ADD COLUMN applied_at TEXT;
ALTER TABLE jobs ADD COLUMN url_hash TEXT;

-- Migration 003: Create indexes
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_starred ON jobs(starred);
CREATE INDEX IF NOT EXISTS idx_jobs_url_hash ON jobs(url_hash);
```

---

## 11. Oracle Review Summary (2026-01-19)

### Assessment: ✅ Approved with Refinements (All Incorporated)

**Key Changes Made Based on Oracle Review**:

1. ✅ Added auth handshake requirement to P0
2. ✅ Added `job_analysis` cache table with prompt hashing
3. ✅ Added `job_status_history` table for funnel analytics
4. ✅ Added resume parse status and error handling flow
5. ✅ Added job deduplication via URL hash
6. ✅ Added keyword-based pre-score for list view
7. ✅ Added inline resume selector in job detail
8. ✅ Embedded analytics summary in Jobs tab header
9. ✅ Added 30-50% buffer to all effort estimates
10. ✅ Added escalation triggers and thresholds
11. ✅ Added complete error handling matrix
12. ✅ Added security considerations section
13. ✅ Added offline mode with action queuing
14. ✅ Added tailored resume versioning

---

*Document reviewed and approved by Oracle. Ready for implementation.*
