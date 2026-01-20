# RFC: Safari Browser Compatibility for Wall-E Extension

> **Status**: Proposed  
> **Created**: 2026-01-20  
> **Priority**: P2 (Enhancement)  
> **Effort**: Medium (8-12h)

## Problem Statement

Wall-E Chrome Extension currently relies on the `chrome.sidePanel` API (Chrome 114+), which is **not supported in Safari**. Safari Web Extensions do not implement the Side Panel API, meaning the extension cannot function on Safari without compatibility changes.

### Current Implementation

```json
// manifest.json
{
  "permissions": ["sidePanel", "storage"],
  "side_panel": {
    "default_path": "index.html"
  }
}
```

### Impact on Safari

| Issue | Description |
|-------|-------------|
| `sidePanel` permission | Unrecognized, may cause install failure |
| `side_panel` config | Ignored entirely |
| No UI entry point | Extension installs but cannot open interface |

---

## Browser API Support Matrix

| API | Chrome | Firefox | Safari | Edge |
|-----|--------|---------|--------|------|
| `chrome.sidePanel` | ✅ 114+ | ❌ | ❌ | ✅ 114+ |
| `browser.sidebarAction` | ❌ | ✅ | ❌ | ❌ |
| `action.default_popup` | ✅ | ✅ | ✅ | ✅ |

**Conclusion**: Popup is the only universally supported UI pattern.

---

## Proposed Solution

### Strategy: Build-time Manifest Variants + Shared UI

Generate browser-specific manifests at build time while sharing the same React application code.

### Implementation Plan

#### 1. Manifest Variants

**Chrome Manifest** (`manifest.chrome.json`):
```json
{
  "manifest_version": 3,
  "name": "Wall-E",
  "version": "0.1.0",
  "permissions": ["sidePanel", "storage"],
  "host_permissions": ["http://localhost:3033/*"],
  "side_panel": {
    "default_path": "index.html"
  }
}
```

**Safari Manifest** (`manifest.safari.json`):
```json
{
  "manifest_version": 3,
  "name": "Wall-E",
  "version": "0.1.0",
  "permissions": ["storage"],
  "host_permissions": ["http://localhost:3033/*"],
  "action": {
    "default_popup": "index.html",
    "default_icon": {
      "16": "icons/icon16.png",
      "48": "icons/icon48.png",
      "128": "icons/icon128.png"
    }
  }
}
```

#### 2. Build Configuration

```typescript
// vite.config.ts
const target = process.env.BUILD_TARGET || 'chrome';

const manifests = {
  chrome: './src/manifest.chrome.json',
  safari: './src/manifest.safari.json',
  firefox: './src/manifest.firefox.json', // Future
};

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    crx({ manifest: require(manifests[target]) })
  ],
});
```

#### 3. Package Scripts

```json
{
  "scripts": {
    "dev": "BUILD_TARGET=chrome vite",
    "dev:safari": "BUILD_TARGET=safari vite",
    "build": "BUILD_TARGET=chrome vite build",
    "build:safari": "BUILD_TARGET=safari vite build",
    "build:all": "npm run build && npm run build:safari"
  }
}
```

#### 4. Runtime Browser Detection

```typescript
// src/lib/browser.ts
export const BrowserInfo = {
  get isSafari(): boolean {
    return /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
  },
  
  get isChrome(): boolean {
    return /chrome/i.test(navigator.userAgent) && 
           !/edg/i.test(navigator.userAgent);
  },
  
  get isFirefox(): boolean {
    return /firefox/i.test(navigator.userAgent);
  },
  
  get supportsSidePanel(): boolean {
    return typeof chrome !== 'undefined' && 
           typeof chrome.sidePanel !== 'undefined';
  },
  
  get isPopupMode(): boolean {
    // Popup windows have specific characteristics
    return !this.supportsSidePanel || 
           window.innerWidth < 500;
  }
};
```

#### 5. UI Adaptation

