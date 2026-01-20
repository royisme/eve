import { Container, Text, TUI, SelectList, type SelectItem } from "@mariozechner/pi-tui";
import { Database } from "bun:sqlite";
import open from "open";

interface Job {
  id: number;
  title: string;
  company: string;
  status: string;
  sender: string;
  subject: string;
  receivedAt: string;
  url: string | null;
  score: number | null;
}

export class JobsTab extends Container {
  private tui: TUI;
  private headerText: Text;
  private list: SelectList | null = null;
  private details: Text;
  private footerText: Text;
  private jobs: Job[] = [];
  private detailsAdded = false;

  constructor(tui: TUI) {
    super();
    this.tui = tui;

    this.headerText = new Text("\x1b[1;36m💼 Job Opportunities\x1b[0m\n");
    this.addChild(this.headerText);

    this.details = new Text("");
    this.footerText = new Text("\n\x1b[90m[Enter] Open URL | [r] Refresh\x1b[0m");

    this.refreshJobs();
  }

  private rebuildList() {
    if (this.list) {
      this.removeChild(this.list);
    }
    if (this.detailsAdded) {
      this.removeChild(this.details);
      this.removeChild(this.footerText);
    }

    const theme = {
      selectedPrefix: (_s: string) => `\x1b[32m> \x1b[0m`,
      selectedText: (s: string) => `\x1b[32m${s}\x1b[0m`,
      description: (s: string) => `\x1b[90m${s}\x1b[0m`,
      scrollInfo: (s: string) => `\x1b[90m${s}\x1b[0m`,
      noMatch: (s: string) => `\x1b[31m${s}\x1b[0m`,
    };

    const items: SelectItem[] = this.jobs.map((job) => ({
      value: String(job.id),
      label: `${job.title} @ ${job.company}`,
      description: `${job.status} | Score: ${job.score || "?"}%`,
    }));

    this.list = new SelectList(items, 10, theme);
    this.list.onSelect = (item: SelectItem) => this.handleSelect(item);
    this.list.onSelectionChange = (item: SelectItem) => this.updateDetails(item);

    this.addChild(this.list);
    this.addChild(new Text("\n"));
    this.addChild(this.details);
    this.addChild(this.footerText);
    this.detailsAdded = true;

    if (items.length > 0) {
      this.updateDetails(items[0]);
    }
  }

  refreshJobs() {
    try {
      const db = new Database("eve.db", { readonly: true });
      this.jobs = db.query("SELECT * FROM jobs ORDER BY id DESC LIMIT 50").all() as Job[];
      db.close();

      this.rebuildList();

      if (this.jobs.length === 0) {
        this.details.setText("No jobs found.");
      }
    } catch (e) {
      this.details.setText(`Error loading jobs: ${(e as Error).message}`);
    }
    this.tui.requestRender();
  }

  updateDetails(item: SelectItem) {
    if (!item) return;
    const job = this.jobs.find((j) => String(j.id) === item.value);
    if (!job) return;

    let text = `\x1b[1m${job.title}\x1b[0m at \x1b[1m${job.company}\x1b[0m\n`;
    text += `From: ${job.sender}\n`;
    text += `Subject: ${job.subject}\n`;
    text += `Date: ${job.receivedAt}\n`;
    if (job.url) text += `\x1b[34m${job.url}\x1b[0m`;

    this.details.setText(text);
  }

  handleSelect(item: SelectItem) {
    const job = this.jobs.find((j) => String(j.id) === item.value);
    if (job && job.url) {
      open(job.url);
    }
  }

  handleInput(data: string) {
    if (data === "r") {
      this.refreshJobs();
      return;
    }
    if (this.list) {
      this.list.handleInput(data);
    }
  }

  invalidate(): void {
    this.headerText.invalidate();
    this.list?.invalidate();
    this.details.invalidate();
    this.footerText.invalidate();
  }

  focus() {
    if (this.list) {
      this.tui.setFocus(this.list);
    }
  }
}
