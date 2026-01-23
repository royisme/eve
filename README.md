<p align="center">
  <img src="https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript"/>
  <img src="https://img.shields.io/badge/Bun-000000?style=for-the-badge&logo=bun&logoColor=white" alt="Bun"/>
  <img src="https://img.shields.io/badge/React-61DAFB?style=for-the-badge&logo=react&logoColor=black" alt="React"/>
  <img src="https://img.shields.io/badge/SQLite-003B57?style=for-the-badge&logo=sqlite&logoColor=white" alt="SQLite"/>
</p>

<h1 align="center">Eve & Wall-E</h1>

<p align="center">
  <strong>A Local-First AI Personal Agent Platform</strong><br/>
  <em>Your Jarvis for the Modern World</em>
</p>

<p align="center">
  <a href="#-features">Features</a> •
  <a href="#-architecture">Architecture</a> •
  <a href="#-tech-stack">Tech Stack</a> •
  <a href="#-current-focus-job-hunting-copilot">Current Focus</a> •
  <a href="#-roadmap">Roadmap</a>
</p>

---

## 🎯 What is Eve?

**Eve** is an AI-native personal assistant platform that aggregates your digital signals, analyzes them with LLMs, and helps you take action—all while keeping your data local and private.

Think of it as building your own Jarvis: a modular, extensible system where AI capabilities are first-class citizens.

| Component | Role | Description |
|-----------|------|-------------|
| **Eve** | The Mind | Backend intelligence - reasoning, memory, and orchestration |
| **Wall-E** | The Body | Chrome extension - eyes on the web, hands on the keyboard |

---

## ✨ Features

### Core Platform

- **🧠 AI-Native Architecture**: Built on a capability-based agent framework where every feature is an LLM-invokable tool
- **🏠 Local-First**: All data stored locally in SQLite - your information never leaves your machine
- **🔌 Modular Capabilities**: Add new domains (Jobs, Email, Calendar) as pluggable modules
- **🌐 Multi-Provider LLM**: Seamlessly switch between Anthropic, OpenAI, or Google models
- **⚡ Real-time Sync**: SSE-based streaming for live updates

### Current Capability: Job Hunting

- **📥 Intelligent Inbox**: Auto-aggregates job alerts from LinkedIn, Indeed via Gmail
- **🔍 Deep Analysis**: LLM-powered fit scoring against your resume
- **📝 Smart Tailoring**: One-click resume customization for each application
- **📊 Analytics Dashboard**: Funnel visualization, skill gap analysis
- **🎯 Pre-scoring**: Quick compatibility check before full analysis

---

## 🏗 Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Wall-E (Chrome Extension)                    │
│                 React • Tailwind • Milkdown Editor              │
└───────────────────────────────┬─────────────────────────────────┘
                                │ HTTP / SSE
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                         Eve Backend                             │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                    Hono HTTP Server                      │  │
│  └────────────────────────┬─────────────────────────────────┘  │
│                           ▼                                     │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              Eve Agent (pi-agent-core)                   │  │
│  │                                                          │  │
│  │   ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌───────────┐  │  │
│  │   │  Jobs   │  │ Resume  │  │  Email  │  │ Analytics │  │  │
│  │   │ 8 tools │  │ 6 tools │  │ 3 tools │  │ services  │  │  │
│  │   └─────────┘  └─────────┘  └─────────┘  └───────────┘  │  │
│  └──────────────────────────────────────────────────────────┘  │
│                           │                                     │
│  ┌────────────────────────▼─────────────────────────────────┐  │
│  │           Services: LLM • Firecrawl • Gmail              │  │
│  └──────────────────────────────────────────────────────────┘  │
│                           │                                     │
│  ┌────────────────────────▼─────────────────────────────────┐  │
│  │                 SQLite + Drizzle ORM                     │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| **Capability-based Tools** | Each feature exposed as AgentTool - LLM decides when to invoke |
| **TypeBox Validation** | Runtime type safety for all tool parameters |
| **Local SQLite** | Zero-config, portable, privacy-preserving |
| **Hono + Bun** | Blazing fast HTTP with modern runtime |
| **SSE for Sync** | Real-time progress without WebSocket complexity |

---

## 🛠 Tech Stack

### Backend (Eve)

| Layer | Technology | Why |
|-------|------------|-----|
| Runtime | **Bun** | 3x faster than Node, native TypeScript |
| HTTP | **Hono** | Ultra-lightweight, edge-ready framework |
| Database | **SQLite + Drizzle** | Type-safe ORM, zero-config persistence |
| AI Runtime | **pi-agent-core** | Production-grade agent orchestration |
| LLM | **Anthropic Claude** | Best reasoning for complex analysis |
| Scraping | **Firecrawl** | Reliable web content extraction |

### Frontend (Wall-E)

