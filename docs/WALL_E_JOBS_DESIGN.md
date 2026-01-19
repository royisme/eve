# Wall-E Jobs Feature Design

> **Status**: Reviewed  
> **Author**: AI Assistant  
> **Date**: 2026-01-19  
> **Reviewers**: Oracle (completed 2026-01-19)

## 1. Executive Summary

This document outlines the design for implementing comprehensive job-hunting features through Wall-E (Chrome Extension), focusing on:

- **Resume Import & Management**: Multi-resume library with PDF/Markdown support
- **Job Analysis & Matching**: LLM-powered fit scoring and gap analysis
- **Application Workflow**: Tailored resume generation and tracking
- **Analytics Dashboard**: Funnel metrics and skill insights

---

## 2. Current State Analysis

### 2.1 Wall-E Components

| Component | Current State | Issues |
|-----------|---------------|--------|
| **JobsList.tsx** | Mock data, no real API | Needs Eve backend connection |
| **Workspace.tsx** | JD ↔ Resume comparison only | Single-purpose, lacks resume management |
| **api.ts** | Only chat/health/status | Missing jobs/resume endpoints |
| **TabNavigation** | Chat, Jobs, Resume tabs | Resume tab just opens Workspace |

### 2.2 Eve Backend Capabilities

| Capability | Tools | Status |
|------------|-------|--------|
| **jobs** | jobs_search, jobs_list, jobs_enrich, jobs_analyze | ✅ Implemented |
| **email** | email_status, email_setup, email_sync | ✅ Implemented |
| **resume** | (none) | ❌ Not implemented |

### 2.3 Gap Analysis

1. **No Resume Capability**: Eve lacks tools for resume CRUD operations
2. **No REST API for Jobs**: Only agent tools, no direct HTTP endpoints
3. **No PDF Generation**: Neither Eve nor Wall-E can generate PDFs
4. **Mock Data in Wall-E**: JobsList uses hardcoded mock data

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

| ID | As a... | I want to... | So that... |
|----|---------|--------------|------------|
| US1 | Job seeker | Import my resume (PDF/Markdown) | Eve can analyze and tailor it |
| US2 | Job seeker | See all job opportunities in one place | I don't miss any opportunity |
| US3 | Job seeker | Know my match score for each job | I can prioritize applications |
| US4 | Job seeker | Get suggestions to improve my resume | I have better chances |
| US5 | Job seeker | Track my application status | I know where I stand |
| US6 | Job seeker | See my application funnel metrics | I can improve my strategy |
| US7 | Job seeker | Generate tailored resume per job | I present my best fit |
| US8 | Job seeker | Manage multiple resume versions | I can apply to different roles |

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
| **Jobs** | Job opportunity kanban board | Manage all opportunities, filter by status |
| **Resume** | Resume library management | Import, edit, manage multiple resumes |

### 4.2 Jobs Tab Design

#### 4.2.1 Jobs List View

