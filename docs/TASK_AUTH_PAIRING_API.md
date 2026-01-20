# TASK: Auth Pairing API

## Overview

实现 Eve 后端的认证配对 API，支持 Wall-E 扩展的自动化配对流程。

**相关任务**: Wall-E 端实现见 `extension/wall-e/docs/TASK_ONBOARDING_FLOW.md`

---

## Background

当前状态：
- Token 需要手动运行 `scripts/generate-token.ts` 生成
- 用户需要手动复制 token 到 Wall-E
- 无 token 验证端点
- 无 token 失效处理

目标状态：
- Wall-E 可以通过 API 自动请求配对
- 提供 token 验证端点
- 支持重新配对（需要旧 token 授权）

---

## API Specification

### 1. `GET /auth/verify`

验证 token 是否有效。**公开端点**（不需要 authMiddleware）。

**Request:**
```http
GET /auth/verify
x-eve-token: <token>
```

**Response:**
```json
// 成功
{ "valid": true }

// 失败 - 无 token
{ "valid": false, "reason": "no_token" }

// 失败 - token 无效
{ "valid": false, "reason": "invalid_token" }
```

### 2. `POST /auth/pair`

请求配对，生成新 token。**公开端点**。

**场景 A: 首次配对（无现有 token）**
```http
POST /auth/pair
Content-Type: application/json

{}
```

**Response:**
```json
{
  "success": true,
  "token": "a1b2c3d4...",  // 64 字符 hex string
  "message": "Pairing successful"
}
```

**场景 B: 重新配对（需要旧 token 授权）**
```http
POST /auth/pair
x-eve-token: <old-token>
Content-Type: application/json

{}
```

**Response (成功):**
```json
{
  "success": true,
  "token": "e5f6g7h8...",  // 新 token
  "message": "Re-pairing successful. Old token invalidated."
}
```

**Response (失败 - 已有 token 但未提供授权):**
```json
{
  "success": false,
  "error": "already_paired",
  "message": "A device is already paired. Provide existing token to re-pair."
}
```
HTTP Status: 403

**Response (失败 - 提供的旧 token 无效):**
```json
{
  "success": false,
  "error": "invalid_token",
  "message": "The provided token is invalid."
}
```
HTTP Status: 401

### 3. `GET /health` (已存在，无需修改)

保持现状，用于 Wall-E 测试连接。

---

## Implementation Steps

### Step 1: 更新 `src/core/auth.ts`

新增函数：

```typescript
// 生成新 token 并存储（删除旧的）
export async function createPairingToken(): Promise<string> {
  // 删除所有现有 tokens
  await db.delete(authTokens);
  
  // 生成新 token
  const token = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("hex");
  const tokenHash = await hashToken(token);
  
  await db.insert(authTokens).values({
    name: "wall-e-extension",
    tokenHash: tokenHash,
  });
  
  return token;
}

// 检查是否已有配对
export async function hasPairedDevice(): Promise<boolean> {
  const existing = await db.select().from(authTokens).limit(1);
  return existing.length > 0;
}
```

### Step 2: 更新 `src/server.ts`

在 `app.get("/health", ...)` 之后添加公开的认证端点：

```typescript
// === Auth Endpoints (Public) ===

// 验证 token
app.get("/auth/verify", async (c: Context) => {
  const token = c.req.header("x-eve-token");
  
  if (!token) {
    return c.json({ valid: false, reason: "no_token" });
  }
  
  const isValid = await validateToken(token);
  return c.json({ 
    valid: isValid, 
    reason: isValid ? undefined : "invalid_token" 
  });
});

// 请求配对
app.post("/auth/pair", async (c: Context) => {
  const isPaired = await hasPairedDevice();
  
  if (isPaired) {
    // 检查是否提供了旧 token 进行重新配对
    const oldToken = c.req.header("x-eve-token");
    
    if (!oldToken) {
      return c.json({
        success: false,
        error: "already_paired",
        message: "A device is already paired. Provide existing token to re-pair."
      }, 403);
    }
    
    const isValidOldToken = await validateToken(oldToken);
    if (!isValidOldToken) {
      return c.json({
        success: false,
        error: "invalid_token",
        message: "The provided token is invalid."
      }, 401);
    }
  }
  
  // 生成新 token（会删除旧的）
  const newToken = await createPairingToken();
  
  return c.json({
    success: true,
    token: newToken,
    message: isPaired ? "Re-pairing successful. Old token invalidated." : "Pairing successful"
  });
});
```

### Step 3: 删除旧的生成脚本

可以保留 `scripts/generate-token.ts` 作为备用，但标记为 deprecated。

---

## Testing

### Manual Testing

```bash
# 1. 确保没有现有 token（清空数据库或删除 auth_tokens 表数据）

# 2. 测试首次配对
curl -X POST http://localhost:3033/auth/pair
# 期望: { "success": true, "token": "...", "message": "Pairing successful" }

# 3. 保存返回的 token，测试验证
curl http://localhost:3033/auth/verify -H "x-eve-token: <token>"
# 期望: { "valid": true }

# 4. 测试无 token 重新配对（应该被拒绝）
curl -X POST http://localhost:3033/auth/pair
# 期望: { "success": false, "error": "already_paired", ... } 403

# 5. 测试带旧 token 重新配对
curl -X POST http://localhost:3033/auth/pair -H "x-eve-token: <old-token>"
# 期望: { "success": true, "token": "<new-token>", ... }

# 6. 验证旧 token 已失效
curl http://localhost:3033/auth/verify -H "x-eve-token: <old-token>"
# 期望: { "valid": false, "reason": "invalid_token" }
```

---

## Security Considerations

| 风险 | 缓解措施 |
|------|---------|
| 任意请求配对 | 首次配对后，重新配对需要旧 token 授权 |
| Token 泄露 | Token 只在配对响应中返回一次；后续只验证 hash |
| 暴力破解 | 256-bit 随机 token，计算上不可行 |
| 多设备冲突 | 当前设计只允许一个活跃 token；重新配对会使旧 token 失效 |

---

## Acceptance Criteria

- [ ] `GET /auth/verify` 正确验证 token
- [ ] `POST /auth/pair` 首次配对成功返回 token
- [ ] `POST /auth/pair` 无旧 token 时拒绝重新配对 (403)
- [ ] `POST /auth/pair` 带有效旧 token 时允许重新配对
- [ ] 重新配对后旧 token 失效
- [ ] 所有现有 API 继续正常工作（不影响 authMiddleware）
