import { Type } from "@sinclair/typebox";
import type { AgentTool } from "@mariozechner/pi-agent-core";
import { getFullAuthStatus, initiateGogAuth, addConfiguredAccount } from "../services/email-service";

export const emailStatusTool: AgentTool<any, any> = {
  name: "email_status",
  label: "Email Status",
  description: "Check the status of email/Gmail configuration including gog CLI installation and account authorization.",
  parameters: Type.Object({}),
  execute: async (_toolCallId, _params, _signal, onUpdate) => {
    onUpdate?.({
      content: [{ type: "text", text: "Checking email configuration status..." }],
      details: { status: "checking" }
    });

    const status = await getFullAuthStatus();

    let summary = "";
    if (!status.installed) {
      summary = "❌ gog CLI is not installed. Please install it first: https://github.com/pdfinn/gog";
    } else {
      summary = `✅ gog CLI installed (${status.version})\n\n`;
      
      if (status.accounts.length === 0) {
        summary += "⚠️ No email accounts configured.\n";
        summary += "To add an account, ask me to 'setup email for yourname@gmail.com'";
      } else {
        summary += "Configured accounts:\n";
        for (const acc of status.accounts) {
          const authIcon = acc.authorized ? "✅" : "❌";
          summary += `- ${authIcon} ${acc.email} (${acc.authorized ? "authorized" : "needs authorization"})\n`;
        }
      }
    }

    return {
      content: [{ type: "text", text: summary }],
      details: status,
    };
  },
};

export const emailSetupTool: AgentTool<any, any> = {
  name: "email_setup",
  label: "Setup Email",
  description: "Setup a Gmail account for Eve to access. This will initiate OAuth authorization if needed.",
  parameters: Type.Object({
    email: Type.String({ description: "Gmail address to authorize (e.g., yourname@gmail.com)" }),
  }),
  execute: async (_toolCallId, params, _signal, onUpdate) => {
    const { email } = params;

    if (!email || !email.includes("@")) {
      return {
        content: [{ type: "text", text: "❌ Please provide a valid email address." }],
        details: { error: "Invalid email" },
      };
    }

    onUpdate?.({
      content: [{ type: "text", text: `Setting up email access for ${email}...` }],
      details: { status: "initiating", email }
    });

    const result = await initiateGogAuth(email);

    if (result.success && result.authUrl) {
      await addConfiguredAccount(email);
      return {
        content: [{ 
          type: "text", 
          text: `🔗 **Authorization Required**\n\nPlease open this URL in your browser to authorize Eve to access your Gmail:\n\n${result.authUrl}\n\nAfter completing authorization, Eve will be able to sync your job-related emails.`
        }],
        details: { 
          status: "pending_auth",
          email,
          authUrl: result.authUrl 
        },
      };
    }

    if (result.success) {
      await addConfiguredAccount(email);
      return {
        content: [{ type: "text", text: `✅ ${result.message}` }],
        details: { status: "authorized", email },
      };
    }

    return {
      content: [{ type: "text", text: `❌ ${result.message}` }],
      details: { status: "error", error: result.message },
    };
  },
};