```
┌──────────────────────────────────────────────────────────────┐
│ 🔍 Search...                          [🔄 Sync] [📊 Stats]  │
├──────────────────────────────────────────────────────────────┤
│ [All] [Inbox] [Applied] [Interview] [Offer]                  │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│ ┌──────────────────────────────────────────────────────────┐ │
│ │ ⭐ Staff Engineer @ Aurora Solar                         │ │
│ │ 📍 Canada (Remote) · 💰 $180-220k · 🎯 92% Match        │ │
│ │ 📅 Today · [Analyze] [Apply] [...]                      │ │
│ └──────────────────────────────────────────────────────────┘ │
│                                                              │
│ ┌──────────────────────────────────────────────────────────┐ │
│ │ 🆕 Senior Frontend @ Shopify                             │ │
│ │ 📍 Toronto · 💰 $160-180k · 🎯 85% Match                │ │
│ │ 📅 Yesterday · [Analyze] [Apply] [...]                  │ │
│ └──────────────────────────────────────────────────────────┘ │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

**Key Interactions**:
- **Sync Button**: Calls `POST /jobs/sync` → triggers `email_sync`
- **Match %**: From Eve's `jobs_analyze` tool output
- **Analyze**: Deep analysis for single job
- **Apply**: Opens Workspace for resume tailoring

#### 4.2.2 Job Detail View (Drawer/Modal)

```
┌──────────────────────────────────────────────────────────────┐
│ ← Back                                      [⭐] [🗑️]       │
├──────────────────────────────────────────────────────────────┤
│ Staff Software Engineer                                      │
│ Aurora Solar · Canada (Remote)                               │
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
│           [🚀 Tailor Resume & Apply]                         │
└──────────────────────────────────────────────────────────────┘
```

### 4.3 Resume Tab Design

#### 4.3.1 Resume Library (Side Panel)

```
┌──────────────────────────────────────────────────────────────┐
│ 📄 My Resumes                              [+ Import]        │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│ ┌──────────────────────────────────────────────────────────┐ │
│ │ 📄 Master Resume (Default)                    ⭐         │ │
│ │ Updated: Jan 15 · Used: 23 times                         │ │
│ │ [Edit] [Preview] [Set Default]                           │ │
│ └──────────────────────────────────────────────────────────┘ │
│                                                              │
│ ┌──────────────────────────────────────────────────────────┐ │
│ │ 📄 Frontend Focus                                        │ │
│ │ Updated: Jan 10 · Used: 8 times                          │ │
│ │ [Edit] [Preview] [Delete]                                │ │
│ └──────────────────────────────────────────────────────────┘ │
│                                                              │
│ ┌──────────────────────────────────────────────────────────┐ │
│ │ 📄 Backend/Infra                                         │ │
│ │ Updated: Jan 5 · Used: 5 times                           │ │
│ │ [Edit] [Preview] [Delete]                                │ │
│ └──────────────────────────────────────────────────────────┘ │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

**Import Methods**:
- **PDF Upload**: Drag & drop or click to upload, Eve parses to Markdown
- **Paste Markdown**: Direct paste of Markdown-formatted resume
- **LinkedIn Import**: (Future) Import from LinkedIn Profile

#### 4.3.2 Workspace Enhancement (Full Page)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ 📄 Resume Workspace                                [Save] [Build PDF]       │
├────────────────────────────────┬────────────────────────────────────────────┤
│ 📋 Job Description             │ 📝 Tailored Resume                         │
│ ────────────────────────────── │ ────────────────────────────────────────── │
│                                │                                            │
│ **Aurora Solar**               │ # Roy Zhu                                  │
│ Staff Software Engineer        │ Staff Software Engineer                    │
│                                │                                            │
│ We're looking for...           │ ## Summary                                 │
│ - 5+ years TypeScript          │ 8+ years building scalable...              │
│ - React, Node.js               │                                            │
│ - Python is a plus             │ ## Experience                              │
│                                │ **Shopify** - Staff Engineer               │
│ ─────────────────────          │ - Led frontend architecture...             │
│ 🎯 Match: 92%                  │                                            │
│ ✅ TS, React, Node             │ [AI suggestion highlighting               │
│ ⚠️ Python gap                  │  appears inline with edits]               │
│                                │                                            │
│ ─────────────────────          │                                            │
│ 💡 Eve's Suggestions:          │                                            │
│ "Add your Python side project  │                                            │
│  from 2023 hackathon"          │                                            │
│                                │                                            │
└────────────────────────────────┴────────────────────────────────────────────┘
```

**New Features**:
1. **AI Inline Suggestions**: Eve highlights recommended edits in the editor
2. **Gap Analysis Panel**: Shows skill gaps between JD and resume
3. **Build PDF**: One-click PDF generation
4. **Version History**: Save each tailored version per job

### 4.4 Analytics Dashboard

```
┌──────────────────────────────────────────────────────────────┐
│ 📊 Application Analytics                   [This Week ▾]    │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────┐ │
│ │   📥 45     │ │   ✅ 23     │ │   💬 5      │ │  🎉 2   │ │
│ │   Inbox     │ │  Applied    │ │ Interviews  │ │ Offers  │ │
│ └─────────────┘ └─────────────┘ └─────────────┘ └─────────┘ │
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

