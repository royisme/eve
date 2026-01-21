import { eq, inArray, lt } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { getContextDb } from "./db";
import { contexts } from "./schema";

export type ContextCompression = "none" | "json";

export interface ContextItem {
  id: string;
  type: string;
  agentId?: string;
  content: string;
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
    const compressed = Bun.gzipSync(Buffer.from(str));
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

    const buffer = Buffer.from(content, "base64");
    const decompressed = Bun.gunzipSync(buffer);
    return JSON.parse(decompressed.toString());
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
    const compression = input.compression || "json";
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
        ...newContext,
        parentIds: input.parentIds,
        metadata: input.metadata
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
    
    const results = await this.db.select().from(contexts).where(inArray(contexts.id, ids)).all();
    
    const foundIds = results.map(r => r.id);
    if (foundIds.length > 0) {
        foundIds.forEach(id => this.touch(id).catch(console.error));
    }

    return results.map(r => this.mapToItem(r));
  }

  async touch(id: string): Promise<void> {
    const now = new Date().toISOString();
    await this.db.update(contexts)
        .set({ accessedAt: now })
        .where(eq(contexts.id, id));
  }

  async deleteExpired(now?: string): Promise<number> {
    const threshold = now || new Date().toISOString();
    const result = await this.db.delete(contexts).where(lt(contexts.expiresAt, threshold));
    return (result as any)?.rowsAffected || 0;
  }

  private mapToItem(row: typeof contexts.$inferSelect): ContextItem {
    return {
      id: row.id,
      type: row.type,
      agentId: row.agentId || undefined,
      content: row.content,
      contentHash: row.contentHash || undefined,
      embedding: row.embedding || undefined,
      parentIds: row.parentIds ? JSON.parse(row.parentIds) : undefined,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      createdAt: row.createdAt,
      expiresAt: row.expiresAt,
      accessedAt: row.accessedAt,
      accessCount: row.accessCount || 0
    };
  }
}
