import { 
  TUI, 
  ProcessTerminal, 
  Box, 
  Text, 
  Container, 
  matchesKey, 
  Key 
} from "@mariozechner/pi-tui";
import { bootstrap, shutdown } from "../core/bootstrap";
import { ChatTab } from "./tabs/chat";
import { EmailTab } from "./tabs/email";
import { JobsTab } from "./tabs/jobs";

type TabType = "chat" | "email" | "jobs";
const TABS: { key: TabType; icon: string; label: string }[] = [
  { key: "chat", icon: "💬", label: "Chat" },
  { key: "email", icon: "📧", label: "Email" },
  { key: "jobs", icon: "💼", label: "Jobs" },
];

class EveApp extends Container {
  private tui: TUI;
  private currentTab: TabType = "chat";
  private tabComponents: Record<TabType, Container>;
  private header: Box;
  private contentArea: Container;
  private footer: Box;
  private headerText: Text | undefined;
  private initialized = false;

  constructor(tui: TUI) {
    super();
    this.tui = tui;

    this.header = new Box(1, 0, undefined);
    this.addChild(this.header);

    this.contentArea = new Container();
    this.addChild(this.contentArea);

    this.footer = new Box(1, 0, undefined);
    this.footer.addChild(new Text("1-3: Switch Tab | q: Quit | Arrows: Navigate"));
    this.addChild(this.footer);

    this.tabComponents = {
      chat: new ChatTab(tui),
      email: new EmailTab(tui),
      jobs: new JobsTab(tui),
    };

    this.updateHeaderVisuals();
    this.switchTab("chat");

    this.initEve();
  }

  async initEve() {
    try {
      await bootstrap();
      this.initialized = true;
      this.tui.requestRender();
    } catch (e) {
      const errorText = new Text(`Failed to start Eve: ${(e as Error).message}`);
      this.contentArea.addChild(errorText);
      this.tui.requestRender();
    }
  }

  handleInput(data: string) {
    if (data === "q" || matchesKey(data, Key.ctrl("c"))) {
      shutdown().then(() => process.exit(0));
      return;
    }

    if (data === "1") { this.switchTab("chat"); return; }
    if (data === "2") { this.switchTab("email"); return; }
    if (data === "3") { this.switchTab("jobs"); return; }

    const activeTab = this.tabComponents[this.currentTab];
    if (activeTab && "handleInput" in activeTab) {
      (activeTab as Container & { handleInput?: (data: string) => void }).handleInput?.(data);
    }
  }

  switchTab(tab: TabType) {
    this.currentTab = tab;
    
    while (this.contentArea.children.length > 0) {
      this.contentArea.removeChild(this.contentArea.children[0]);
    }
    
    const activeTab = this.tabComponents[tab];
    if (activeTab) {
      this.contentArea.addChild(activeTab);
    }
    
    this.updateHeaderVisuals();
    this.tui.requestRender();
  }

  updateHeaderVisuals() {
    const tabsStr = TABS.map((tab, i) => {
      const isSelected = this.currentTab === tab.key;
      const prefix = isSelected ? "\x1b[1;32m" : "\x1b[90m"; 
      const reset = "\x1b[0m";
      return `${prefix}[${i + 1}] ${tab.icon} ${tab.label}${reset}`;
    }).join("   ");
    
    if (!this.headerText) {
      this.headerText = new Text(tabsStr);
      this.header.addChild(this.headerText);
    } else {
      this.headerText.setText(tabsStr);
    }
  }

  render(width: number): string[] {
    const headerLines = this.header.render(width);
    const footerLines = this.footer.render(width);
    const contentLines = this.contentArea.render(width);
    
    return [...headerLines, ...contentLines, ...footerLines];
  }
}

const terminal = new ProcessTerminal();
const tui = new TUI(terminal);
const app = new EveApp(tui);

tui.addChild(app);

terminal.start(
  (data) => {
    app.handleInput(data);
    tui.requestRender();
  }, 
  () => tui.requestRender()
);

tui.start();
