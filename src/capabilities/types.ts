/**
 * Eve Capability System Types
 *
 * A Capability represents a domain of functionality that Eve can perform.
 * Each capability exposes AgentTools that the LLM can invoke.
 *
 * Examples: Jobs, Email, Calendar, SmartHome, etc.
 */

import type { AgentTool } from "@mariozechner/pi-agent-core";
import type { ConfigManager } from "../core/config";
import type { db } from "../db";

/**
 * Context provided to capabilities during initialization
 */
export interface CapabilityContext {
  /** Database instance */
  db: typeof db;
  /** Configuration manager */
  config: typeof ConfigManager;
}

/**
 * Capability interface - the contract for all Eve capabilities
 *
 * Each capability must:
 * - Have a unique name
 * - Export an array of AgentTools
 *
 * Optionally:
 * - Implement init() for setup (config validation, warmup, etc.)
 * - Implement dispose() for cleanup
 */
export interface Capability {
  /** Unique identifier for this capability */
  name: string;

  /** Human-readable description */
  description: string;

  /** AgentTools exposed by this capability */
  tools: AgentTool[];

  /**
   * Initialize the capability
   * Called once when Eve starts
   */
  init?: (ctx: CapabilityContext) => Promise<void> | void;

  /**
   * Cleanup resources
   * Called when Eve shuts down
   */
  dispose?: () => Promise<void> | void;
}

/**
 * Tool execution result with structured content
 */
export interface ToolResult {
  content: Array<{ type: "text"; text: string }>;
  details?: Record<string, unknown>;
}
