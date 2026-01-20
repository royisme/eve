import { createHash } from "crypto";

const TRACKING_PARAMS = new Set([
  "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
  "gclid", "fbclid", "ref", "source", "trk", "trkInfo",
]);

const JOB_ID_PARAMS = new Set([
  "jobid", "jk", "gh_jid", "job_id", "id", "requisitionid",
  "currentjobid", "refid", "vjk", "fccid",
]);

export function generateUrlHash(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return createHash("sha256").update(url.toLowerCase()).digest("hex").slice(0, 16);
  }

  let normalized = parsed.host.toLowerCase() + parsed.pathname.toLowerCase().replace(/\/$/, "");

  const relevantParams: string[] = [];
  for (const [key, value] of parsed.searchParams.entries()) {
    const lowerKey = key.toLowerCase();
    if (JOB_ID_PARAMS.has(lowerKey)) {
      relevantParams.push(`${lowerKey}=${value}`);
    } else if (!TRACKING_PARAMS.has(lowerKey)) {
      relevantParams.push(`${lowerKey}=${value}`);
    }
  }

  if (relevantParams.length > 0) {
    relevantParams.sort();
    normalized += "?" + relevantParams.join("&");
  }

  return createHash("sha256").update(normalized).digest("hex").slice(0, 16);
}

export function normalizeUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    let normalized = parsed.host.toLowerCase() + parsed.pathname.toLowerCase().replace(/\/$/, "");

    const relevantParams: string[] = [];
    for (const [key, value] of parsed.searchParams.entries()) {
      const lowerKey = key.toLowerCase();
      if (JOB_ID_PARAMS.has(lowerKey)) {
        relevantParams.push(`${lowerKey}=${value}`);
      } else if (!TRACKING_PARAMS.has(lowerKey)) {
        relevantParams.push(`${lowerKey}=${value}`);
      }
    }

    if (relevantParams.length > 0) {
      relevantParams.sort();
      normalized += "?" + relevantParams.join("&");
    }

    return normalized;
  } catch {
    return null;
  }
}
