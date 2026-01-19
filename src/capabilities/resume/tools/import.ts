import { Type } from "@sinclair/typebox";
import type { AgentTool } from "@mariozechner/pi-agent-core";
import { importResume } from "../services/resume-service";

export const resumeImportTool: AgentTool<any, any> = {
  name: "resume_import",
  label: "Import Resume",
  description: "Import a resume into the library from Markdown text or a Base64 encoded PDF.",
  parameters: Type.Object({
    name: Type.String({ description: "Name for this resume (e.g., 'Software Engineer 2024')" }),
    content: Type.String({ description: "Markdown text or Base64 encoded PDF string" }),
    format: Type.Enum({ markdown: 'markdown', pdf: 'pdf' }, { description: "Format of the content" }),
    filename: Type.Optional(Type.String({ description: "Original filename" })),
  }),
  execute: async (_id, params) => {
    try {
      const resume = await importResume(params);
      
      let text = `✅ Resume **${resume.name}** imported successfully (ID: ${resume.id}).`;
      if (resume.parseStatus !== 'success') {
        text += `\n⚠️ Note: PDF parsing status was '${resume.parseStatus}'. Please review the content.`;
      }

      return {
        content: [{ type: "text", text }],
        details: { resume },
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `❌ Failed to import resume: ${(error as Error).message}` }],
        details: { error: (error as Error).message },
      };
    }
  },
};
