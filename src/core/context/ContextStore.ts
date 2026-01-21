import { eq, inArray, lt, sql } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { getContextDb } from "./db";
import { contexts } from "./schema";

export type ContextCompression = "none" | "gzip";

export interface ContextItem {
  id: string;
  type: string;
  agentId?: string;
  content: unknown;
  contentHash?: string;
  embedding?: string;
  parentIds?: string[];
  metadata?: Record<string, unknown>;
  createdAt: string;
  expiresAt?: string | null;
  accessedAt?: string | null;
  accessCount?: number;
}

export class ContextStore {
  private get db() {
    return getContextDb();
  }

  private compress(content: unknown, method: ContextCompression): string {
    if (method === "none") {
      return typeof content === "string" ? content : JSON.stringify(content);
    }
    
    const str = JSON.stringify(content);
    const uint8Array = new TextEncoder().encode(str);
    const compressed = Bun.gzipSync(uint8Array);
    return Buffer.from(compressed).toString("base64");
  }

  private decompress(content: string, method: ContextCompression): unknown {
    if (method === "none") {
      try {
        return JSON.parse(content);
      } catch {
        return content;
      }
    }

    const binaryString = atob(content);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    
    const decompressed = Bun.gunzipSync(bytes);
    const text = new TextDecoder().decode(decompressed);
    return JSON.parse(text);
  }

  async save(input: {
    type: string;
    agentId?: string;
    content: unknown;
    parentIds?: string[];
    metadata?: Record<string, unknown>;
    expiresAt?: string | null;
    compression?: ContextCompression;
  }): Promise<ContextItem> {
    const compression = input.compression || "gzip";
    const compressedContent = this.compress(input.content, compression);
    const now = new Date().toISOString();
    
    const hasher = new Bun.CryptoHasher("sha256");
    hasher.update(compressedContent);
    const hash = hasher.digest("hex");

    const id = `ctx_${uuidv4()}`;

    const newContext = {
      id,
      type: input.type,
      agentId: input.agentId,
      content: compressedContent,
      compression,
      contentHash: hash,
      parentIds: input.parentIds ? JSON.stringify(input.parentIds) : undefined,
      metadata: input.metadata ? JSON.stringify(input.metadata) : undefined,
      createdAt: now,
      expiresAt: input.expiresAt,
      accessedAt: now,
      accessCount: 0,
    };

    await this.db.insert(contexts).values(newContext);

    return {
        id: newContext.id,
        type: newContext.type,
        agentId: newContext.agentId,
        content: input.content,
        contentHash: newContext.contentHash,
        parentIds: input.parentIds,
        metadata: input.metadata,
        createdAt: newContext.createdAt,
        expiresAt: newContext.expiresAt,
        accessedAt: newContext.accessedAt,
        accessCount: newContext.accessCount,
    };
  }

  async get(id: string): Promise<ContextItem | null> {
    const result = await this.db.select().from(contexts).where(eq(contexts.id, id)).get();
    
    if (!result) return null;

    this.touch(id).catch(console.error);

    return this.mapToItem(result);
  }

  async getMany(ids: string[]): Promise<ContextItem[]> {
    if (ids.length === 0) return [];
    
    const results = await this.db
      .select()
      .from(contexts)
      .where(inArray(contexts.id, ids))
      .all();

    if (results.length > 0) {
      const now = new Date().toISOString();
      const foundIds = results.map(r => r.id);
      await this.db.update(contexts)
        .set({ 
          accessedAt: now,
          accessCount: sql`${contexts.accessCount} + 1`
        })
        .where(inArray(contexts.id, foundIds));
    }

    // Sort by input ID order
    const orderById = new Map(ids.map((id, index) => [id, index]));
    const sorted = results.sort((a, b) => {
      const aIndex = orderById.get(a.id) ?? Number.POSITIVE_INFINITY;
      const bIndex = orderById.get(b.id) ?? Number.POSITIVE_INFINITY;
      return aIndex - bIndex;
    });

    return sorted.map(r => this.mapToItem(r));
  }

  async touch(id: string): Promise<void> {
    const now = new Date().toISOString();
    await this.db.update(contexts)
        .set({ 
          accessedAt: now,
          accessCount: sql`${contexts.accessCount} + 1`
        })
        .where(eq(contexts.id, id));
  }

  async deleteExpired(now?: string): Promise<number> {
    const threshold = now || new Date().toISOString();
    const deleted = await this.db
      .delete(contexts)
      .where(lt(contexts.expiresAt, threshold))
      .returning({ id: contexts.id });
    return deleted.length;
  }

  private mapToItem(row: typeof contexts.$inferSelect): ContextItem {
    const compression = (row as any).compression || "gzip";
    return {
      id: row.id,
      type: row.type,
      agentId: row.agentId || undefined,
      content: this.decompress(row.content, compression),
      contentHash: row.contentHash || undefined,
      embedding: row.embedding || undefined,
      parentIds: row.parentIds ? this.safeJsonParse<string[]>(row.parentIds) : undefined,
      metadata: row.metadata ? this.safeJsonParse<Record<string, unknown>>(row.metadata) : undefined,
      createdAt: row.createdAt,
      expiresAt: row.expiresAt,
      accessedAt: row.accessedAt,
      accessCount: row.accessCount || 0
    };
  }

  private safeJsonParse<T>(str: string): T | undefined {
    try {
      return JSON.parse(str) as T;
    } catch {
      console.error("[ContextStore] Failed to parse JSON field");
      return undefined;
    }
  }
}
