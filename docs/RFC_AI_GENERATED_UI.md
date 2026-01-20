# RFC: AI-Generated UI for Eve

**Status**: Draft  
**Created**: 2026-01-20  
**Author**: AI Assistant  

---

## 1. Executive Summary

This document evaluates two technologies for enabling AI-generated user interfaces in Eve:

| Technology | Vendor | Recommendation |
|------------|--------|----------------|
| **A2UI** | Google DeepMind | Long-term (multi-platform) |
| **json-render.dev** | Vercel Labs | Short-term (Wall-E enhancement) |

**Current Decision**: Implement `json-render.dev` first for Wall-E dynamic dashboards; consider A2UI when multi-platform support becomes a priority.

---

## 2. Problem Statement

Eve's current Agent-to-UI interaction is static:
- Agent tools return `{ content: [{ type: "text", text: "..." }], details: {...} }`
- Wall-E renders hardcoded React components based on API responses
- No dynamic UI generation from natural language

**Desired Capabilities**:
1. User says: "Show me a funnel of my job applications this week"
2. LLM generates UI specification
3. Wall-E renders a dynamic chart/dashboard

---

## 3. Technology Analysis

### 3.1 A2UI (a2ui.org)

**What it is**: A protocol (not a library) for AI agents to generate cross-platform UIs via declarative JSON.

**Key Characteristics**:
- Protocol-first approach (like HTML for browsers)
- JSONL streaming over SSE
- Platform-agnostic (Angular, Flutter, React, Native)
- Standard component catalog (extensible)
- Backed by Google DeepMind

#### 3.1.1 Architecture

```
┌─────────────────┐    JSONL/SSE    ┌─────────────────┐
│   Eve Agent     │ ───────────────▶│   Client        │
│   (Server)      │                 │ (Wall-E/CLI/...)│
│                 │◀─────────────── │                 │
│                 │   A2A userAction│                 │
└─────────────────┘                 └─────────────────┘
```

#### 3.1.2 Message Types

```jsonl
// 1. surfaceUpdate - Define components
{"surfaceUpdate": {"surfaceId": "main", "components": [
  {"id": "card", "component": {"Card": {"child": "content"}}}
]}}

// 2. dataModelUpdate - Bind data
{"dataModelUpdate": {"surfaceId": "main", "contents": {
  "job": {"title": "Senior Engineer", "score": 85}
}}}

// 3. beginRendering - Trigger render
{"beginRendering": {"root": "card", "surfaceId": "main"}}
```

#### 3.1.3 Standard Components

| Category | Components |
|----------|------------|
| Layout | Row, Column |
| Display | Text, Image, Icon, Divider |
| Interactive | Button, TextField, Checkbox |
| Container | Card, Modal, Tabs, List |

#### 3.1.4 Data Binding

```json
{
  "id": "score-text",
  "component": {
    "Text": {
      "text": {"path": "/job/matchScore"},
      "usageHint": "h2"
    }
  }
}
```

#### 3.1.5 Event Handling (userAction)

```json
{
  "userAction": {
    "name": "tailor_resume",
    "context": {
      "jobId": 123
    }
  }
}
```

#### 3.1.6 Pros & Cons

| Pros | Cons |
|------|------|
| Cross-platform (one output, many renderers) | Requires implementing/integrating renderer |
| Google-backed, likely to become standard | More complex protocol to adopt |
| Designed for streaming | Limited component set (need custom catalog) |
| Secure by design (declarative, not executable) | Overkill for single-platform use |

---

### 3.2 json-render.dev

**What it is**: A React library for AI to generate UIs constrained by a developer-defined component catalog.

**Key Characteristics**:
- Component-driven approach
- Zod schema validation (guardrails)
- React-only (not cross-platform)
- Streaming support via Vercel AI SDK
- Export as standalone React code

#### 3.2.1 Architecture

```
┌─────────────────┐                 ┌─────────────────┐
│   Catalog       │◀────────────── │   Developer     │
│   (Zod Schema)  │   defines      │                 │
└────────┬────────┘                 └─────────────────┘
         │
         ▼
┌─────────────────┐    prompt      ┌─────────────────┐
│   LLM           │◀───────────────│   User          │
│                 │                 │                 │
│                 │────────────────▶│                 │
└────────┬────────┘   JSON output   └─────────────────┘
         │
         ▼
┌─────────────────┐
│   React         │
│   Renderer      │
└─────────────────┘
```

#### 3.2.2 Catalog Definition

