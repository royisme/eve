# Eve Project Roadmap

**Strategy**: "Reader -> Writer -> Breaker"

## Milestones

### 1. M1: The Intelligent Reader (MVP)
**Goal**: LinkedIn Side Panel works. Shows Match Score.

**Deliverables**:
- Extension skeleton (manifest, popup/sidepanel, content scripts).
- Eve API `/analyze` endpoint.
- `Job` DB schema.

**Acceptance Criteria**:
- [ ] User can open the Side Panel while on a LinkedIn job posting.
- [ ] The Side Panel displays a valid Match Score derived from the job description.
- [ ] The Job details and calculated score are successfully saved to the database.

### 2. M2: The Tailored Writer
**Goal**: Human-in-the-Loop Resume generation.

**Deliverables**:
- Full Page Workspace (React).
- Markdown Editor integration.
- PDF Generation Service (Eve backend).

**Acceptance Criteria**:
- [ ] User can open the Full Page Workspace to view a generated resume.
- [ ] User can edit the resume content using the Markdown Editor.
- [ ] User can download the edited resume as a PDF file.
- [ ] The generated PDF matches the formatting of the editor preview.

### 3. M3: The Workday Breaker
**Goal**: Automated Form Filling.

**Deliverables**:
- Semantic Locator Engine.
- `ai-sdk` Chat Integration.
- Content Scripts for Workday.

**Acceptance Criteria**:
- [ ] The system correctly identifies standard input fields on a Workday application form.
- [ ] The system auto-fills at least 80% of the fields (personal info, work history, education) correctly.
- [ ] Users can interact via chat to resolve ambiguities or missing data.

### 4. M4: The Resilience Layer
**Goal**: Offline support & Analytics.

**Deliverables**:
- Local Queue mechanism.
- Analytics Dashboard.

**Acceptance Criteria**:
- [ ] User actions performed offline are queued locally.
- [ ] Queued actions are automatically synced when the connection is restored.
- [ ] Dashboard displays key metrics (e.g., jobs applied, success rates).
