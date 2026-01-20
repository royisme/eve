# Task: Release & Migration Strategy

## Goal

Define the release workflow and runtime migration behavior for the compiled Eve binary.

---

## Packaging Model

Eve is distributed as a compiled backend bundle (transparent `dist/`) built by CI and published via Homebrew.

Build command (CI):

```bash
tsc -p tsconfig.build.json
mkdir -p dist/drizzle
cp -R drizzle/* dist/drizzle/
```

This keeps the backend output readable while shipping migrations alongside the compiled output.

---

## Runtime Migration Behavior

At startup, Eve always runs database migrations before starting services.

- **First install**: database does not exist, so all migrations are applied (initial schema).
- **Upgrade**: database exists, so only new migrations are applied.

This requires the migration folder to be present next to the compiled output in `dist/drizzle`.

---

## Data Directory

The database is stored in the user data directory:

- Default: `~/.config/eve/eve.db`
- Overrides:
  - `EVE_DATA_DIR=/custom/path`
  - `--data-dir=/custom/path`

Users do not need to know about this directory. It is an internal detail.

---

## Update Flow

1. User runs `brew upgrade eve`
2. Homebrew replaces the `dist/` payload
3. On next start, Eve runs migrations automatically
4. Existing user data is preserved

No manual scripts are required.

---

## CI / Release Checklist

- [ ] Generate new migration SQL files with drizzle-kit when schema changes
- [ ] Ensure `drizzle/` is committed
- [ ] Build with embedded assets (see build command)
- [ ] Publish binary and Homebrew formula

---

## Notes

- The migration folder path at runtime is resolved via `import.meta.url`.
- For `dist/` builds, migrations are loaded from `dist/drizzle`.
- For source runs, migrations are loaded from `drizzle/` in the repo root.
