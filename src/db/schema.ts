import { sqliteTable, integer, text, index } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const jobs = sqliteTable('jobs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  account: text('account').notNull(),
  sender: text('sender').notNull(),
  subject: text('subject').notNull(),
  snippet: text('snippet'),
  receivedAt: text('received_at').notNull(),
  
  company: text('company'),
  title: text('title'),
  status: text('status').default('inbox'), 
  url: text('url'), 
  urlHash: text('url_hash').unique(), 
  threadId: text('thread_id'),
  firstSeenAt: text('first_seen_at'),
  lastSeenAt: text('last_seen_at'), 
  
  description: text('description'), 
  analysis: text('analysis'),       
  crawledAt: text('crawled_at'),

  score: integer('score'),          
  priority: text('priority'),       
  tags: text('tags'),               
  starred: integer('starred').default(0),
  appliedAt: text('applied_at'),
  
  rawBody: text('raw_body'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
});

export const resumes = sqliteTable('resumes', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  content: text('content').notNull(),           
  isDefault: integer('is_default').default(0),
  useCount: integer('use_count').default(0),
  source: text('source').default('paste'),      
  originalFilename: text('original_filename'),
  parseStatus: text('parse_status').default('success'), 
  parseErrors: text('parse_errors'),            
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
});

export const tailoredResumes = sqliteTable('tailored_resumes', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  jobId: integer('job_id').notNull().references(() => jobs.id, { onDelete: 'cascade' }),
  resumeId: integer('resume_id').notNull().references(() => resumes.id, { onDelete: 'cascade' }),
  content: text('content').notNull(),           
  suggestions: text('suggestions'),             
  version: integer('version').default(1),
  isLatest: integer('is_latest').default(1),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
});

export const jobAnalysis = sqliteTable('job_analysis', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  jobId: integer('job_id').notNull().references(() => jobs.id, { onDelete: 'cascade' }),
  resumeId: integer('resume_id').notNull().references(() => resumes.id, { onDelete: 'cascade' }),
  model: text('model').notNull(),               
  promptHash: text('prompt_hash').notNull(),    
  result: text('result').notNull(),             
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
});

export const jobStatusHistory = sqliteTable('job_status_history', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  jobId: integer('job_id').notNull().references(() => jobs.id, { onDelete: 'cascade' }),
  oldStatus: text('old_status'),
  newStatus: text('new_status').notNull(),
  changedAt: text('changed_at').default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index('idx_job_status_history_new_status').on(table.newStatus),
  index('idx_job_status_history_changed_at').on(table.changedAt),
]);

export const authTokens = sqliteTable('auth_tokens', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  tokenHash: text('token_hash').notNull().unique(),
  name: text('name').notNull(),                 
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  lastUsedAt: text('last_used_at'),
});

export const sysConfig = sqliteTable('sys_config', {
  key: text('key').primaryKey(),
  value: text('value').notNull(), 
  group: text('group'),           
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
});

export const emailAccounts = sqliteTable('email_accounts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  email: text('email').notNull().unique(),
  isPrimary: integer('is_primary').default(0),
  isAuthorized: integer('is_authorized').default(0),
  alias: text('alias'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  lastSyncAt: text('last_sync_at'),
});

export const cronJobs = sqliteTable('cron_jobs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  description: text('description'),
  schedule: text('schedule').notNull(),
  
  // 执行模式
  target: text('target').notNull().default('isolated'),  // 'main' | 'isolated'
  wakeMode: text('wake_mode').default('lazy'),           // 'lazy' | 'now'
  
  // 载荷
  payloadType: text('payload_type').notNull(),
  payloadParams: text('payload_params'),  // JSON
  
  enabled: integer('enabled').default(1),
  timezone: text('timezone').default('America/Toronto'),
  
  lastRunAt: text('last_run_at'),
  nextRunAt: text('next_run_at'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
});

export const cronRuns = sqliteTable('cron_runs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  jobId: integer('job_id').references(() => cronJobs.id, { onDelete: 'cascade' }),
  sessionId: text('session_id'),
  startedAt: text('started_at').notNull(),
  finishedAt: text('finished_at'),
  status: text('status').notNull(),
  resultSummary: text('result_summary'),  // JSON
  errorMessage: text('error_message'),
  triggerReason: text('trigger_reason'),
});

export type Job = typeof jobs.$inferSelect;
export type NewJob = typeof jobs.$inferInsert;
export type Resume = typeof resumes.$inferSelect;
export type NewResume = typeof resumes.$inferInsert;
export type TailoredResume = typeof tailoredResumes.$inferSelect;
export type JobAnalysis = typeof jobAnalysis.$inferSelect;
export type JobStatusHistory = typeof jobStatusHistory.$inferSelect;
export type AuthToken = typeof authTokens.$inferSelect;
export type SysConfig = typeof sysConfig.$inferSelect;
export type CronJob = typeof cronJobs.$inferSelect;
export type NewCronJob = typeof cronJobs.$inferInsert;
export type CronRun = typeof cronRuns.$inferSelect;
export type NewCronRun = typeof cronRuns.$inferInsert;
export type EmailAccount = typeof emailAccounts.$inferSelect;
export type NewEmailAccount = typeof emailAccounts.$inferInsert;
