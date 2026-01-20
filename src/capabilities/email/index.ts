import type { Capability } from "../types";
import { emailStatusTool, emailSetupTool } from "./tools/status";
import { emailSyncTool } from "./tools/sync";
import { accountTools } from "./tools/accounts";

export const emailCapability: Capability = {
  name: "email",
  description: "Email/Gmail integration - check status, setup accounts, manage multiple accounts, and sync job-related emails",
  tools: [emailStatusTool, emailSetupTool, emailSyncTool, ...accountTools],
};
