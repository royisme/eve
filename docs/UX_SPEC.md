# UX Specification: Eve
*Path-Driven Design for Intelligent Job Application Assistance*

This specification outlines the core user interface components for Eve, focusing on a "Path-Driven Design" that adapts to the user's context—from discovery to application.

## 1. The Discovery HUD
**Context**: Job Aggregator Feeds (e.g., LinkedIn, Indeed).
**Goal**: Rapid qualification and disqualification at a glance.

### UI Components
*   **Dealbreaker Indicators**
    *   **Visual**: Small status indicators overlaying job cards.
    *   **Logic**:
        *   🔴 **Red Dot**: Hard mismatch (Dealbreaker).
        *   🟢 **Green Dot**: Strong match.
    *   **Shadcn**: `Badge` (variant=`destructive` | `success`), `Tooltip` (to explain the reason on hover).

*   **Stack Match Bar**
    *   **Visual**: A visual meter indicating technical stack alignment.
    *   **Shadcn**: `Progress`.

## 2. The Analyst Sidebar
**Context**: Job Details View (Browser Extension Sidebar or Drawer).
**Goal**: Deep analysis, "BS detection," and reality checks.

### UI Components
*   **Container**
    *   **Shadcn**: `Sheet` (Side drawer) or `ScrollArea` for content.

*   **"BS Filter" / "The Catch" Section**
    *   **Visual**: a highlighted section exposing red flags, salary inconsistencies, or inflated requirements.
    *   **Shadcn**: `Alert` (variant=`warning` or `destructive`) with `AlertTitle` and `AlertDescription`.

*   **Match Score**
    *   **Visual**: Prominent numerical score or gauge.
    *   **Shadcn**: `Card` containing score typography and a `Separator` to divide metrics.

## 3. The Workday Breaker
**Context**: External Application Portals (Workday, Greenhouse, Lever).
**Goal**: Zero interference form-filling with contextual assistance.

### UI Components
*   **Takeover Bar**
    *   **Visual**: A sticky bar at the top of the viewport notifying the user of assistance availability.
    *   **Copy**: "Auto-fill available".
    *   **Shadcn**: Fixed position `div` with `Button` (variant=`default`).

*   **In-Place Highlights**
    *   **Visual**: Active fields detected by Eve are highlighted with a distinct background (e.g., Yellow/Gold).
    *   **Interaction**: Visual cue only; click to trigger fill.

*   **In-Field Q&A Trigger**
    *   **Visual**: Minimal "Ask Eve" icon inside the input field (right-aligned).
    *   **Action**: Clicking the icon opens the **Side Panel** and switches it to **Chat Mode**.
    *   **Context**: The chat session is automatically seeded with the field's context (e.g., "Drafting answer for 'Why Us?'").
    *   **Tech Stack**: Uses Vercel AI SDK (`useChat`) for the streaming interface in the Side Panel.
    *   **Shadcn**: Input wrapper with absolute positioned `Button` (size=`icon`, variant=`ghost`) inside. No floating windows or popovers.

## 4. The Workspace
**Context**: Full-page Eve Application (Web App).
**Goal**: Focused tailoring of application materials.

### UI Components
*   **Split View Layout**
    *   **Structure**: Vertical split screen.
        *   **Left Panel**: Job Description (Reference).
        *   **Right Panel**: Markdown Resume (Editor).
    *   **Shadcn**: `Resizable` component group (`ResizablePanelGroup`, `ResizablePanel`, `ResizableHandle`).

*   **Resume Editor**
    *   **Visual**: Clean markdown editing interface.
    *   **Shadcn**: `Textarea` or `ScrollArea` wrapping a content-editable div.
