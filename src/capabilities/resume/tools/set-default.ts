import { Type } from "@sinclair/typebox";
import type { AgentTool } from "@mariozechner/pi-agent-core";
import { setDefaultResume } from "../services/resume-service";

export const resumeSetDefaultTool: AgentTool<any, any> = {
  name: "resume_set_default",
  label: "Set Default Resume",
  description: "Set a specific resume as the default for job analysis and tailoring.",
  parameters: Type.Object({
    id: Type.Number({ description: "ID of the resume to set as default" }),
  }),
  execute: async (_id, params) => {
    try {
      const resume = await setDefaultResume(params.id);
      if (!resume) {
        return {
          content: [{ type: "text", text: `❌ Resume with ID ${params.id} not found.` }],
          details: { error: "not_found" },
        };
      }

      return {
        content: [{ type: "text", text: `✅ Resume **${resume.name}** is now set as your default.` }],
        details: { resume },
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `❌ Error setting default resume: ${(error as Error).message}` }],
        details: { error: (error as Error).message },
      };
    }
  },
};