| Layer | Technology | Why |
|-------|------------|-----|
| Framework | **React 18** | Component-driven, huge ecosystem |
| Bundler | **Vite** | Instant HMR, optimized builds |
| Styling | **Tailwind CSS** | Utility-first, consistent design |
| Components | **Base UI / Radix** | Accessible primitives |
| Editor | **Milkdown** | Extensible Markdown WYSIWYG |
| Extension | **Chrome MV3** | Modern extension architecture |

---

## 🎯 Current Focus: Job Hunting Copilot

The first domain implementation - turning job hunting from a chore into a data-driven process.

### Workflow

```
📧 Gmail Alert → 🔍 Parse & Store → 🌐 Enrich JD → 🤖 LLM Analysis → 📝 Tailor Resume → 📊 Track Progress
```

### Implemented Tools (17 AgentTools)

**Jobs Capability (8)**
- `jobs_search` - Query job database
- `jobs_list` - List with filters
- `jobs_enrich` - Scrape full JD
- `jobs_analyze` - Batch LLM analysis
- `jobs_analyze_single` - Single job deep analysis
- `jobs_prescore` - Quick compatibility check
- `jobs_tailor` - Generate tailored resume
- `jobs_get_tailored_versions` - Version history

**Resume Capability (6)**
- `resume_list`, `resume_import`, `resume_get`, `resume_update`, `resume_delete`, `resume_set_default`

**Email Capability (3)**
- `email_status`, `email_setup`, `email_sync`

---

## 🗺 Roadmap

| Phase | Status | Focus |
|-------|--------|-------|
| **1. Foundation** | ✅ Complete | Core framework, capability system |
| **2. Job Copilot** | 🔄 Current | Full job hunting workflow |
| **3. Auto-Apply** | 📋 Next | Semi-automated applications |
| **4. Multi-Domain** | 🔮 Future | Calendar, Contacts, Finance |

### Next Up

- [ ] PDF generation backend (Playwright)
- [ ] Universal Application Protocol (UAP)
- [ ] LinkedIn Easy Apply adapter
- [ ] Voice interface integration

---

## 🚀 Quick Start

```bash
# Prerequisites: Bun v1.0+

# Install dependencies
bun install

# Start the server (dev)
bun run src/index.ts serve

# Or launch TUI dashboard (dev)
bun run src/index.ts

# Build production dist
bun run build

# Run compiled output
bun dist/index.js serve
```

### Data Directory

Eve stores data in a user-scoped directory by default:

- Default: `~/.config/eve/eve.db`
- Override: `EVE_DATA_DIR=/custom/path` or `--data-dir=/custom/path`

You should not need to interact with this directory directly.

### Migrations

- Drizzle migrations live in `drizzle/`
- Build copies them to `dist/drizzle/`
- App startup runs migrations automatically
- When schema changes: `npx drizzle-kit generate --name <tag>` and commit `drizzle/`

### Configuration

```bash
# Set up LLM provider
eve config:set services.llm.provider "anthropic"

# Connect Gmail accounts
eve config:set services.google.accounts '["your@gmail.com"]'

# Add Firecrawl for web scraping
eve config:set services.firecrawl.api_key "fc-..."
```

---

## 🚢 Release Flow

### Versioning

We use semantic versioning for releases.

- **Patch**: bug fixes, no API changes
- **Minor**: new capabilities or non-breaking behavior
- **Major**: breaking changes or data migrations with incompatible behavior

Recommended bump (manual):

- Update version in `package.json`
- Run `npx drizzle-kit generate --name <tag>` if schema changed
- Commit changes and tag: `git tag vX.Y.Z`

### CI Build

CI should run:

```bash
bun install
bun run build
bun dist/index.js --help
```

### Release Artifacts

- `dist/` folder (compiled backend + `dist/drizzle`)
- Homebrew formula updated to point at the new release artifact

### Upgrade Behavior

- Users upgrade via Homebrew
- On first run after upgrade, Eve auto-applies new migrations
- Existing data in `~/.config/eve` is preserved

---

## 📖 Documentation

| Document | Description |
|----------|-------------|
| [ROADMAP.md](docs/ROADMAP.md) | Future plans and milestones |
| [STATUS.md](docs/STATUS.md) | Current implementation status |
| [TECH_SPEC.md](docs/TECH_SPEC.md) | Technical architecture details |
| [AGENTS.md](AGENTS.md) | AI agent development guide |

---

## 🤝 Philosophy

> **Local-first, AI-native, privacy-respecting.**

Eve is built on the belief that personal AI assistants should:

1. **Keep your data local** - No cloud dependency for core functionality
2. **Be transparent** - You control what the AI sees and does
3. **Be extensible** - Add new capabilities without touching core code
4. **Be practical** - Solve real problems, not demo toys

---

## 📫 Connect

Built by a software engineer who believes AI should augment human capability, not replace human agency.

**Currently exploring**: AI agent architectures, local-first software, and the future of personal computing.

---

<p align="center">
  <em>Eve & Wall-E — Building Jarvis, one capability at a time.</em>
</p>
