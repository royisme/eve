import { ConfigReader } from "./config-reader";

export interface ContextRecord<T = unknown> {
  id: string;
  type: string;
  content: T;
  agentId?: string;
  parentIds?: string[];
  metadata?: Record<string, unknown>;
  createdAt: string;
  expiresAt?: string;
  accessCount: number;
  lastAccessedAt?: string;
}

export interface CreateContextInput<T = unknown> {
  type: string;
  content: T;
  agentId?: string;
  parentIds?: string[];
  metadata?: Record<string, unknown>;
  expiresAt?: string;
  ttlHours?: number;
}

export class ContextStore {
  private contexts = new Map<string, ContextRecord>();
  private defaultExpiryHours: number;
  private now: () => Date;

  constructor(options?: { defaultExpiryHours?: number; now?: () => Date }) {
    if (options?.defaultExpiryHours !== undefined) {
      this.defaultExpiryHours = options.defaultExpiryHours;
    } else {
      const config = ConfigReader.get();
      this.defaultExpiryHours = config.defaults?.context?.default_expiry_hours ?? 168;
    }
    this.now = options?.now ?? (() => new Date());
  }

  create<T>(input: CreateContextInput<T>): ContextRecord<T> {
    const createdAt = this.now();
    const expiresAt = input.expiresAt
      ? new Date(input.expiresAt)
      : input.ttlHours
        ? new Date(createdAt.getTime() + input.ttlHours * 60 * 60 * 1000)
        : this.defaultExpiryHours > 0
          ? new Date(createdAt.getTime() + this.defaultExpiryHours * 60 * 60 * 1000)
          : undefined;

    const record: ContextRecord<T> = {
      id: this.generateId(createdAt),
      type: input.type,
      content: input.content,
      agentId: input.agentId,
      parentIds: input.parentIds,
      metadata: input.metadata,
      createdAt: createdAt.toISOString(),
      expiresAt: expiresAt?.toISOString(),
      accessCount: 0,
    };

    this.contexts.set(record.id, record);
    return record;
  }

  get<T = unknown>(id: string): ContextRecord<T> | null {
    const record = this.contexts.get(id) as ContextRecord<T> | undefined;
    if (!record) return null;

    if (record.expiresAt) {
      const expiresAt = new Date(record.expiresAt);
      if (expiresAt.getTime() <= this.now().getTime()) {
        this.contexts.delete(id);
        return null;
      }
    }

    record.accessCount += 1;
    record.lastAccessedAt = this.now().toISOString();
    return record;
  }

  delete(id: string): boolean {
    return this.contexts.delete(id);
  }

  cleanupExpired(): number {
    let removed = 0;
    for (const [id, record] of this.contexts.entries()) {
      if (!record.expiresAt) continue;
      const expiresAt = new Date(record.expiresAt);
      if (expiresAt.getTime() <= this.now().getTime()) {
        this.contexts.delete(id);
        removed += 1;
      }
    }
    return removed;
  }

  listIds(): string[] {
    return Array.from(this.contexts.keys());
  }

  private generateId(createdAt: Date): string {
    const random = Math.random().toString(36).slice(2, 8);
    return `ctx_${createdAt.getTime()}_${random}`;
  }
}
