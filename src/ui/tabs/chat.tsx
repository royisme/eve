import { Container, Text, Input, TUI, Box } from "@mariozechner/pi-tui";
import { getEveCore, isInitialized } from "../../core/bootstrap";

export class ChatTab extends Container {
  private history: Text;
  private input: Input;
  private tui: TUI;
  private isProcessing = false;
  private _historyText = "";

  constructor(tui: TUI) {
    super();
    this.tui = tui;

    this.history = new Text("");
    this.addChild(this.history);
    this.appendMessage("eve", "Hello! I'm Eve. How can I help you?");

    const inputBox = new Box(0, 0);
    this.input = new Input();
    this.input.onSubmit = (val) => this.handleSubmit(val);
    inputBox.addChild(this.input);
    
    this.addChild(inputBox);
  }

  appendMessage(role: "user" | "eve", text: string) {
    const color = role === "user" ? "\x1b[32m" : "\x1b[36m"; 
    const reset = "\x1b[0m";
    const prefix = role === "user" ? "You" : "Eve";
    const formatted = `\n${color}${prefix}:${reset} ${text}`;
    
    this._historyText += formatted;
    this.history.setText(this._historyText);
    
    this.tui.requestRender();
  }

  async handleSubmit(text: string) {
    if (!text.trim() || this.isProcessing) return;

    this.appendMessage("user", text);
    this.input.setValue(""); 
    this.isProcessing = true;
    this.tui.requestRender();

    try {
        if (!isInitialized()) {
            this.appendMessage("eve", "⚠️ Eve is not initialized yet.");
            this.isProcessing = false;
            return;
        }

        const core = getEveCore();
        let response = "";

        const unsubscribe = core.agent.subscribe((event) => {
             if (event.type === "message_update" && event.assistantMessageEvent?.type === "text_delta") {
                 response += event.assistantMessageEvent.delta;
             }
        });

        try {
            await core.agent.prompt(text);
        } finally {
            unsubscribe();
        }

        this.appendMessage("eve", response || "I processed your request.");

    } catch (e) {
        this.appendMessage("eve", `❌ Error: ${(e as Error).message}`);
    }

    this.isProcessing = false;
    this.tui.requestRender();
    this.tui.setFocus(this.input);
  }

  focus() {
      this.tui.setFocus(this.input);
  }
}
