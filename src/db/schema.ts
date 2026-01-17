import { sqliteTable, integer, text } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const jobs = sqliteTable('jobs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  account: text('account').notNull(),
  sender: text('sender').notNull(),
  subject: text('subject').notNull(),
  snippet: text('snippet'),
  receivedAt: text('received_at').notNull(), // ISO string
  
  // Extracted Fields
  company: text('company'),
  role: text('role'),
  status: text('status').default('New'), // New, Applied, Interview, Rejected, Offer
  url: text('url'), // Direct job link or Gmail link
  threadId: text('thread_id'), // Gmail Thread ID for deduplication
  
  description: text('description'), // Full JD from Firecrawl
  analysis: text('analysis'),       // AI Analysis Result
  crawledAt: text('crawled_at'),

  // New Fields for Intelligence
  score: integer('score'),          // 0-100 Match Score
  priority: text('priority'),       // P0, P1, P2
  tags: text('tags'),               // JSON array of tags ["Remote", "React"]
  
  rawBody: text('raw_body'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
});

export const sysConfig = sqliteTable('sys_config', {
  key: text('key').primaryKey(),
  value: text('value').notNull(), // JSON stringified
  group: text('group'),           // e.g. 'service.google', 'core'
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
});

export type Job = typeof jobs.$inferSelect;
export type NewJob = typeof jobs.$inferInsert;
export type SysConfig = typeof sysConfig.$inferSelect;