### 5.1 New Eve HTTP API Endpoints

```typescript
// ============================================
// Jobs API
// ============================================

// List jobs with filtering
GET /jobs
  Query: ?status=inbox|applied|interviewing|offer|rejected
         &limit=20
         &offset=0
         &search=keyword
  Response: { jobs: Job[], total: number }

// Get single job with analysis
GET /jobs/:id
  Response: { job: Job, analysis?: JobAnalysis }

// Trigger LLM analysis for a job
POST /jobs/:id/analyze
  Body: { resumeId?: string }
  Response: { analysis: JobAnalysis }

// Update job status
PATCH /jobs/:id
  Body: { status: "applied" | "interviewing" | "offer" | "rejected" }
  Response: { job: Job }

// Trigger email sync
POST /jobs/sync
  Response: { synced: number, new: number }

// ============================================
// Resumes API
// ============================================

// List all resumes
GET /resumes
  Response: { resumes: Resume[] }

// Create/import resume
POST /resumes
  Body: { name: string, content: string, format: "markdown" | "pdf" }
  Response: { resume: Resume }

// Get single resume
GET /resumes/:id
  Response: { resume: Resume }

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
  Body: { jobId: string, resumeId: string }
  Response: { tailored: string, suggestions: Suggestion[] }

// Generate PDF from markdown
POST /tailor/pdf
  Body: { markdown: string, template?: string }
  Response: { pdf: base64string, filename: string }

// ============================================
// Analytics API
// ============================================

// Get funnel metrics
GET /analytics/funnel
  Query: ?period=week|month|all
  Response: { inbox: number, applied: number, interview: number, offer: number }

// Get skill insights
GET /analytics/skills
  Response: { top: Skill[], gaps: Skill[] }
```

### 5.2 New Eve Capability: Resume

```typescript
// src/capabilities/resume/index.ts
export const resumeCapability: Capability = {
  name: "resume",
  description: "Resume management - import, edit, and tailor resumes",
  tools: [
    resumeListTool,      // List all resumes
    resumeImportTool,    // Import from PDF/Markdown
    resumeGetTool,       // Get resume by ID
    resumeUpdateTool,    // Update resume content
    resumeDeleteTool,    // Delete resume
    resumeTailorTool,    // Generate tailored version for a job
  ],
};
```

### 5.3 Database Schema Extensions

```sql
-- Resumes table
CREATE TABLE resumes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  content TEXT NOT NULL,           -- Markdown content
  is_default INTEGER DEFAULT 0,
  use_count INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Tailored resumes (per job application)
CREATE TABLE tailored_resumes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER NOT NULL,
  resume_id INTEGER NOT NULL,
  content TEXT NOT NULL,           -- Tailored markdown
  suggestions TEXT,                -- JSON array of suggestions
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (job_id) REFERENCES jobs(id),
  FOREIGN KEY (resume_id) REFERENCES resumes(id)
);

-- Job status tracking (extend existing jobs table)
ALTER TABLE jobs ADD COLUMN status TEXT DEFAULT 'inbox';
ALTER TABLE jobs ADD COLUMN match_score REAL;
ALTER TABLE jobs ADD COLUMN applied_at TEXT;
ALTER TABLE jobs ADD COLUMN starred INTEGER DEFAULT 0;
```

### 5.4 Wall-E API Client Extensions

