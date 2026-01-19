# End-to-End Data Lifecycle: Job Application Workflow

**Objective**: Map the complete lifecycle of a Job Application from Discovery to Analytics within the Eve/Wall-E ecosystem.

---

## 1. Discovery Phase
*Entry points for a job entering the system context.*

### Scenario A: Email Alert (Reactive)
1.  **Source**: User receives an email (Gmail Alert/Newsletter).
2.  **Action**: User clicks the "Apply" or "View Job" link.
3.  **System**: Browser opens the target URL.
4.  **Eve/Wall-E**: 
    *   Extension loads.
    *   Parses URL parameters (utm_source) to identify origin.
    *   **State**: `Discovery: Email`.

### Scenario B: Active Browsing (Proactive)
1.  **Source**: User browses LinkedIn, Indeed, or Company Career Page.
2.  **Action**: User clicks a Job Card/Listing.
3.  **System**: Job details page renders.
4.  **Eve/Wall-E**:
    *   Scrapes Job Title, Company, Description.
    *   Checks DB: Is this job already seen?
    *   **State**: `Discovery: Direct Browsing`.

---

## 2. Apply Flows (Execution)
*The mechanism of submitting the application data.*

### Flow A: External ATS (Redirect & Auto-Fill)
*Target: Workday, Lever, Greenhouse, Taleo*

1.  **Transition**: User clicks "Apply on Company Website" (from LinkedIn/Indeed).
2.  **Redirect**: Browser navigates to external domain (e.g., `company.myworkdayjobs.com`).
3.  **Detection**: Wall-E detects known ATS signature.
4.  **Action**: 
    *   Wall-E retrieves user profile (Resume/JSON).
    *   **Auto-fill**: Injects data into form fields.
5.  **Submission**: User reviews and clicks "Submit".
6.  **Validation**: Wall-E monitors network requests (200 OK on POST) or DOM changes.
7.  **Outcome**: `Method: Auto-fill`.

### Flow B: Easy Apply (In-Platform)
*Target: LinkedIn Easy Apply, Indeed Quick Apply*

1.  **Context**: Modal opens within the existing platform.
2.  **Observation**: Wall-E observes the modal steps (DOM MutationObserver).
3.  **Action**: Wall-E may assist with answers (optional) or passively track progress.
4.  **Submission**: User clicks "Submit Application".
5.  **Outcome**: `Method: Easy Apply`.

---

## 3. Data Write-Back (The Loop)
*Closing the loop: How Eve confirms the application occurred.*

This is the critical reconciliation phase using **Triple-Trigger Logic**.

### Trigger 1: Explicit Confirmation (Manual)
*   **Action**: User clicks the Eve Extension overlay button: **"I Applied"**.
*   **Payload**: `{ job_id: 123, status: 'applied', timestamp: Now() }`.
*   **Reliability**: High (User Intent).

### Trigger 2: Visual Confirmation (Synchronous)
*   **Action**: Wall-E scrapes the post-submission page.
*   **Logic**:
    *   **External ATS**: Detects "Thank you for applying", "Application Submitted", or distinct Success URL slug.
    *   **Easy Apply**: Detects "Application sent" success toast/modal.
*   **Payload**: `{ job_id: 123, status: 'applied', evidence: 'scraped_text' }`.
*   **Reliability**: Medium (UI changes often).

### Trigger 3: Receipt Verification (Asynchronous)
*   **Action**: Eve Backend (Cron/Worker) scans Gmail via API.
*   **Logic**: 
    *   Query: `subject:("Application Received" OR "Thank you") AND from:(Company_Domain)`.
    *   Fuzzy Match: Matches Email Timestamp ≈ Click Timestamp (+/- 30 mins).
*   **Payload**: `{ job_id: 123, status: 'applied', evidence: 'email_receipt' }`.
*   **Reliability**: High (External Verification).

---

## 4. Analytics & Persistence
*Finalizing the state change in the database.*

### Database Updates
When **any** Trigger fires:

1.  **Jobs Table Update**:
    ```sql
    UPDATE jobs 
    SET 
        status = 'applied',
        applied_at = NOW(),
        application_method = '{method}' -- 'auto-fill' | 'easy-apply' | 'manual'
    WHERE id = {job_id};
    ```

2.  **Analytics Logging**:
    ```sql
    INSERT INTO analytics_events (
        event_type, 
        source, 
        job_id, 
        meta_data
    ) VALUES (
        'application_submitted',
        '{source}', -- 'linkedin' | 'gmail_alert'
        {job_id},
        '{ "trigger": "visual_scrape", "ats": "workday" }'
    );
    ```

---

## 5. Visual Summary (Mermaid)

```mermaid
graph TD
    subgraph Discovery
    A[Email Alert] -->|Click| C(Browser Open)
    B[LinkedIn/Indeed] -->|Click Card| C
    end

    subgraph Apply Flow
    C --> D{Apply Type?}
    D -->|External ATS| E[Redirect to Workday/Lever]
    E --> F[Wall-E Detects & Auto-fills]
    F --> G[Submit Form]
    
    D -->|Easy Apply| H[Modal Opens]
    H --> I[Wall-E Observes]
    I --> J[Submit Modal]
    end

    subgraph The Loop (Triggers)
    G --> K{Success Signal?}
    J --> K
    
    K -->|Trigger 1| L[User Clicks 'I Applied']
    K -->|Trigger 2| M[Wall-E Scrapes 'Thank You']
    K -->|Trigger 3| N[Eve Scans Gmail for Receipt]
    end

    subgraph Analytics
    L & M & N --> O[Update DB: status='applied']
    O --> P[Log: analytics_events]
    end
```
