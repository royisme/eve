import { Type } from "@sinclair/typebox";
import type { AgentTool } from "@mariozechner/pi-agent-core";
import { listResumes } from "../services/resume-service";

export const resumeListTool: AgentTool<any, any> = {
  name: "resume_list",
  label: "List Resumes",
  description: "List all imported resumes in the library.",
  parameters: Type.Object({}),
  execute: async (_toolCallId, _params) => {
    try {
      const resumes = await listResumes();
      if (resumes.length === 0) {
        return {
          content: [{ type: "text", text: "No resumes found in the library. Use 'resume_import' to add one." }],
          details: {},
        };
      }

      let text = "## 📄 Your Resume Library\n\n";
      resumes.forEach((r) => {
        const defaultMark = r.isDefault ? " ⭐" : "";
        text += `- **${r.name}** (ID: ${r.id})${defaultMark}\n`;
        text += `  Updated: ${r.updatedAt} | Source: ${r.source}\n`;
      });

      return {
        content: [{ type: "text", text }],
        details: { resumes },
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error listing resumes: ${(error as Error).message}` }],
        details: { error: (error as Error).message },
      };
    }
  },
};
