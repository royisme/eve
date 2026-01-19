import type { Capability } from "../types";
import { emailStatusTool, emailSetupTool } from "./tools/status";
import { emailSyncTool } from "./tools/sync";

export const emailCapability: Capability = {
  name: "email",
  description: "Email/Gmail integration - check status, setup accounts, and sync job-related emails",
  tools: [emailStatusTool, emailSetupTool, emailSyncTool],
};