```typescript
import { createCatalog } from '@json-render/core';
import { z } from 'zod';

export const eveCatalog = createCatalog({
  components: {
    JobCard: {
      props: z.object({
        title: z.string(),
        company: z.string(),
        matchScore: z.number().min(0).max(100),
        status: z.enum(['inbox', 'applied', 'interviewing', 'offer', 'rejected']),
      }),
      hasChildren: false,
      description: 'Display a single job posting with match score',
    },
    
    FunnelChart: {
      props: z.object({
        stages: z.array(z.object({
          name: z.string(),
          count: z.number(),
          color: z.string().optional(),
        })),
      }),
      description: 'Visualize job application funnel',
    },
    
    SkillGapList: {
      props: z.object({
        skills: z.array(z.object({
          name: z.string(),
          status: z.enum(['match', 'gap', 'partial']),
          importance: z.enum(['required', 'preferred', 'nice-to-have']),
        })),
      }),
      description: 'Show skill match/gap analysis',
    },
    
    MetricCard: {
      props: z.object({
        label: z.string(),
        value: z.union([z.string(), z.number()]),
        trend: z.enum(['up', 'down', 'neutral']).optional(),
        format: z.enum(['number', 'percent', 'currency']).default('number'),
      }),
      description: 'Display a single KPI metric',
    },
  },
  
  actions: {
    tailor_resume: {
      params: z.object({ jobId: z.number() }),
      description: 'Generate tailored resume for a job',
    },
    apply_job: {
      params: z.object({ jobId: z.number() }),
      description: 'Mark job as applied',
    },
    refresh_data: {
      params: z.object({}),
      description: 'Refresh dashboard data',
    },
  },
});
```

#### 3.2.3 Component Registry

```tsx
import { createRegistry } from '@json-render/react';
import { JobCard } from '@/components/JobCard';
import { FunnelChart } from '@/components/FunnelChart';
import { SkillGapList } from '@/components/SkillGapList';
import { MetricCard } from '@/components/MetricCard';

export const registry = createRegistry({
  JobCard: (props) => <JobCard {...props} />,
  FunnelChart: (props) => <FunnelChart stages={props.stages} />,
  SkillGapList: (props) => <SkillGapList skills={props.skills} />,
  MetricCard: (props) => <MetricCard {...props} />,
});
```

#### 3.2.4 AI Integration

```typescript
// Eve backend: src/server.ts
import { generateCatalogPrompt } from '@json-render/core';
import { eveCatalog } from './catalog';

app.post('/api/generate-ui', async (c) => {
  const { prompt } = await c.req.json();
  
  const systemPrompt = generateCatalogPrompt(eveCatalog);
  
  const result = await llm.chat({
    system: systemPrompt,
    user: prompt,
  });
  
  return c.json(JSON.parse(result));
});
```

#### 3.2.5 Client Rendering

```tsx
// Wall-E: src/components/DynamicDashboard.tsx
import { Renderer, useUIStream } from '@json-render/react';
import { registry } from '@/lib/registry';

export function DynamicDashboard() {
  const { tree, generate, isLoading } = useUIStream({
    endpoint: 'http://localhost:3033/api/generate-ui',
  });

  return (
    <div>
      <input 
        placeholder="Describe the dashboard..."
        onKeyDown={(e) => {
          if (e.key === 'Enter') generate(e.currentTarget.value);
        }}
      />
      {isLoading && <Spinner />}
      <Renderer tree={tree} registry={registry} />
    </div>
  );
}
```

#### 3.2.6 Generated JSON Example

User prompt: "Show me my job hunting stats this week"

```json
{
  "key": "dashboard",
  "type": "Card",
  "props": { "title": "Job Hunting Stats - This Week" },
  "children": [
    {
      "key": "metrics-row",
      "type": "Row",
      "children": [
        {
          "key": "total-jobs",
          "type": "MetricCard",
          "props": { "label": "Jobs Reviewed", "value": 45, "trend": "up" }
        },
        {
          "key": "applied",
          "type": "MetricCard",
          "props": { "label": "Applied", "value": 12, "format": "number" }
        },
        {
          "key": "response-rate",
          "type": "MetricCard",
          "props": { "label": "Response Rate", "value": 25, "format": "percent" }
        }
      ]
    },
    {
      "key": "funnel",
      "type": "FunnelChart",
      "props": {
        "stages": [
          { "name": "Inbox", "count": 45 },
          { "name": "Applied", "count": 12 },
          { "name": "Interview", "count": 3 },
          { "name": "Offer", "count": 1 }
        ]
      }
    }
  ]
}
```

