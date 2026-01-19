import type { Capability } from "./types";
import type { AgentTool } from "@mariozechner/pi-agent-core";
import { jobsCapability } from "./jobs";
import { emailCapability } from "./email";
import { resumeCapability } from "./resume";

const capabilities: Capability[] = [];

// Separate initialization to avoid circular dependencies
let initialized = false;
function ensureInitialized() {
  if (!initialized) {
    capabilities.push(jobsCapability);
    capabilities.push(emailCapability);
    capabilities.push(resumeCapability);
    initialized = true;
  }
}

export function registerCapability(capability: Capability): void {
  ensureInitialized();
  const existing = capabilities.find((c) => c.name === capability.name);
  if (existing) {
    throw new Error(`Capability "${capability.name}" is already registered`);
  }
  capabilities.push(capability);
  console.log(`[Eve] Capability registered: ${capability.name}`);
}

export function getCapabilities(): Capability[] {
  ensureInitialized();
  return [...capabilities];
}

export function getCapabilityTools(): AgentTool[] {
  ensureInitialized();
  return capabilities.flatMap((cap) => cap.tools);
}

export function getCapability(name: string): Capability | undefined {
  ensureInitialized();
  return capabilities.find((c) => c.name === name);
}
