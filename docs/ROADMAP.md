# Eve Roadmap

> **Last Updated**: 2026-01-20
> **Current Version**: 0.3.0

## Vision

Eve aims to be a **Jarvis-like personal AI assistant** - a local-first, privacy-respecting platform that aggregates digital signals and helps users take action through intelligent automation.

**Current Focus**: Job Hunting Copilot

---

## Phase Overview

```
Phase 1: Foundation (✅ Complete)
    │
    ▼
Phase 2: Job Hunting Copilot (🔄 Current)
    │
    ▼
Phase 3: Auto-Apply Engine (📋 Next)
    │
    ▼
Phase 4: Multi-Domain Expansion (🔮 Future)
```

---

## Phase 1: Foundation ✅

**Goal**: Establish core infrastructure

| Milestone | Status |
|-----------|--------|
| pi-agent-core integration | ✅ |
| Capability framework | ✅ |
| SQLite + Drizzle ORM | ✅ |
| Hono HTTP server | ✅ |
| Authentication system | ✅ |
| Configuration management | ✅ |

---

## Phase 2: Job Hunting Copilot 🔄

**Goal**: Complete end-to-end job hunting workflow

### 2.1 Core Features ✅

| Feature | Status | Notes |
|---------|--------|-------|
| Email sync (Gmail) | ✅ | LinkedIn, Indeed alerts |
| Job parsing & storage | ✅ | URL dedup, company extraction |
| JD enrichment (Firecrawl) | ✅ | Full job description scraping |
| LLM job analysis | ✅ | Fit score, gap analysis |
| Resume management | ✅ | Multi-resume library |
| Resume tailoring | ✅ | LLM-powered customization |
| Analytics (funnel + skills) | ✅ | Status tracking, skill gaps |

### 2.2 Wall-E Integration ✅

| Feature | Status |
|---------|--------|
| Jobs list with filters | ✅ |
| Job detail drawer | ✅ |
| Resume library | ✅ |
| Milkdown editor | ✅ |
| Analytics modal | ✅ |
| Chat interface | ✅ |

### 2.3 Remaining Work 🔄

| Task | Priority | Effort | Notes |
|------|----------|--------|-------|
| **PDF Generation** | P1 | 8h | Playwright backend for resume PDF |
| PDF caching | P1 | 2h | Cache by tailored version |
| Analytics as Capability | P2 | 4h | Expose as AgentTools |
| Input validation audit | P2 | 3h | XSS/SQL injection review |

---

## Phase 3: Auto-Apply Engine 📋

**Goal**: Semi-automated job application workflow

### 3.1 Universal Application Protocol (UAP)

Standard schema for any job application:

```typescript
interface UAP {
  personalInfo: { name, email, phone, ... }
  resume: { content, format }
  coverLetter: { content }
  questions: { question, answer }[]
  attachments: { type, content }[]
}
```

### 3.2 ATS Adapters

| Platform | Priority | Complexity |
|----------|----------|------------|
| LinkedIn Easy Apply | P0 | Medium |
| Greenhouse | P1 | Medium |
| Lever | P1 | Low |
| Workday | P2 | High |
| Custom forms | P3 | Variable |

### 3.3 Workflow

```
1. User selects job → "Apply" button
           │
           ▼
2. Eve detects ATS type
           │
           ▼
3. Eve maps UAP to ATS fields
           │
           ▼
4. Wall-E fills form automatically
           │
           ▼
5. Human review checkpoint
           │
           ▼
6. Wall-E submits application
           │
           ▼
7. Status updated to "applied"
```

### 3.4 Features

| Feature | Description |
|---------|-------------|
| Smart Form Filling | Auto-fill standard fields |
| Question Bank | Learn from previous answers |
| Cover Letter Generation | LLM-powered, job-specific |
| Attachment Management | Resume + portfolio handling |
| Application Tracking | Auto-update status on submit |

---

## Phase 4: Multi-Domain Expansion 🔮

**Goal**: Extend beyond job hunting

### 4.1 Potential Capabilities

| Domain | Description | Priority |
|--------|-------------|----------|
| **Calendar** | Meeting prep, schedule optimization | High |
| **Contacts** | Professional network management | Medium |
| **Finance** | Expense tracking, budgeting | Medium |
| **Learning** | Course recommendations, skill tracking | Low |
| **Health** | Habit tracking, reminders | Low |

### 4.2 Platform Features

| Feature | Description |
|---------|-------------|
| Voice Interface | Whisper/TTS integration |
| Mobile App | React Native companion |
| Plugin System | Third-party capability development |
| Multi-user | Family/team support |

---

## Technical Debt & Infrastructure

### Near-term (Phase 2-3)

| Item | Priority | Notes |
|------|----------|-------|
| Test coverage | P1 | Unit + integration tests |
| Error monitoring | P1 | Sentry or similar |
| Logging infrastructure | P2 | Structured logs |
| Rate limiting | P2 | API protection |
| Backup/restore | P2 | Database snapshots |

### Long-term (Phase 4+)

| Item | Notes |
|------|-------|
| Multi-device sync | SQLite → PostgreSQL/Turso |
| End-to-end encryption | Local-first privacy |
| Offline mode | Full functionality without network |

---

## Success Metrics

### Phase 2 (Job Hunting)

| Metric | Target |
|--------|--------|
| Jobs tracked | 100+ per user |
| Analysis accuracy | >85% fit score correlation |
| Tailoring quality | User satisfaction >4/5 |
| Time saved | 50% reduction in manual work |

### Phase 3 (Auto-Apply)

| Metric | Target |
|--------|--------|
| Applications submitted | 10x increase |
| Form fill accuracy | >95% |
| Human intervention rate | <20% of applications |

---

## Contributing

See `AGENTS.md` for development guidelines. Key principles:

1. **Local-first**: Data stays on user's machine
2. **Privacy-respecting**: No unauthorized data collection
3. **Modular**: New capabilities via Capability framework
4. **AI-native**: LLM as primary reasoning engine

---

## Changelog

| Date | Version | Changes |
|------|---------|---------|
| 2026-01-20 | 0.3.0 | Complete Phase 2 core, Wall-E integration |
| 2026-01-19 | 0.2.0 | Capability framework, Resume tailoring |
| 2026-01-15 | 0.1.0 | Initial Jobs + Email capabilities |
