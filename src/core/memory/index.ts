import { FileSystemMemoryManager } from "./MemoryManager";

let instance: FileSystemMemoryManager | null = null;

export function getMemoryManager(): FileSystemMemoryManager {
  if (!instance) {
    instance = new FileSystemMemoryManager();
  }
  return instance;
}

export * from "./MemoryManager";
