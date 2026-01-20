import type { Capability } from "../types";
import { cronTools } from "./tools/cron";

export const schedulerCapability: Capability = {
  name: "scheduler",
  description: "Manage scheduled cron jobs for automated tasks like email sync, reminders, and daily briefings.",
  tools: cronTools,
};
