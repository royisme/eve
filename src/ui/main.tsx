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

// Tab definitions
type TabType = "chat" | "email" | "jobs";
const TABS: { key: TabType; icon: string; label: string }[] = [
  { key: "chat", icon: "💬", label: "Chat" },
  { key: "email", icon: "📧", label: "Email" },
  { key: "jobs", icon: "💼", label: "Jobs" },
];

class EveApp extends Container {
  private tui: TUI;
  private currentTab: TabType = "chat";
  private tabComponents: { [key: string]: Container } = {};
  private header: Box;
  private contentArea: Container;
  private footer: Box;
  private initialized = false;

  constructor(tui: TUI) {
    super();
    this.tui = tui;

    // 1. Header
    this.header = new Box(1, 0, undefined);
    this.addChild(this.header);

    // 2. Content Area
    this.contentArea = new Container();
    this.addChild(this.contentArea);

    // 3. Footer
    this.footer = new Box(1, 0, undefined);
    this.footer.addChild(new Text("1-3: Switch Tab | q: Quit | Arrows: Navigate"));
    this.addChild(this.footer);

    // Initialize tabs
    this.tabComponents["chat"] = new ChatTab(tui);
    this.tabComponents["email"] = new EmailTab(tui);
    this.tabComponents["jobs"] = new JobsTab(tui);

    // Initial render setup
    this.updateHeader();
    this.switchTab("chat");

    // Bootstrap Eve
    this.initEve();
  }

  async initEve() {
    try {
      await bootstrap();
      this.initialized = true;
    } catch (e) {
      this.tui.addChild(new Text(`Failed to start Eve: ${(e as Error).message}`));
    }
  }

  updateHeader() {
    // Clear header
    // Since Box doesn't have clear(), we can set text or rebuild children.
    // Box doesn't support removeChild easily if we don't have the ref? 
    // Wait, Container has removeChild.
    // Let's just create a new Text component for the header line.
    
    const tabsStr = TABS.map((tab, i) => {
      const isSelected = this.currentTab === tab.key;
      // We can't easily color parts of a string in one Text component unless we use ANSI codes manually 
      // or multiple Text components.
      // pi-tui Text supports ANSI.
      const prefix = isSelected ? "\x1b[1;32m" : "\x1b[90m"; // Green bold or Gray
      const reset = "\x1b[0m";
      return `${prefix}[${i + 1}] ${tab.icon} ${tab.label}${reset}`;
    }).join("  ");

    // Reconstruct header children
    // Assuming Box extends Container
    // We need to clear existing children first?
    // Container doesn't have clearChildren?
    // We'll just create a Text component and update its text.
  }

  render(width: number): string[] {
    // We override render to layout our children vertically
    // Actually, Container doesn't automatically layout vertically unless we use Box with specific logic?
    // No, Container just renders children.
    // We should probably just use the TUI's main container logic or implement layout here.
    
    // Layout:
    // Header (fixed height)
    // Content (flex)
    // Footer (fixed height)
    
    // Since pi-tui is simple, we might need to manually call render on children with specific heights?
    // But Component.render takes 'width'.
    
    // Let's rely on standard rendering for now.
    // We need to position things. 
    // Actually, pi-tui's Container just paints children one after another?
    // No, Container.render returns combined lines.
    
    // Let's simplify: 
    // We will just return the lines from header + content + footer.
    
    const headerLines = this.header.render(width);
    const footerLines = this.footer.render(width);
    
    // Calculate remaining height for content?
    // Component.render only takes width. TUI handles height awareness for scrolling?
    // pi-tui components are usually "flow" based (height is determined by content).
    // If we want a fixed fullscreen app, we might need to pad the content.
    
    const contentLines = this.contentArea.render(width);
    
    return [...headerLines, ...contentLines, ...footerLines];
  }
  
  // Custom method to handle input at App level
  handleInput(data: string) {
    if (data === "q" || (matchesKey(data, Key.ctrl("c")))) {
      shutdown().then(() => process.exit(0));
      return;
    }

    if (data === "1") this.switchTab("chat");
    if (data === "2") this.switchTab("email");
    if (data === "3") this.switchTab("jobs");

    // Pass input to current tab
    const activeTab = this.tabComponents[this.currentTab];
    if (activeTab && activeTab.handleInput) {
      activeTab.handleInput(data);
    }
  }

  switchTab(tab: TabType) {
    this.currentTab = tab;
    
    // Update Content Area
    // We need to clear contentArea and add the new tab
    // Since Container doesn't expose children array publicly in a mutable way easily (maybe it does?)
    // Let's check Container definition or just hack it.
    // Actually, Container has 'children' property usually.
    // But better to use removeChild/addChild.
    
    // Hack: we'll just implement render to return the correct tab's output
    // But we also need handleInput to go to the right place.
    
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
    
    // We can just use a single Text component for the header
    // We need to update it.
    // Let's store reference to headerText.
    if (!this.headerText) {
       this.headerText = new Text(tabsStr);
       this.header.addChild(this.headerText);
    } else {
       this.headerText.setText(tabsStr);
    }
    
    // Add "Eve v0.3.0"
    if (!this.titleText) {
        this.titleText = new Text("\x1b[1;36mEve v0.3.0\x1b[0m"); // Cyan
        // Insert at beginning? Container uses push.
        // Let's just recreate header children if needed or keep it simple.
        // Actually, let's make header a Container and put Title then Tabs.
    }
  }

  private headerText: Text | undefined;
  private titleText: Text | undefined;
}

// ... main execution ...
const terminal = new ProcessTerminal();
const tui = new TUI(terminal);

// We need to handle input manually and route it to our App
terminal.start((data) => {
    app.handleInput(data);
    tui.requestRender(); // Ensure re-render on input
}, () => tui.requestRender());

const app = new EveApp(tui);
tui.addChild(app);

// Initial render
tui.start();
