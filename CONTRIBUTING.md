# Contributing to Eva

Thank you for your interest in contributing to Eva! We aim to build a robust, extensible personal AI assistant.

## 🛠 Development Setup

1. **Runtime**: We use [Bun](https://bun.sh) for everything (package management, testing, bundling).
2. **Setup**:
   ```bash
   bun install
   bun run check  # Runs linter and type checker
   bun test       # Runs unit tests
   ```

## 📏 Code Standards

We enforce strict quality controls to ensure long-term maintainability.

- **No `any`**: We use `TypeScript` in Strict Mode. Explicitly define your types.
- **Linter**: We use `oxlint` for high-performance linting.
- **Formatting**: Please keep code clean and readable.
- **Git Hooks**: `husky` is configured to run checks before commit.

## 🧩 How to Create a New Module

Eva is designed to be modular. A module is a self-contained unit of logic that handles a specific domain (e.g., Finance, Schedule, Health).

### Step 1: Create Module Structure
Create a new directory in `src/modules/<module-name>`.

```bash
src/modules/finance/
  ├── index.ts        # Module entry point
  ├── extractors/     # Logic to parse raw data (emails, files)
  └── types.ts        # Domain models
```

### Step 2: Implement the Handler
Your module must export a class (e.g., `FinanceModule`) with a `handle(data: any)` method.

```typescript
// src/modules/finance/index.ts
export class FinanceModule {
    async handle(email: any) {
        // 1. Extract data (Invoice amount, date, vendor)
        // 2. Save to DB (using Drizzle)
        console.log("Processing finance email:", email.subject);
    }
}
```

### Step 3: Register in Dispatcher
Update `src/core/dispatcher.ts` to route relevant events to your new module.

```typescript
// src/core/dispatcher.ts
import { FinanceModule } from "../modules/finance";

const financeModule = new FinanceModule();

// Inside dispatch()
if (this.isFinanceRelated(subject, sender)) {
    await financeModule.handle(email);
    return;
}
```

### Step 4: Add Database Schema
If your module needs storage, define it in `src/db/schema.ts`.

```typescript
export const invoices = sqliteTable('invoices', {
  id: integer('id').primaryKey(),
  amount: integer('amount'),
  // ...
});
```

### Step 5: Test It
Write unit tests in `tests/modules/<module-name>/`.

```bash
bun test tests/modules/finance
```

## 📦 Pull Requests

1. Fork the repo and create your branch from `main`.
2. Ensure `bun run check` passes.
3. Add tests for your new features.
4. Submit a PR!
