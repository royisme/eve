import { FileSystemMemoryManager, type MemoryManager } from "./MemoryManager";

let instance: MemoryManager | null = null;

export function getMemoryManager(): MemoryManager {
  if (!instance) {
    instance = new FileSystemMemoryManager();
  }
  return instance;
}

export type { MemoryManager };
export * from "./MemoryManager";
