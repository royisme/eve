import type { Capability } from "./types";
import type { AgentTool } from "@mariozechner/pi-agent-core";

const capabilities: Capability[] = [];
let initialized = false;

async function ensureInitialized() {
  if (!initialized) {
    initialized = true;
    const [{ jobsCapability }, { emailCapability }, { resumeCapability }, { schedulerCapability }] = await Promise.all([
      import("./jobs"),
      import("./email"),
      import("./resume"),
      import("./scheduler"),
    ]);
    capabilities.push(jobsCapability);
    capabilities.push(emailCapability);
    capabilities.push(resumeCapability);
    capabilities.push(schedulerCapability);
  }
}

export function registerCapability(capability: Capability): void {
  const existing = capabilities.find((c) => c.name === capability.name);
  if (existing) {
    throw new Error(`Capability "${capability.name}" is already registered`);
  }
  capabilities.push(capability);
  console.log(`[Eve] Capability registered: ${capability.name}`);
}

export async function getCapabilities(): Promise<Capability[]> {
  await ensureInitialized();
  return [...capabilities];
}

export async function getCapabilityTools(): Promise<AgentTool[]> {
  await ensureInitialized();
  return capabilities.flatMap((cap) => cap.tools);
}

export async function getCapability(name: string): Promise<Capability | undefined> {
  await ensureInitialized();
  return capabilities.find((c) => c.name === name);
}
