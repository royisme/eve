import { Database } from "bun:sqlite";

const db = new Database("eve.db");

console.log("🚀 Applying database migrations...");

// 1. Update jobs table
try {
  console.log("- Updating jobs table...");
  db.run("ALTER TABLE jobs ADD COLUMN starred INTEGER DEFAULT 0");
  db.run("ALTER TABLE jobs ADD COLUMN applied_at TEXT");
  db.run("ALTER TABLE jobs ADD COLUMN url_hash TEXT");
  console.log("  ✅ jobs table updated");
} catch (e) {
  console.log("  ℹ️ jobs table might already be updated or: " + (e as Error).message);
}

// Rename role to title if exists
try {
  db.run("ALTER TABLE jobs RENAME COLUMN role TO title");
  console.log("  ✅ Renamed role to title");
} catch (e) {
  console.log("  ℹ️ role column might already be renamed or: " + (e as Error).message);
}

// 2. Create resumes table
console.log("- Creating resumes table...");
db.run(`
  CREATE TABLE IF NOT EXISTS resumes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    content TEXT NOT NULL,
    is_default INTEGER DEFAULT 0,
    use_count INTEGER DEFAULT 0,
    source TEXT DEFAULT 'paste',
    original_filename TEXT,
    parse_status TEXT DEFAULT 'success',
    parse_errors TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  )
`);

// 3. Create tailored_resumes table
console.log("- Creating tailored_resumes table...");
db.run(`
  CREATE TABLE IF NOT EXISTS tailored_resumes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id INTEGER NOT NULL,
    resume_id INTEGER NOT NULL,
    content TEXT NOT NULL,
    suggestions TEXT,
    version INTEGER DEFAULT 1,
    is_latest INTEGER DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
    FOREIGN KEY (resume_id) REFERENCES resumes(id) ON DELETE CASCADE
  )
`);

// 4. Create job_analysis table
console.log("- Creating job_analysis table...");
db.run(`
  CREATE TABLE IF NOT EXISTS job_analysis (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id INTEGER NOT NULL,
    resume_id INTEGER NOT NULL,
    model TEXT NOT NULL,
    prompt_hash TEXT NOT NULL,
    result TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
    FOREIGN KEY (resume_id) REFERENCES resumes(id) ON DELETE CASCADE,
    UNIQUE(job_id, resume_id, prompt_hash)
  )
`);

// 5. Create job_status_history table
console.log("- Creating job_status_history table...");
db.run(`
  CREATE TABLE IF NOT EXISTS job_status_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id INTEGER NOT NULL,
    old_status TEXT,
    new_status TEXT NOT NULL,
    changed_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
  )
`);

// 6. Create auth_tokens table
console.log("- Creating auth_tokens table...");
db.run(`
  CREATE TABLE IF NOT EXISTS auth_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token_hash TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    last_used_at TEXT
  )
`);

// 7. Create indexes
console.log("- Creating indexes...");
db.run("CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status)");
db.run("CREATE INDEX IF NOT EXISTS idx_jobs_starred ON jobs(starred)");
db.run("CREATE INDEX IF NOT EXISTS idx_jobs_url_hash ON jobs(url_hash)");
db.run("CREATE INDEX IF NOT EXISTS idx_resumes_default ON resumes(is_default)");
db.run("CREATE INDEX IF NOT EXISTS idx_tailored_job ON tailored_resumes(job_id)");
db.run("CREATE INDEX IF NOT EXISTS idx_analysis_lookup ON job_analysis(job_id, resume_id)");

console.log("✅ All migrations applied successfully!");
db.close();
