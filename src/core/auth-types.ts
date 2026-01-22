export type AuthProfileType = "oauth" | "api_key";

export type OAuthProvider =
  | "anthropic"
  | "openai"
  | "github_copilot"
  | "gemini"
  | "antigravity";

export type ApiKeyProvider =
  | "openai"
  | "anthropic"
  | "google"
  | "openrouter"
  | "custom";

export type OAuthProfile = {
  type: "oauth";
  provider: OAuthProvider;
  access: string;
  refresh?: string;
  expires?: number; // epoch ms
};

export type ApiKeyProfile = {
  type: "api_key";
  provider: ApiKeyProvider;
  api_key: string;
};

export type AuthProfile = OAuthProfile | ApiKeyProfile;

export type AuthFile = {
  version: 1;
  profiles: Record<string, AuthProfile>; // key format: `${provider}:${type}`
};

export function isOAuthProfile(profile: AuthProfile): profile is OAuthProfile {
  return profile.type === "oauth";
}

export function isApiKeyProfile(profile: AuthProfile): profile is ApiKeyProfile {
  return profile.type === "api_key";
}
