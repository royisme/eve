# Product Requirements Document (PRD): Brainstorm V2 (Wall-E & Eve)

## 1. Product Vision
To build the ultimate autonomous recruiting agent that combines human-like interaction with machine-speed execution. The system transforms the tedious job application process into a collaborative, semi-automated workflow where the user manages decisions while the AI handles execution.

## 2. Core Philosophy: Wall-E & Eve
The system is bifurcated into two distinct but synchronized entities:
*   **Wall-E (The Body)**: Represents the "Eyes and Hands" of the system. It interacts with the DOM, clicks buttons, types text, handles file uploads, and executes actions on the browser page.
*   **Eve (The Mind)**: Represents the "Brain and Memory". She analyzes job descriptions, strategizes on answers, retrieves context from the user's history, and directs Wall-E on what to do next.

## 3. Key Features

### 3.1 Automated Application Workflow
A robust, resilient automation engine designed to handle the complexity of modern Applicant Tracking Systems (ATS).

*   **Universal Application Protocol (UAP)**:
    *   A standardized data model that abstracts any job site's requirements into a common schema.
    *   Regardless of whether the underlying site is Workday, Greenhouse, or Lever, Eve converts the site's fields into UAP format for processing.
*   **Resilient State Machine**:
    *   The application process is modeled as a formal state machine: `Login -> Form -> Upload -> Confirm`.
    *   **Persistence**: The state is saved locally. If the browser crashes or is closed, the session resumes exactly where it left off upon reopening.

### 3.2 Killer Feature: The Application Workspace (Full Page)
A focused, full-screen environment for "Review & Tailor" workflows, ensuring the user has full control before anything is sent.

*   **Human-in-the-Loop Tailoring**:
    *   Instead of auto-modifying the PDF silently, Wall-E offers to "Review & Tailor" the application.
    *   Opens a dedicated full-screen React page (within the extension or localhost).
*   **Split View Interface**:
    *   **Left Panel**: Displays the parsed Job Description (JD) for easy reference.
    *   **Right Panel**: A rich Markdown Editor showing the Dynamic Resume content Eve has generated.
*   **Edit & Build Workflow**:
    *   The user can manually edit the Markdown to tweak skills or phrasing.
    *   **Action**: User clicks "Build PDF".
    *   The system generates the final PDF and returns the user to the original Job Tab.
    *   Wall-E then proceeds to upload the approved, custom-built PDF.

### 3.3 Immersive Sidebar Experience
The primary interface for User-AI collaboration, designed to feel like a high-end copilot.

*   **Streaming Responses**:
    *   Chat interface supports real-time token streaming (ChatGPT-style) for immediate feedback during complex reasoning tasks.
*   **Server-Driven UI (SDUI)**:
    *   The UI is dynamic and context-aware.
    *   Eve determines which buttons, prompts, or widgets to display based on the current URL and page state.
    *   *Example*: On a "Cover Letter" page, Eve dynamically renders a "Draft Cover Letter" button.

### 3.4 Privacy & Trust
Security is paramount when handling personal career data.

*   **Local Vault Architecture**:
    *   All Personally Identifiable Information (PII) and credentials are stored encrypted within the browser extension's local storage.
    *   No sensitive user data is sent to a central server for storage.
*   **Human-in-the-Loop (HITL)**:
    *   **Draft & Approve**: For open-ended questions (e.g., "Why do you want to work here?"), Eve drafts a response but *requires* user confirmation before Wall-E fills the field.
    *   This ensures tone consistency and prevents AI hallucinations in critical form fields.

### 3.5 Contextual Q&A Assistant ("The Interview Coach")
A real-time assistant designed to unblock users on complex, open-ended application questions.

*   **Context-Aware Triggers**:
    *   Detects when the user focuses on long-form text fields (e.g., "Why do you want to work here?", "Describe a challenge you overcame").
    *   Displays a subtle "Ask Eve" button or icon near the active field.
*   **Resume-Backed Intelligence**:
    *   Upon clicking "Ask Eve", the system analyzes the specific question and the user's stored resume data/experience.
    *   Eve generates a tailored, relevant response that highlights the user's actual achievements.
*   **Edit & Insert Workflow**:
    *   The suggested answer appears in a floating window or sidebar.
    *   User can edit the response to match their voice before clicking "Insert" to populate the form field.

## 4. User Flow Example
1.  **Discovery**: User navigates to a job posting. Eve analyzes the page.
2.  **Strategy**: Eve identifies the ATS type and maps fields to UAP. She notices a skill gap in the resume regarding "React Native".
3.  **Tailoring (The Workspace)**: Eve suggests tailoring the resume. User clicks "Review & Tailor".
    *   The Application Workspace opens in full screen.
    *   User sees the JD and Eve's proposed changes side-by-side.
    *   User tweaks the Markdown to perfect the phrasing and clicks "Build PDF".
4.  **Execution (Wall-E)**:
    *   User is returned to the job application tab.
    *   Wall-E clicks "Apply".
    *   Wall-E uploads the newly built PDF.
    *   Wall-E fills standard fields from the Local Vault.
5.  **Review**: Eve drafts the "Additional Information" text. User reviews and clicks "Approve".
6.  **Submission**: Wall-E submits the application and updates the local state to `Confirm`.

## 5. Technical Constraints
*   **Extension-Based**: Must run primarily as a browser extension (Chrome/Edge).
*   **Latency**: PDF generation must occur within reasonable timeframes (<5s) to maintain flow.
*   **DOM Fragility**: Wall-E adapters must be robust against minor UI changes in target ATS platforms.
