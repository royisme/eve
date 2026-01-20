import { db } from "../db";
import { authTokens } from "../db/schema";
import { eq } from "drizzle-orm";
import type { Context, Next } from "hono";

export async function hashToken(token: string): Promise<string> {
  const hasher = new Bun.CryptoHasher("sha256");
  hasher.update(token);
  return hasher.digest("hex");
}

export async function validateToken(token: string): Promise<boolean> {
  const tokenHash = await hashToken(token);
  const result = await db.select().from(authTokens).where(eq(authTokens.tokenHash, tokenHash)).limit(1);
  
  if (result.length > 0) {
    await db.update(authTokens)
      .set({ lastUsedAt: new Date().toISOString() })
      .where(eq(authTokens.id, result[0].id));
    return true;
  }
  
  return false;
}

export const authMiddleware = async (c: Context, next: Next) => {
  const authHeader = c.req.header("Authorization");
  
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized: Missing or invalid token" }, 401);
  }
  
  const token = authHeader.split(" ")[1];
  const isValid = await validateToken(token);
  
  if (!isValid) {
    return c.json({ error: "Unauthorized: Invalid token" }, 401);
  }
  
  await next();
};

export async function generateInitialToken(): Promise<{ token?: string; created: boolean }> {
  const existing = await db.select().from(authTokens).limit(1);
  if (existing.length > 0) return { created: false };
  
  const token = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("hex");
  const tokenHash = await hashToken(token);
  
  await db.insert(authTokens).values({
    name: "default-walle-extension",
    tokenHash: tokenHash,
  });
  
  return { token, created: true };
}

export async function hasPairedDevice(): Promise<boolean> {
  const existing = await db.select().from(authTokens).limit(1);
  return existing.length > 0;
}

export async function createPairingToken(): Promise<string> {
  await db.delete(authTokens);
  
  const token = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("hex");
  const tokenHash = await hashToken(token);
  
  await db.insert(authTokens).values({
    name: "wall-e-extension",
    tokenHash: tokenHash,
  });
  
  return token;
}