#### 3.2.7 Pros & Cons

| Pros | Cons |
|------|------|
| Use existing Shadcn components | React-only (no CLI/mobile) |
| Zod validation = type-safe | Early stage (Vercel Labs experiment) |
| Streaming out of the box | Less mature than A2UI |
| Export as code feature | Smaller community |
| Low integration effort | |

---

## 4. Comparison Matrix

| Feature | A2UI | json-render.dev |
|---------|------|-----------------|
| **Platform Support** | Multi (Angular, Flutter, React, Native) | React only |
| **Component Definition** | JSON Catalog | Zod Schema |
| **Streaming** | JSONL/SSE native | AI SDK integration |
| **Event Handling** | A2A protocol | Custom actions |
| **Data Binding** | JSON Pointer | JSON Pointer |
| **Validation** | JSON Schema | Zod |
| **Code Export** | No | Yes |
| **Maturity** | v0.8 stable (Google) | Early (Vercel Labs) |
| **Integration Effort** | 1-2 weeks | 2-3 days |
| **Best For** | Multi-platform agents | Single React app |

---

## 5. Recommendation for Eve

### 5.1 Short-term: json-render.dev

**Rationale**:
1. Eve only has Wall-E (React) as frontend
2. Existing Shadcn components can be directly registered
3. Lower integration effort (2-3 days)
4. Enables immediate dynamic dashboard capability

**Implementation Plan**:

| Phase | Task | Effort |
|-------|------|--------|
| 1 | Install packages, create Eve Catalog | 2 hours |
| 2 | Register existing Shadcn components | 4 hours |
| 3 | Add `/api/generate-ui` endpoint | 4 hours |
| 4 | Create DynamicDashboard component | 4 hours |
| 5 | Integration testing | 4 hours |
| **Total** | | **~2-3 days** |

### 5.2 Long-term: A2UI

**Trigger conditions** for A2UI adoption:
- Planning CLI interface for Eve
- Planning Telegram/Discord bot
- Planning mobile app
- Need to interoperate with other A2UI-compatible agents

**Migration path**:
- json-render catalogs can inform A2UI catalog design
- Component implementations are reusable
- A2UI renderer can coexist with json-render in Wall-E

---

## 6. Implementation Details (json-render.dev)

### 6.1 Package Installation

```bash
# Wall-E
cd extension/wall-e
bun add @json-render/core @json-render/react

# Eve (for catalog prompt generation)
cd ../..
bun add @json-render/core
```

### 6.2 Directory Structure

```
eve/
├── src/
│   ├── lib/
│   │   └── ui-catalog.ts        # Shared catalog definition
│   └── server.ts                # Add /api/generate-ui endpoint
│
extension/wall-e/
├── src/
│   ├── lib/
│   │   ├── catalog.ts           # Import from eve or duplicate
│   │   └── registry.tsx         # Component registry
│   └── components/
│       └── DynamicDashboard.tsx # Dynamic UI renderer
```

### 6.3 Eve Catalog (Recommended Components)

```typescript
// src/lib/ui-catalog.ts
export const eveCatalog = createCatalog({
  components: {
    // Job-related
    JobCard: { /* ... */ },
    JobList: { /* ... */ },
    
    // Analytics
    FunnelChart: { /* ... */ },
    MetricCard: { /* ... */ },
    TrendChart: { /* ... */ },
    
    // Skills
    SkillGapList: { /* ... */ },
    SkillRadar: { /* ... */ },
    
    // Layout
    Row: { /* ... */ },
    Column: { /* ... */ },
    Card: { /* ... */ },
    
    // Forms (for future)
    Input: { /* ... */ },
    Button: { /* ... */ },
  },
  
  actions: {
    tailor_resume: { /* ... */ },
    apply_job: { /* ... */ },
    analyze_job: { /* ... */ },
    refresh_data: { /* ... */ },
  },
});
```

---

## 7. Security Considerations

### 7.1 json-render.dev

- **Guardrails**: AI can only use components defined in catalog
- **Zod validation**: Props are validated at runtime
- **Actions**: Named actions, not arbitrary code execution
- **Data binding**: Uses JSON Pointer, not eval()

### 7.2 A2UI

- **Declarative**: JSON describes UI, not executable code
- **Catalog negotiation**: Client declares what it supports
- **userAction**: Events are named, context is data-only

