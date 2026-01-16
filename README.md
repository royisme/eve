# Eva 🤖

**Eva** is a modular, local-first personal AI assistant designed to ingest, process, and act on your personal data streams.

Currently, it specializes in **Job Hunting Intelligence** by scanning your Gmail for job applications, parsing them with AI, and presenting them in a structured TUI dashboard.

![License](https://img.shields.io/badge/license-MIT-blue)
![Runtime](https://img.shields.io/badge/runtime-Bun-black)

## ✨ Features

- **Local-First Architecture**: All data lives in a local SQLite database (`eva.db`). Your data never leaves your machine unless you configure an external LLM.
- **Modular Design**: Capabilities are separated into independent modules (e.g., `Jobs`, `Finance`).
- **Smart Ingestion**:
  - Automatically routes emails to the correct module.
  - Uses **Adapters** (LinkedIn, Indeed) for high-precision parsing.
  - Falls back to **LLM (AI)** for unstructured emails.
- **TUI Dashboard**: Built-in terminal user interface for managing data without leaving your shell.

## 🚀 Getting Started

### Prerequisites
- **Bun** (v1.0+)
- **Google Cloud Credentials** (`client_secret.json`) with Gmail API enabled.
- **LLM Provider API Key** (Anthropic or compatible, e.g., Volcengine Ark).

### Installation

```bash
# Clone the repository
git clone https://github.com/your-username/eva.git
cd eva

# Install dependencies
bun install

# Build the binary
bun run build
```

### Configuration

Eva comes with an interactive CLI to help you set up.

```bash
# Initialize configuration (Wizard)
./eva init

# Or manually configure:
./eva config set services.google.accounts '["your-email@gmail.com"]'
./eva config set services.llm.api_key "sk-..."
./eva config set services.llm.base_url "https://api.anthropic.com/v1"
```

## 🛠 Usage

**1. Ingest Data**
Scan your configured Gmail accounts for new job opportunities.
```bash
./eva ingest
```

**2. Interactive UI**
Launch the Terminal User Interface to browse and manage jobs.
```bash
./eva ui
```

**3. Generate Report**
Output a markdown summary of recent activities (useful for piping to other agents).
```bash
./eva report
```

## 🏗 Architecture

Eva follows a clean, layered architecture:

- **Core**: Handles database (`drizzle`), configuration, and the central `Dispatcher`.
- **Services**: Wrappers for external APIs (Gmail, LLM).
- **Modules**: Domain-specific logic (e.g., `src/modules/jobs`).
- **UI**: The presentation layer (`pi-tui`).

## 🤝 Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for details on code standards and how to create new modules.

## License

MIT
