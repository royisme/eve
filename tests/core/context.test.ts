import { describe, it, expect, beforeAll, beforeEach, afterAll } from "bun:test";
import { ContextStore } from "../../src/core/context/ContextStore";
import { getContextDb } from "../../src/core/context/db";
import { contexts } from "../../src/core/context/schema";

describe("ContextStore", () => {
  let store: ContextStore;

  beforeAll(() => {
    store = new ContextStore();
  });

  beforeEach(() => {
    const db = getContextDb();
    db.delete(contexts).run();
  });

  afterAll(() => {
    const db = getContextDb();
    db.delete(contexts).run();
  });

  it("should save and retrieve a context item", async () => {
    const item = await store.save({
      type: "test_result",
      content: { message: "Hello World", value: 42 },
      compression: "json"
    });

    expect(item.id).toStartWith("ctx_");
    expect(item.type).toBe("test_result");

    const retrieved = await store.get(item.id);
    expect(retrieved).not.toBeNull();
    expect(retrieved!.content).toEqual({ message: "Hello World", value: 42 });
  });

  it("should save and retrieve multiple context items", async () => {
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) {
      const item = await store.save({
        type: "batch_item",
        content: { index: i }
      });
      ids.push(item.id);
    }

    const results = await store.getMany(ids);
    expect(results).toHaveLength(3);
    expect(results.map(result => result.id)).toEqual(ids);
    expect(results[0].content).toEqual({ index: 0 });
    expect(results[1].content).toEqual({ index: 1 });
    expect(results[2].content).toEqual({ index: 2 });
  });

  it("should handle non-existent IDs gracefully", async () => {
    const result = await store.get("ctx_nonexistent");
    expect(result).toBeNull();
  });

  it("should return empty array for empty getMany", async () => {
    const result = await store.getMany([]);
    expect(result).toEqual([]);
  });

  it("should track access count", async () => {
    const item = await store.save({
      type: "access_test",
      content: "test"
    });

    expect(item.accessCount).toBe(0);

    await store.get(item.id);
    const updated = await store.get(item.id);
    
    expect(updated!.accessCount).toBeGreaterThanOrEqual(1);
  });
});
