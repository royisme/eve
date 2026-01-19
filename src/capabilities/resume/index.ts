import { Capability } from "../types";
import { resumeListTool } from "./tools/list";
import { resumeImportTool } from "./tools/import";
import { resumeGetTool } from "./tools/get";
import { resumeUpdateTool } from "./tools/update";
import { resumeDeleteTool } from "./tools/delete";
import { resumeSetDefaultTool } from "./tools/set-default";

export const resumeCapability: Capability = {
  name: "resume",
  description: "Resume management - import, edit, and manage multiple resumes.",
  tools: [
    resumeListTool,
    resumeImportTool,
    resumeGetTool,
    resumeUpdateTool,
    resumeDeleteTool,
    resumeSetDefaultTool,
  ],
};
