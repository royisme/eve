import { existsSync, readFileSync, writeFileSync, chmodSync } from "node:fs";
import { join } from "node:path";
import { getDataDir } from "./data-dir";
import type { AuthFile, AuthProfile } from "./auth-types";
export type { AuthProfile, OAuthProfile, ApiKeyProfile, AuthFile } from "./auth-types";

const AUTH_FILE = "auth.json";

export class AuthStore {
  private static instance: AuthStore | null = null;
  private authFile: AuthFile = { version: 1, profiles: {} };
  private filePath: string;

  private constructor(dataDir?: string) {
    this.filePath = join(dataDir ?? getDataDir(), AUTH_FILE);
    this.load();
  }

  static getInstance(dataDir?: string): AuthStore {
    if (!this.instance || dataDir) {
      this.instance = new AuthStore(dataDir);
    }
    return this.instance;
  }

  getFilePath(): string {
    return this.filePath;
  }

  private load(): void {
    if (!existsSync(this.filePath)) {
      this.authFile = { version: 1, profiles: {} };
      return;
    }

    try {
      const content = readFileSync(this.filePath, "utf-8");
      const parsed = JSON.parse(content);
      
      if (parsed && typeof parsed === "object" && parsed.profiles) {
        this.authFile = {
          version: parsed.version ?? 1,
          profiles: parsed.profiles,
        };
      }
    } catch {
      this.authFile = { version: 1, profiles: {} };
    }
  }

  save(): void {
    writeFileSync(this.filePath, JSON.stringify(this.authFile, null, 2), "utf-8");
    this.ensurePermissions();
  }

  private ensurePermissions(): void {
    try {
      chmodSync(this.filePath, 0o600);
    } catch {
      // Ignore permission errors (may not be supported on all platforms)
    }
  }

  listProfiles(): Array<{ id: string; profile: AuthProfile }> {
    return Object.entries(this.authFile.profiles).map(([id, profile]) => ({
      id,
      profile: profile as AuthProfile,
    }));
  }

  getProfile(id: string): AuthProfile | undefined {
    return this.authFile.profiles[id];
  }

  hasAuth(provider: string): boolean {
    for (const [id, profile] of Object.entries(this.authFile.profiles)) {
      if (id.startsWith(`${provider}:`)) {
        return true;
      }
    }
    return false;
  }

  getApiKey(provider: string): string | undefined {
    for (const [id, profile] of Object.entries(this.authFile.profiles)) {
      if (id.startsWith(`${provider}:`)) {
        if (profile.type === "api_key") {
          return profile.api_key;
        }
        if (profile.type === "oauth") {
          return profile.access;
        }
      }
    }
    return undefined;
  }

  getOAuthProfile(provider: string): { access: string; refresh?: string; expires?: number } | undefined {
    for (const [id, profile] of Object.entries(this.authFile.profiles)) {
      if (id.startsWith(`${provider}:`) && profile.type === "oauth") {
        return {
          access: profile.access,
          refresh: profile.refresh,
          expires: profile.expires,
        };
      }
    }
    return undefined;
  }

  setProfile(id: string, profile: AuthProfile): void {
    this.authFile.profiles[id] = profile;
    this.save();
  }

  removeProfile(id: string): boolean {
    if (this.authFile.profiles[id]) {
      delete this.authFile.profiles[id];
      this.save();
      return true;
    }
    return false;
  }

  clear(): void {
    this.authFile = { version: 1, profiles: {} };
    this.save();
  }
}
