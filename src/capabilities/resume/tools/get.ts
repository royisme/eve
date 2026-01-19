import { Type } from "@sinclair/typebox";
import type { AgentTool } from "@mariozechner/pi-agent-core";
import { getResume } from "../services/resume-service";

export const resumeGetTool: AgentTool<any, any> = {
  name: "resume_get",
  label: "Get Resume",
  description: "Get detailed information and content of a specific resume.",
  parameters: Type.Object({
    id: Type.Number({ description: "ID of the resume to fetch" }),
  }),
  execute: async (_id, params) => {
    try {
      const resume = await getResume(params.id);
      if (!resume) {
        return {
          content: [{ type: "text", text: `❌ Resume with ID ${params.id} not found.` }],
          details: { error: "not_found" },
        };
      }

      return {
        content: [{ type: "text", text: `## 📄 ${resume.name}\n\n${resume.content}` }],
        details: { resume },
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `❌ Error fetching resume: ${(error as Error).message}` }],
        details: { error: (error as Error).message },
      };
    }
  },
};
