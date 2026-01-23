# RFC: Gmail Configuration Solution

## Summary

This document outlines the recommended approach for Gmail/Email configuration in Eve & Wall-E, addressing the question of whether to implement Gmail OAuth in Wall-E (Chrome Extension) vs keeping it in CLI/TUI.

**Recommendation**: Keep Gmail OAuth in CLI, enhance Wall-E with status detection and guided setup.

## Current State

### Existing Capabilities

| Component | Status | Description |
|-----------|--------|-------------|
| Email Capability | ✅ Exists | `src/capabilities/email/` with 7 AgentTools |
| Gmail OAuth | ✅ Works | Via `gog` CLI (external Go binary) |
| CLI Commands | ✅ Available | `eve email:setup <email>`, `eve email:sync` |
| TUI Configure | ⚠️ View Only | Shows Gmail accounts but no interactive add |
| Wall-E UI | ❌ None | No Gmail configuration in Settings |

### Current OAuth Flow

```
CLI: eve email:setup user@gmail.com
        ↓
Eve: Spawns `gog auth add user@gmail.com`
        ↓
gog: Returns Google OAuth URL
        ↓
User: Opens URL in browser, completes OAuth
        ↓
gog: Stores token locally (~/.gog/)
        ↓
Eve: Can now sync emails via `gog`
```

## Analysis

### Option A: Wall-E Gmail Configuration

**Why NOT recommended for MVP:**

| Challenge | Complexity | Impact |
|-----------|------------|--------|
| Chrome Extension CSP | 🔴 High | OAuth redirects blocked by strict CSP |
| Dependency on `gog` CLI | 🔴 High | Wall-E cannot spawn local binaries |
| Token Security | 🟠 Medium | Extension storage less secure than file system |
| Development Cost | 🔴 High | New OAuth flow, callback endpoint, polling |
| User Benefit | 🟢 Low | One-time setup, CLI experience acceptable |

**Theoretical Implementation (if pursued):**

```
Wall-E: Click "Add Gmail"
    ↓
POST /email/setup { email }
    ↓
Eve: Spawn gog → Return OAuth URL
    ↓
Wall-E: Open new tab with URL
    ↓
User: Complete OAuth in tab
    ↓
Wall-E: Poll GET /email/status until authorized
    ↓
Wall-E: Show success
```

**Problems:**
- No direct callback to extension
- Poor UX (polling, manual tab management)
- Same security as CLI but more complex

### Option B: Enhanced CLI + Wall-E Guidance (Recommended)

**Benefits:**

| Aspect | Improvement |
|--------|-------------|
| Security | Tokens stay in local file system |
| Simplicity | Leverage existing `gog` infrastructure |
| UX | Clear guidance in Wall-E when unconfigured |
| Cost | Minimal development effort |

## Recommended Implementation

### Phase 1: Eve Backend (P0)

#### 1.1 Add `/email/status` HTTP Endpoint

```typescript
// src/server.ts
protectedApp.get("/email/status", async (c) => {
  const status = await getFullAuthStatus();
  return c.json(status);
});
```

**Response Schema:**
```typescript
interface EmailStatusResponse {
  installed: boolean;      // gog CLI available
  version: string | null;  // gog version
  accounts: Array<{
    email: string;
    configured: boolean;
    authorized: boolean;
  }>;
}
```

### Phase 2: Wall-E Frontend (P1)

#### 2.1 Email Status Hook

```typescript
// extension/wall-e/src/hooks/useEmailStatus.ts
export function useEmailStatus() {
  return useQuery({
    queryKey: ["email-status"],
    queryFn: () => eveApi.get<EmailStatusResponse>("/email/status"),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}
```

#### 2.2 Setup Guidance Card

Display in Settings or Home when no authorized accounts:

```tsx
// extension/wall-e/src/components/EmailSetupCard.tsx
export function EmailSetupCard() {
  const { data: status } = useEmailStatus();
  
  if (status?.accounts.some(a => a.authorized)) {
    return null; // Already configured
  }

  return (
    <Card className="border-amber-500/50 bg-amber-500/10">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mail className="h-5 w-5" />
          Gmail Not Configured
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          To sync job alerts from LinkedIn and Indeed emails, set up Gmail access via terminal:
        </p>
        
        <div className="bg-muted rounded-lg p-3 font-mono text-sm">
          eve email:setup your@gmail.com
        </div>
        
        <Button 
          variant="outline" 
          size="sm"
          onClick={() => navigator.clipboard.writeText("eve email:setup your@gmail.com")}
        >
          <Copy className="h-4 w-4 mr-2" />
          Copy Command
        </Button>

        {!status?.installed && (
          <Alert variant="warning">
            <AlertDescription>
              <code>gog</code> CLI not detected. 
              <a href="https://github.com/pdfinn/gog" target="_blank" className="underline ml-1">
                Install it first
              </a>
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
```