```typescript
// extension/wall-e/src/lib/api.ts

// Jobs API
export async function getJobs(params?: JobsQueryParams): Promise<JobsResponse>;
export async function getJob(id: string): Promise<JobDetailResponse>;
export async function analyzeJob(id: string, resumeId?: string): Promise<AnalysisResponse>;
export async function updateJobStatus(id: string, status: JobStatus): Promise<Job>;
export async function syncJobs(): Promise<SyncResponse>;

// Resumes API
export async function getResumes(): Promise<ResumesResponse>;
export async function createResume(data: CreateResumeRequest): Promise<Resume>;
export async function getResume(id: string): Promise<Resume>;
export async function updateResume(id: string, data: UpdateResumeRequest): Promise<Resume>;
export async function deleteResume(id: string): Promise<void>;
export async function setDefaultResume(id: string): Promise<Resume>;

// Tailoring API
export async function tailorResume(jobId: string, resumeId: string): Promise<TailorResponse>;
export async function generatePdf(markdown: string): Promise<PdfResponse>;

// Analytics API
export async function getFunnelMetrics(period?: string): Promise<FunnelMetrics>;
export async function getSkillInsights(): Promise<SkillInsights>;
```

---

## 6. Implementation Phases

### Phase 0: Foundation (P0) - Week 1

| Task | Description | Effort |
|------|-------------|--------|
| Jobs HTTP API | Add `/jobs` endpoints to Eve server | 4h |
| Wall-E JobsList real data | Replace mock data with API calls | 2h |
| Job sync button | Connect to `POST /jobs/sync` | 1h |
| Basic job filtering | Status filter with real data | 2h |

**Deliverable**: Jobs tab shows real data from Eve

### Phase 1: Resume Core (P0) - Week 2

| Task | Description | Effort |
|------|-------------|--------|
| Resume capability | Create `src/capabilities/resume/` | 4h |
| Resume DB schema | Add tables for resumes | 1h |
| Resume HTTP API | Add `/resumes` endpoints | 3h |
| Resume import (MD) | Markdown paste/upload | 2h |
| Resume import (PDF) | PDF parsing with pdftotext | 3h |

**Deliverable**: Users can import and manage resumes

### Phase 2: Job Analysis (P1) - Week 3

| Task | Description | Effort |
|------|-------------|--------|
| Job detail view | Drawer/modal with full info | 4h |
| Match analysis display | Show score, skills, gaps | 3h |
| Analyze button | Trigger LLM analysis | 2h |
| Job status updates | Applied, interviewing, etc. | 2h |

**Deliverable**: Users can see match analysis and update status

### Phase 3: Workspace Enhancement (P1) - Week 4

| Task | Description | Effort |
|------|-------------|--------|
| Workspace refactor | Add resume selector | 3h |
| Gap analysis panel | Show skill gaps | 4h |
| AI suggestions | Inline edit suggestions | 6h |
| Save tailored version | Persist per job | 2h |

**Deliverable**: Full resume tailoring workflow

### Phase 4: PDF & Polish (P2) - Week 5

| Task | Description | Effort |
|------|-------------|--------|
| PDF generation | Puppeteer/Playwright backend | 6h |
| Resume library UI | Multi-resume management | 4h |
| Analytics dashboard | Funnel + skill insights | 6h |

**Deliverable**: Complete feature set

### Phase 5: Auto-Apply (P3) - Future

| Task | Description | Effort |
|------|-------------|--------|
| Content script injection | Detect ATS pages | 8h |
| Form field mapping | UAP schema | 12h |
| Auto-fill implementation | Wall-E automation | 16h |

**Deliverable**: Semi-automated job applications

---

## 7. Key Design Decisions

### 7.1 Resume Storage Location

| Option | Pros | Cons | Decision |
|--------|------|------|----------|
| Eve SQLite | Unified data, easy backup, TUI access | Requires Eve running | ✅ **Primary** |
| Chrome Storage | Works offline, privacy | 5MB limit, no TUI access | Cache only |

**Decision**: Store in Eve SQLite, cache active resume in Chrome Storage for offline viewing.

### 7.2 PDF Generation

