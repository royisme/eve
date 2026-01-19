import { Type } from "@sinclair/typebox";
import type { AgentTool } from "@mariozechner/pi-agent-core";
import { updateResume } from "../services/resume-service";

export const resumeUpdateTool: AgentTool<any, any> = {
  name: "resume_update",
  label: "Update Resume",
  description: "Update content or metadata of an existing resume.",
  parameters: Type.Object({
    id: Type.Number({ description: "ID of the resume to update" }),
    name: Type.Optional(Type.String({ description: "New name for the resume" })),
    content: Type.Optional(Type.String({ description: "New Markdown content" })),
    isDefault: Type.Optional(Type.Boolean({ description: "Set as default resume" })),
  }),
  execute: async (_id, params) => {
    try {
      const { id, ...data } = params;
      const resume = await updateResume(id, data);
      if (!resume) {
        return {
          content: [{ type: "text", text: `❌ Resume with ID ${id} not found.` }],
          details: { error: "not_found" },
        };
      }

      return {
        content: [{ type: "text", text: `✅ Resume **${resume.name}** updated successfully.` }],
        details: { resume },
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `❌ Error updating resume: ${(error as Error).message}` }],
        details: { error: (error as Error).message },
      };
    }
  },
};