**Both approaches are secure by design** - no arbitrary code execution.

---

## 8. References

- [A2UI Official Site](https://a2ui.org)
- [A2UI GitHub](https://github.com/google/A2UI)
- [A2UI Specification v0.8](https://a2ui.org/specification/v0.8-a2ui/)
- [json-render.dev](https://json-render.dev)
- [json-render GitHub](https://github.com/vercel-labs/json-render)
- [Vercel AI SDK](https://sdk.vercel.ai)

---

## 9. Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-01-20 | Draft RFC | Initial research and analysis |
| TBD | Approve json-render.dev | Pending team review |
| TBD | Begin implementation | After approval |

---

## Appendix A: A2UI Full Example

```jsonl
{"surfaceUpdate": {"surfaceId": "job-analysis", "components": [
  {"id": "root", "component": {"Column": {"children": {"explicitList": ["header", "score-card", "skills", "actions"]}}}},
  {"id": "header", "component": {"Text": {"text": {"literalString": "Job Analysis"}, "usageHint": "h1"}}},
  {"id": "score-card", "component": {"Card": {"child": "score-content"}}},
  {"id": "score-content", "component": {"Row": {"children": {"explicitList": ["score-icon", "score-text"]}}}},
  {"id": "score-icon", "component": {"Icon": {"name": {"literalString": "check_circle"}}}},
  {"id": "score-text", "component": {"Text": {"text": {"path": "/matchScore"}, "usageHint": "h2"}}},
  {"id": "skills", "component": {"List": {"children": {"template": {"dataBinding": "/skills", "componentId": "skill-item"}}}}},
  {"id": "skill-item", "component": {"Row": {"children": {"explicitList": ["skill-name", "skill-status"]}}}},
  {"id": "skill-name", "component": {"Text": {"text": {"path": "/name"}}}},
  {"id": "skill-status", "component": {"Icon": {"name": {"path": "/statusIcon"}}}},
  {"id": "actions", "component": {"Row": {"children": {"explicitList": ["tailor-btn", "skip-btn"]}}}},
  {"id": "tailor-btn", "component": {"Button": {"child": "tailor-text", "primary": true, "action": {"name": "tailor_resume"}}}},
  {"id": "tailor-text", "component": {"Text": {"text": {"literalString": "Tailor Resume"}}}},
  {"id": "skip-btn", "component": {"Button": {"child": "skip-text", "action": {"name": "skip_job"}}}},
  {"id": "skip-text", "component": {"Text": {"text": {"literalString": "Skip"}}}}
]}}
{"dataModelUpdate": {"surfaceId": "job-analysis", "contents": {
  "matchScore": "85% Match",
  "skills": [
    {"name": "React", "statusIcon": "check"},
    {"name": "TypeScript", "statusIcon": "check"},
    {"name": "Go", "statusIcon": "warning"}
  ]
}}}
{"beginRendering": {"surfaceId": "job-analysis", "root": "root"}}
```

---

## Appendix B: json-render Full Example

```typescript
// Catalog
const catalog = createCatalog({
  components: {
    AnalysisCard: {
      props: z.object({
        title: z.string(),
        matchScore: z.number(),
      }),
      hasChildren: true,
    },
    SkillMatch: {
      props: z.object({
        skill: z.string(),
        status: z.enum(['match', 'gap', 'partial']),
      }),
    },
    ActionButton: {
      props: z.object({
        label: z.string(),
        variant: z.enum(['primary', 'secondary']),
        action: z.string(),
      }),
    },
  },
  actions: {
    tailor_resume: { params: z.object({ jobId: z.number() }) },
    skip_job: { params: z.object({ jobId: z.number() }) },
  },
});

// Generated JSON
{
  "key": "analysis",
  "type": "AnalysisCard",
  "props": { "title": "Job Analysis", "matchScore": 85 },
  "children": [
    { "key": "s1", "type": "SkillMatch", "props": { "skill": "React", "status": "match" }},
    { "key": "s2", "type": "SkillMatch", "props": { "skill": "TypeScript", "status": "match" }},
    { "key": "s3", "type": "SkillMatch", "props": { "skill": "Go", "status": "gap" }},
    { "key": "tailor", "type": "ActionButton", "props": { "label": "Tailor Resume", "variant": "primary", "action": "tailor_resume" }},
    { "key": "skip", "type": "ActionButton", "props": { "label": "Skip", "variant": "secondary", "action": "skip_job" }}
  ]
}
```