| Option | Pros | Cons | Decision |
|--------|------|------|----------|
| Frontend (jsPDF) | No server needed | Limited styling, complex | ❌ |
| Eve Backend (Puppeteer) | Full control, templates | Requires Puppeteer | ✅ **Chosen** |
| External Service | High quality | Cost, privacy | ❌ |

**Decision**: Use Puppeteer in Eve backend for PDF generation. Template-based for consistency.

### 7.3 Real-time Updates

| Option | Pros | Cons | Decision |
|--------|------|------|----------|
| Polling | Simple | Inefficient, delayed | For analytics only |
| WebSocket | Real-time | Complex, connection mgmt | ❌ |
| Server-Sent Events | Simple, real-time | One-way only | ✅ For job sync |

**Decision**: SSE for job sync progress, polling for analytics (less frequent updates).

### 7.4 ATS Auto-Apply Priority

| ATS | Complexity | User Value | Priority |
|-----|------------|------------|----------|
| LinkedIn Easy Apply | Low | Very High | P3.1 |
| Greenhouse | Medium | High | P3.2 |
| Lever | Medium | High | P3.3 |
| Workday | High | Medium | P3.4 |

---

## 8. Open Questions for Review

### 8.1 Architecture Questions

1. **Should resume analysis be a separate capability or part of jobs?**
   - Current design: Separate `resume` capability
   - Alternative: Merge into `jobs` for tighter coupling

2. **How to handle large PDF uploads?**
   - Current: Direct upload to Eve
   - Alternative: Chunked upload, background processing

3. **Should tailored resumes be versioned?**
   - Current: One tailored version per job
   - Alternative: Full version history with diffs

### 8.2 UX Questions

1. **Should job match analysis be automatic or on-demand?**
   - Automatic: Better UX, higher LLM cost
   - On-demand: Lower cost, more friction

2. **How to handle resume import failures (corrupted PDF)?**
   - Fallback to manual paste?
   - Show partial content with warnings?

3. **Should analytics be a separate tab or embedded in Jobs?**
   - Separate: Cleaner, focused
   - Embedded: More discoverable

### 8.3 Technical Questions

1. **PDF parsing accuracy**: pdftotext vs commercial OCR?
2. **LLM cost optimization**: Cache analysis results? Batch processing?
3. **Offline mode**: What features should work without Eve running?

---

## 9. Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Resume import success rate | >95% | PDF parsed correctly |
| Time to tailored resume | <2 min | From job click to PDF |
| Match score accuracy | >80% | User-validated scores |
| Application funnel visibility | 100% | All jobs tracked |
| User engagement | >3 jobs/week | Active job management |

---

## 10. Appendix

### A. Data Models

```typescript
interface Job {
  id: number;
  title: string;
  company: string;
  location: string;
  url: string;
  status: "inbox" | "applied" | "interviewing" | "offer" | "rejected";
  matchScore?: number;
  source: "linkedin" | "indeed" | "email" | "manual";
  jdMarkdown?: string;
  createdAt: string;
  appliedAt?: string;
  starred: boolean;
}

interface JobAnalysis {
  overallScore: number;
  skillsMatch: string[];
  skillsGap: string[];
  suggestions: string[];
  salaryEstimate?: { min: number; max: number; currency: string };
}

interface Resume {
  id: number;
  name: string;
  content: string;  // Markdown
  isDefault: boolean;
  useCount: number;
  createdAt: string;
  updatedAt: string;
}

interface TailoredResume {
  id: number;
  jobId: number;
  resumeId: number;
  content: string;
  suggestions: Suggestion[];
  createdAt: string;
}

interface Suggestion {
  type: "add" | "modify" | "remove";
  section: string;
  original?: string;
  suggested: string;
  reason: string;
}
```

### B. Component Tree