```tsx
// src/App.tsx
import { BrowserInfo } from '@/lib/browser';
import { cn } from '@/lib/utils';

function SidePanel() {
  const isPopup = BrowserInfo.isPopupMode;
  
  return (
    <div className={cn(
      "flex flex-col bg-background selection:bg-primary/20",
      isPopup 
        ? "w-[400px] h-[600px] overflow-hidden"  // Popup constraints
        : "h-dvh"                                  // Sidepanel full height
    )}>
      <Header compact={isPopup} />
      <main className="flex-1 overflow-hidden relative z-0">
        {/* Tab content */}
      </main>
      <TabNavigation compact={isPopup} />
    </div>
  );
}
```

---

## UX Differences: Sidepanel vs Popup

| Aspect | Sidepanel | Popup |
|--------|-----------|-------|
| **Persistence** | Stays open across tab switches | Closes on outside click |
| **Size** | Adjustable width, full height | Fixed max ~800x600px |
| **Position** | Browser sidebar | Below toolbar icon |
| **State** | Maintains session | Reloads on each open |
| **Context** | Sees current tab URL | Sees current tab URL |

### Mitigation for Popup Limitations

1. **State Persistence**: Save chat history and UI state to `chrome.storage.local`
2. **Restore on Open**: Read state from storage when popup opens
3. **Compact UI**: Optimize layout for smaller viewport

```typescript
// State persistence for popup mode
const usePersistentState = <T>(key: string, initial: T) => {
  const [state, setState] = useState<T>(initial);
  
  useEffect(() => {
    chrome.storage.local.get([key], (result) => {
      if (result[key]) setState(result[key]);
    });
  }, []);
  
  useEffect(() => {
    chrome.storage.local.set({ [key]: state });
  }, [state]);
  
  return [state, setState] as const;
};
```

---

## Alternative Approaches Considered

### A. Popup-Only (All Browsers)

**Pros**: Simplest, one manifest  
**Cons**: Loses sidepanel benefits for Chrome users (persistence, larger UI)  
**Verdict**: ❌ Rejected - UX regression for primary platform

### B. Content Script Injection (Iframe Sidebar)

**Pros**: Works on all browsers, persistent  
**Cons**: Complex, CSS isolation issues, may conflict with page content  
**Verdict**: ❌ Rejected - Too complex for current scope

### C. Separate Extension Builds

**Pros**: Full optimization per browser  
**Cons**: Maintenance burden, divergent codebases  
**Verdict**: ❌ Rejected - Manifest variants achieve same goal with less cost

---

## Implementation Phases

### Phase 1: Foundation (4h)
- [ ] Create `manifest.chrome.json` and `manifest.safari.json`
- [ ] Update `vite.config.ts` for build target selection
- [ ] Add build scripts to `package.json`
- [ ] Create `src/lib/browser.ts` utility

### Phase 2: UI Adaptation (4h)
- [ ] Add popup-mode responsive styles
- [ ] Create `compact` prop variants for Header/TabNavigation
- [ ] Test layout at popup dimensions (400x600)

### Phase 3: State Persistence (4h)
- [ ] Implement `usePersistentState` hook
- [ ] Persist active tab, chat history, settings
- [ ] Handle storage quota limits

### Phase 4: Testing & Polish (2h)
- [ ] Test Chrome sidepanel behavior unchanged
- [ ] Test Safari popup behavior
- [ ] Document browser-specific quirks

---

## Success Criteria

- [ ] Chrome: Sidepanel works exactly as before
- [ ] Safari: Popup opens with full functionality
- [ ] State persists across popup open/close cycles
- [ ] Build produces separate artifacts for each browser
- [ ] No runtime errors on either platform

---

## Open Questions

1. **Firefox Support**: Should we add Firefox sidebar support now or defer?
2. **Safari Distribution**: App Store vs direct distribution? (Affects signing requirements)
3. **Feature Parity**: Any features that should be disabled on popup mode?

---

## References

- [Chrome Side Panel API](https://developer.chrome.com/docs/extensions/reference/api/sidePanel)
- [Firefox Sidebar Action](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/sidebarAction)
- [Safari Web Extension Compatibility](https://developer.apple.com/documentation/safariservices/safari_web_extensions)
- [CRXJS Vite Plugin](https://crxjs.dev/vite-plugin)
