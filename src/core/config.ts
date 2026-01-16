import { db } from "../db";
import { sysConfig } from "../db/schema";
import { eq } from "drizzle-orm";

export class ConfigManager {
    static async get<T>(key: string, defaultValue?: T): Promise<T | undefined> {
        const result = await db.select().from(sysConfig).where(eq(sysConfig.key, key)).get();
        if (!result) return defaultValue;
        try {
            return JSON.parse(result.value) as T;
        } catch {
            return result.value as unknown as T; // Fallback for plain strings
        }
    }

    static async set(key: string, value: any, group: string = "core") {
        let strValue;
        if (typeof value === 'string') {
            // Check if it's already stringified JSON
            try {
                JSON.parse(value);
                strValue = value;
            } catch {
                // It's a plain string, wrap it so JSON.parse works on get()
                strValue = JSON.stringify(value);
            }
        } else {
            strValue = JSON.stringify(value);
        }

        await db.insert(sysConfig).values({
            key,
            value: strValue,
            group,
            updatedAt: new Date().toISOString()
        }).onConflictDoUpdate({
            target: sysConfig.key,
            set: { value: strValue, updatedAt: new Date().toISOString() }
        });
    }

    static async list(group?: string) {
        if (group) {
            return db.select().from(sysConfig).where(eq(sysConfig.group, group)).all();
        }
        return db.select().from(sysConfig).all();
    }
}