```
Wall-E Extension
├── SidePanel (/)
│   ├── Header
│   ├── TabNavigation [Chat, Jobs, Resume]
│   ├── Chat (tab)
│   ├── JobsList (tab)
│   │   ├── SearchBar
│   │   ├── StatusFilters
│   │   ├── JobCard[]
│   │   └── JobDetailDrawer
│   │       ├── MatchAnalysis
│   │       ├── JDPreview
│   │       └── ActionButtons
│   └── ResumeLibrary (tab)
│       ├── ImportButton
│       ├── ResumeCard[]
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
    │       └── AISuggestions
    └── VersionHistory
```

---

## 11. Oracle Review Summary (2026-01-19)

### 11.1 Architecture Validation

**Overall Assessment**: ✅ Approved with refinements

> The overall split between Eve (data/LLM/processing) and Wall-E (UI/interaction) is correct. The proposed REST layer is necessary for a structured UI.

**Key Recommendations**:

1. **SDUI vs Client-Driven UI**: Decide explicitly whether Jobs/Resume screens are SDUI (server-driven) or conventional React. The repo mentions SDUI in PRD but this design assumes client-driven. Mixing is OK but needs explicit decision.

2. **Additional API Endpoints Needed**:
   ```typescript
   GET /jobs/:id/analysis?resumeId=...  // Cached lookup without re-compute
   POST /jobs/:id/star                   // Or allow in PATCH
   GET /jobs/stats                       // Basic counts for Jobs tab header
   GET /resumes/:id/versions             // If version history is planned
   ```

3. **Auth Handshake**: Add Wall-E → Eve authentication (shared secret token or localhost-only binding) to P0.

### 11.2 Database Schema Enhancements

**Missing Tables** (add to schema):

```sql
-- Job analysis cache (avoids re-computing)
CREATE TABLE job_analysis (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER NOT NULL,
  resume_id INTEGER NOT NULL,
  model TEXT NOT NULL,              -- LLM model used
  prompt_hash TEXT NOT NULL,        -- For cache invalidation
  result TEXT NOT NULL,             -- JSON analysis result
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (job_id) REFERENCES jobs(id),
  FOREIGN KEY (resume_id) REFERENCES resumes(id),
  UNIQUE(job_id, resume_id, prompt_hash)
);

-- Job status history (for funnel analytics)
CREATE TABLE job_status_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER NOT NULL,
  status TEXT NOT NULL,
  changed_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (job_id) REFERENCES jobs(id)
);

-- Enhanced resumes table
ALTER TABLE resumes ADD COLUMN source TEXT DEFAULT 'paste';      -- paste, pdf_upload, linkedin
ALTER TABLE resumes ADD COLUMN original_filename TEXT;
ALTER TABLE resumes ADD COLUMN parse_status TEXT DEFAULT 'success';  -- success, partial, failed
ALTER TABLE resumes ADD COLUMN parse_errors TEXT;                -- JSON array of errors

-- Support multiple tailored versions per job
ALTER TABLE tailored_resumes ADD COLUMN version INTEGER DEFAULT 1;
ALTER TABLE tailored_resumes ADD COLUMN is_latest INTEGER DEFAULT 1;
```

### 11.3 Missing Edge Cases & Error Handling

**Features to Add**:
- **Job Deduplication**: Same job from email + web (same URL/title) should merge
- **Resume Parse Status**: Show parsing progress and retry flow for failed PDFs
- **Analysis Cache Invalidation**: Re-analyze when resume content changes
- **Manual Job Creation**: Add jobs not from email sources

**Error Handling Scenarios**:
| Scenario | Handling |
|----------|----------|
| PDF parsing failure | Show partial text + "Paste manually" fallback |
| PDF timeout (>30s) | Background process with status polling |
| Oversized PDF (>20MB) | Reject with size limit message |
| LLM failure/timeout | Retry once, then show error with manual retry button |
| Firecrawl 429 | Queue with backoff, show "enriching..." status |
| Sync double-click | Idempotency key, debounce on client |