### Phase 3: CLI Enhancement (P2)

#### 3.1 Interactive Email Setup in `eve configure`

Add Email section to the configure wizard:

```typescript
// src/cli/configure.ts
async function handleEmailAccounts(): Promise<void> {
  const action = await p.select({
    message: "Email Accounts",
    options: [
      { value: "add", label: "➕ Add Gmail account" },
      { value: "list", label: "📋 List accounts" },
      { value: "remove", label: "🗑️  Remove account" },
      { value: "back", label: "← Back" },
    ],
  });

  if (isCancel(action) || action === "back") return;

  switch (action) {
    case "add":
      await addEmailAccount();
      break;
    case "list":
      await listEmailAccounts();
      break;
    case "remove":
      await removeEmailAccount();
      break;
  }
}

async function addEmailAccount(): Promise<void> {
  const email = await p.text({
    message: "Gmail address",
    placeholder: "your@gmail.com",
    validate: (v) => v.includes("@") ? undefined : "Enter valid email",
  });

  if (isCancel(email)) return;

  const spinner = p.spinner();
  spinner.start("Initiating OAuth...");

  const result = await initiateGogAuth(email as string);

  if (result.authUrl) {
    spinner.stop("OAuth URL ready");
    p.note(
      `Open this URL to authorize:\n\n${result.authUrl}`,
      "Authorization Required"
    );
    
    const opened = await p.confirm({
      message: "Press Enter after completing authorization",
    });

    // Verify authorization
    const isAuth = await checkGogAuth(email as string);
    if (isAuth) {
      await addConfiguredAccount(email as string);
      p.log.success(`✅ ${email} authorized successfully`);
    } else {
      p.log.warn("Authorization not detected. Please try again.");
    }
  } else if (result.success) {
    spinner.stop(result.message);
  } else {
    spinner.stop(`❌ ${result.message}`);
  }
}
```

## Future Considerations

### Long-term: Native OAuth (Post-MVP)

If user feedback indicates strong demand for in-app Gmail setup:

| Approach | Complexity | Notes |
|----------|------------|-------|
| Eve-hosted OAuth | Medium | Eve serves callback endpoint, no gog dependency |
| Chrome Identity API | High | Requires Web Store publishing, OAuth consent |
| Deep Link | Low | `eve://email-setup` opens local TUI (macOS only) |

**Eve-hosted OAuth Flow:**

```
Wall-E: Click "Add Gmail"
    ↓
Opens: http://localhost:3033/auth/google/start?email=x
    ↓
Eve: Redirects to Google OAuth
    ↓
Google: User authorizes
    ↓
Callback: http://localhost:3033/auth/google/callback
    ↓
Eve: Stores token, shows success page
    ↓
Wall-E: Polls /email/status, updates UI
```

This would require:
1. Google Cloud OAuth credentials
2. New routes in Eve for OAuth flow
3. Token storage migration from gog to Eve's DB

## Implementation Priority

| Task | Priority | Effort | Impact |
|------|----------|--------|--------|
| Add `/email/status` endpoint | P0 | 15 min | Enables Wall-E detection |
| Wall-E `EmailSetupCard` component | P1 | 30 min | User guidance |
| `eve configure` email wizard | P2 | 1 hour | Better CLI experience |
| Native OAuth (if needed) | P3 | 1 week | Full in-app experience |

## Decision

For the current Job Hunting Copilot MVP:

1. **Keep Gmail OAuth in CLI** - Security and simplicity
2. **Add detection in Wall-E** - Show clear guidance when unconfigured
3. **Enhance CLI wizard** - Interactive email setup in `eve configure`

Revisit native OAuth only if:
- User feedback strongly requests in-app configuration
- Job Hunting Copilot reaches production maturity
- Multi-platform distribution is planned (where CLI might not be accessible)

## References

- `src/capabilities/email/` - Email capability implementation
- `src/capabilities/email/services/email-service.ts` - gog integration
- `src/cli/configure.ts` - Interactive configuration wizard
- [gog CLI](https://github.com/pdfinn/gog) - Gmail OAuth CLI tool
