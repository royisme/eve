import { Container, Text, TUI } from "@mariozechner/pi-tui";
import { getFullAuthStatus, type GogAuthStatus } from "../../capabilities/email/services/email-service";
import { emailSyncTool } from "../../capabilities/email/tools/sync";

export class EmailTab extends Container {
  private tui: TUI;
  private statusText: Text;
  private syncing = false;
  private currentStatusText = "";

  constructor(tui: TUI) {
    super();
    this.tui = tui;

    this.statusText = new Text("Loading email status...");
    this.addChild(this.statusText);

    this.refreshStatus();
  }

  async refreshStatus() {
    this.statusText.setText("Loading email status...");
    this.tui.requestRender();

    try {
      const status = await getFullAuthStatus();
      this.renderStatus(status);
    } catch (e) {
      this.statusText.setText(`Error: ${(e as Error).message}\n\n[r] Retry`);
    }
    this.tui.requestRender();
  }

  renderStatus(status: GogAuthStatus) {
    let output = "\x1b[1;36m📧 Email Configuration\x1b[0m\n\n";

    if (!status.installed) {
      output += "\x1b[31m❌ gog CLI not installed\x1b[0m";
    } else {
      output += `\x1b[32m✓ gog CLI ${status.version}\x1b[0m\n\n`;
      output += "\x1b[1mAccounts:\x1b[0m\n";

      if (status.accounts.length === 0) {
        output += "\x1b[33mNo accounts configured. Run: eve email:setup your@gmail.com\x1b[0m";
      } else {
        status.accounts.forEach((acc) => {
          const icon = acc.authorized ? "✓" : "✗";
          const color = acc.authorized ? "\x1b[32m" : "\x1b[31m";
          output += `  ${color}${icon} ${acc.email}\x1b[0m\n`;
        });
      }
    }

    output += "\n\n\x1b[90m[r] Refresh | [s] Sync Emails\x1b[0m";
    this.currentStatusText = output;
    this.statusText.setText(output);
  }

  async handleSync() {
    if (this.syncing) return;
    this.syncing = true;

    this.currentStatusText += "\n\nSyncing...";
    this.statusText.setText(this.currentStatusText);
    this.tui.requestRender();

    try {
      const result = await emailSyncTool.execute(
        `email_sync_${Date.now()}`,
        {},
        undefined,
        (update) => {
          const textContent = update.content?.find((c) => c.type === "text");
          if (textContent && textContent.type === "text" && "text" in textContent) {
            this.currentStatusText += `\n${textContent.text}`;
            this.statusText.setText(this.currentStatusText);
            this.tui.requestRender();
          }
        }
      );
      await this.refreshStatus();
    } catch (e) {
      this.currentStatusText += `\n\n❌ Sync failed: ${(e as Error).message}`;
      this.statusText.setText(this.currentStatusText);
    }
    this.syncing = false;
    this.tui.requestRender();
  }

  handleInput(data: string) {
    if (data === "r") {
      this.refreshStatus();
    } else if (data === "s") {
      this.handleSync();
    }
  }

  invalidate(): void {
    this.statusText.invalidate();
  }

  focus() {
    this.tui.setFocus(this);
  }
}