**Security Considerations**:
- CORS restrictions: Whitelist localhost only
- Sanitize markdown→HTML rendering (XSS prevention)
- Encrypt sensitive Chrome Storage data
- Add request size limits to Eve endpoints

### 11.4 Technical Recommendations

**PDF Generation**: 
- ✅ Backend Puppeteer/Playwright is correct choice
- Prefer Playwright if already in codebase
- Cache generated PDFs per tailored version
- Only generate on explicit user action

**Real-time Updates**:
- ✅ SSE for sync progress is good
- Polling for analytics (less frequent)
- Avoid WebSocket complexity

**LLM Cost Optimization**:
| Strategy | Implementation |
|----------|----------------|
| Cache analysis | Store by `(job_id, resume_id, prompt_hash)` |
| Lightweight pre-score | Keyword matching without LLM for list view |
| Model tiering | Smaller models for extraction, larger for tailoring |
| On-demand analysis | Auto-analyze only starred or applied jobs |

### 11.5 UX Improvements

**Quick Triage Mode**: Add to Jobs list:
- One-click "Skip/Star/Analyze" actions
- Show lightweight keyword-based score before full LLM analysis

**Reduce Context Switching**:
- Add inline "resume selector" in Job Detail drawer
- Embed analytics summary widget in Jobs tab header

**Import Failure Flow**:
```
PDF Upload → Parse Attempt → 
  ├─ Success → Show resume
  ├─ Partial → Show content + warnings + "Edit to fix" button
  └─ Failed → Show "Paste manually" fallback with error details
```

**Offline Mode**:
- Read-only access to cached jobs/resumes
- Queue actions (sync/analyze) for when Eve comes online
- Show clear "Offline" indicator

### 11.6 Answers to Open Questions

#### 8.1 Architecture Questions

| Question | Answer |
|----------|--------|
| Resume capability separate or in jobs? | **Separate**. Jobs should consume resume tools, not own them. Cleaner separation of concerns. |
| Large PDF uploads? | **Direct upload + size limit (20MB)**. Background parsing with status. Add chunked upload later only if needed. |
| Tailored resume versioning? | **Yes, store multiple versions** per job with `is_latest` flag. Lightweight and supports experimentation. |

#### 8.2 UX Questions

| Question | Answer |
|----------|--------|
| Match analysis auto vs on-demand? | **On-demand by default**. Auto-analyze only for starred or "Applied" jobs to control LLM cost. |
| Resume import failures? | **Show partial text + "Paste manually" fallback**. Display parse error details and retry option. |
| Analytics location? | **Embed summary in Jobs tab header**. Add deeper analytics page later if usage warrants it. |

#### 8.3 Technical Questions

| Question | Answer |
|----------|--------|
| PDF parsing accuracy? | **Start with pdftotext**. Add optional OCR button only for scanned PDFs. |
| LLM cost optimization? | **Cache results + prompt hashing + model tiering + on-demand**. Batch enrichment tasks if volume grows. |
| Offline mode? | **Read-only cached views + queued actions**. Clear offline indicator in UI. |

### 11.7 Revised Implementation Phases

**Updated P0 (Week 1)** - Add:
- [ ] Auth handshake (shared token) between Wall-E and Eve
- [ ] Job analysis caching schema
- [ ] Basic job stats endpoint for header

**Updated P1 (Week 2)** - Add:
- [ ] Resume parse status and error handling
- [ ] Job deduplication logic

**Effort Adjustment**: Add 30-50% buffer to all estimates for schema migrations, parsing reliability, and UI polish.

### 11.8 Escalation Triggers

Monitor these metrics and escalate if thresholds are breached:

| Metric | Threshold | Escalation |
|--------|-----------|------------|
| Resume parsing success | <90% | Add OCR or dedicated parsing service |
| Job analysis latency | >2 min | Add async queue + status UI |
| LLM cost per user/day | >$0.50 | Tighten caching, reduce auto-analyze |

---

*Document reviewed and approved by Oracle. Ready for implementation.*
