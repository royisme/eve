/**
 * Eve Bootstrap - Unified initialization path for TUI/CLI/HTTP
 * 
 * This module ensures consistent initialization of capabilities and agent
 * regardless of the entry point (TUI, CLI, or HTTP server).
 */

import { Agent } from "@mariozechner/pi-agent-core";
import { createEveAgent, initializeCapabilities, disposeCapabilities } from "./agent";
import { getCapabilities } from "../capabilities";
import type { Capability } from "../capabilities/types";

export interface EveCore {
  agent: Agent;
  capabilities: Capability[];
}

let eveCore: EveCore | null = null;
let initialized = false;
let initPromise: Promise<EveCore> | null = null;
let shutdownHandlersRegistered = false;

/**
 * Bootstrap Eve - Initialize capabilities and create the main agent.
 * This function is idempotent - calling it multiple times returns the same instance.
 */
export async function bootstrap(): Promise<EveCore> {
  // Return existing instance if already initialized
  if (initialized && eveCore) {
    return eveCore;
  }

  // Return existing promise if initialization is in progress
  if (initPromise) {
    return initPromise;
  }

  // Start initialization
  initPromise = (async () => {
    try {
      console.log("🚀 Bootstrapping Eve...");

      await initializeCapabilities();
      const capabilities = await getCapabilities();
      console.log(`📦 Loaded ${capabilities.length} capabilities: ${capabilities.map(c => c.name).join(", ")}`);

      const agent = await createEveAgent();
      console.log(`🤖 Eve agent ready with ${agent.state.tools.length} tools`);

      eveCore = { agent, capabilities };
      initialized = true;

      setupShutdownHandlers();

      return eveCore;
    } catch (error) {
      console.error("❌ Bootstrap failed:", error);
      initPromise = null;
      throw error;
    }
  })();

  return initPromise;
}

/**
 * Shutdown Eve gracefully - Dispose capabilities and cleanup.
 */
export async function shutdown(): Promise<void> {
  if (!initialized || !eveCore) {
    return;
  }

  console.log("👋 Shutting down Eve...");

  try {
    await disposeCapabilities();
    eveCore = null;
    initialized = false;
    initPromise = null;
    console.log("✅ Eve shutdown complete");
  } catch (error) {
    console.error("❌ Shutdown error:", error);
  }
}

/**
 * Get the current Eve core instance.
 * Throws if not initialized - use bootstrap() first.
 */
export function getEveCore(): EveCore {
  if (!initialized || !eveCore) {
    throw new Error("Eve not initialized. Call bootstrap() first.");
  }
  return eveCore;
}

/**
 * Check if Eve is initialized.
 */
export function isInitialized(): boolean {
  return initialized && eveCore !== null;
}

/**
 * Setup graceful shutdown handlers for SIGINT/SIGTERM.
 */
function setupShutdownHandlers(): void {
  if (shutdownHandlersRegistered) return;
  
  const handleShutdown = async (signal: string) => {
    console.log(`\n📡 Received ${signal}, shutting down...`);
    await shutdown();
    process.exit(0);
  };

  process.on("SIGINT", () => handleShutdown("SIGINT"));
  process.on("SIGTERM", () => handleShutdown("SIGTERM"));
  
  shutdownHandlersRegistered = true;
}

/**
 * Quick helper to get the Eve agent.
 * Initializes if not already done.
 */
export async function getAgent(): Promise<Agent> {
  const core = await bootstrap();
  return core.agent;
}
