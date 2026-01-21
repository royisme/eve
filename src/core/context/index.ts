import { ContextStore } from "./ContextStore";

let instance: ContextStore | null = null;

/**
 * Returns the shared ContextStore singleton for the module, creating it if needed.
 *
 * @returns The shared ContextStore instance
 */
export function getContextStore(): ContextStore {
  if (!instance) {
    instance = new ContextStore();
  }
  return instance;
}

export * from "./ContextStore";
export * from "./types";
export * from "./schema";