import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";

export const contexts = sqliteTable("contexts", {
  id: text("id").primaryKey(),                 // Format: ctx_{uuid}
  type: text("type").notNull(),                // e.g., "extraction_result", "job_analysis"
  agentId: text("agent_id"),                   // ID of the agent that produced this context
  content: text("content").notNull(),          // Compressed JSON payload (base64 string)
  compression: text("compression").default("gzip"), // Compression method
  contentHash: text("content_hash"),           // SHA256 hash for deduplication
  embedding: text("embedding"),                // Optional: Serialized vector (base64)
  parentIds: text("parent_ids"),               // JSON array of parent context IDs
  metadata: text("metadata"),                  // Free-form JSON metadata
  createdAt: text("created_at").notNull(),     // ISO 8601
  expiresAt: text("expires_at"),               // ISO 8601 (nullable)
  accessedAt: text("accessed_at"),             // ISO 8601
  accessCount: integer("access_count").default(0),
}, (table) => [
  index("idx_context_type").on(table.type),
  index("idx_context_agent").on(table.agentId),
  index("idx_context_expires").on(table.expiresAt),
]);
