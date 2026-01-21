import { FileSystemMemoryManager, type MemoryManager } from "./MemoryManager";

let instance: MemoryManager | null = null;

/**
 * Provides a singleton MemoryManager instance.
 *
 * @returns The module-scoped `MemoryManager` singleton; if no instance exists, a new `FileSystemMemoryManager` is created and returned.
 */
export function getMemoryManager(): MemoryManager {
  if (!instance) {
    instance = new FileSystemMemoryManager();
  }
  return instance;
}

export type { MemoryManager };
export * from "./MemoryManager";