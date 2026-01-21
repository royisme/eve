import { ContextStore } from "./ContextStore";

let instance: ContextStore | null = null;

export function getContextStore(): ContextStore {
  if (!instance) {
    instance = new ContextStore();
  }
  return instance;
}

export * from "./ContextStore";
export * from "./types";
export * from "./schema";
