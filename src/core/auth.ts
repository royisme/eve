import type { Context, Next } from "hono";

const ALLOWED_TOKEN_PREFIX = "chrome-extension://";
const AUTH_HEADER = "x-eve-token";

export function isValidExtensionId(token: string): boolean {
  return token.startsWith(ALLOWED_TOKEN_PREFIX) || 
         /^[a-z]{32}$/.test(token);
}

export const authMiddleware = async (c: Context, next: Next) => {
  const token = c.req.header(AUTH_HEADER);
  
  if (!token) {
    return c.json({ error: "Unauthorized: Missing token" }, 401);
  }
  
  if (!isValidExtensionId(token)) {
    return c.json({ error: "Unauthorized: Invalid extension ID" }, 401);
  }
  
  await next();
};

export async function validateToken(token: string): Promise<boolean> {
  return isValidExtensionId(token);
}
