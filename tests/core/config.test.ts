import { describe, expect, test, beforeEach } from "bun:test";
import { ConfigManager } from "../../src/core/config";
import { db } from "../../src/core/db";
import { sysConfig } from "../../src/core/db/schema";

describe("ConfigManager", () => {
    beforeEach(async () => {
        await db.delete(sysConfig);
    });

    test("should set and get a string value", async () => {
        await ConfigManager.set("test.key", "hello world", "test");
        const val = await ConfigManager.get<string>("test.key");
        expect(val).toBe("hello world");
    });

    test("should set and get a JSON object", async () => {
        const data = { accounts: ["a@b.com"], enabled: true };
        await ConfigManager.set("test.json", data, "test");
        
        const val = await ConfigManager.get<typeof data>("test.json");
        expect(val).toEqual(data);
        expect(Array.isArray(val?.accounts)).toBe(true);
    });

    test("should return default value if key missing", async () => {
        const val = await ConfigManager.get<string>("missing.key", "default");
        expect(val).toBe("default");
    });

    test("should update existing key", async () => {
        await ConfigManager.set("test.update", "v1", "test");
        await ConfigManager.set("test.update", "v2", "test");
        const val = await ConfigManager.get<string>("test.update");
        expect(val).toBe("v2");
    });
});
