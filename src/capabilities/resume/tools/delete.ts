import { Type } from "@sinclair/typebox";
import type { AgentTool } from "@mariozechner/pi-agent-core";
import { deleteResume } from "../services/resume-service";

export const resumeDeleteTool: AgentTool<any, any> = {
  name: "resume_delete",
  label: "Delete Resume",
  description: "Permanently delete a resume from the library.",
  parameters: Type.Object({
    id: Type.Number({ description: "ID of the resume to delete" }),
  }),
  execute: async (_id, params) => {
    try {
      await deleteResume(params.id);
      return {
        content: [{ type: "text", text: `✅ Resume with ID ${params.id} deleted successfully.` }],
        details: { success: true },
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `❌ Error deleting resume: ${(error as Error).message}` }],
        details: { error: (error as Error).message },
      };
    }
  },
};
