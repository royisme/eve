import { ConfigManager } from "../../../core/config";
import { GmailSource } from "../../../core/gmail";
import { Dispatcher } from "../../../core/dispatcher";

export interface GogAuthStatus {
  installed: boolean;
  version: string | null;
  accounts: AccountStatus[];
}

export interface AccountStatus {
  email: string;
  configured: boolean;
  authorized: boolean;
}

export async function checkGogInstalled(): Promise<{ installed: boolean; version: string | null }> {
  try {
    const proc = Bun.spawn(["gog", "--version"], { stdout: "pipe", stderr: "pipe" });
    const output = await new Response(proc.stdout).text();
    const match = output.match(/v[\d.]+/);
    return { installed: true, version: match ? match[0] : output.trim() };
  } catch {
    return { installed: false, version: null };
  }
}

export async function checkGogAuth(email: string): Promise<boolean> {
  try {
    const proc = Bun.spawn(["gog", "auth", "list"], { stdout: "pipe", stderr: "pipe" });
    const output = await new Response(proc.stdout).text();
    return output.toLowerCase().includes(email.toLowerCase());
  } catch {
    return false;
  }
}

export async function getConfiguredAccounts(): Promise<string[]> {
  return (await ConfigManager.get<string[]>("services.google.accounts", [])) || [];
}

export async function addConfiguredAccount(email: string): Promise<void> {
  const accounts = await getConfiguredAccounts();
  if (!accounts.includes(email)) {
    accounts.push(email);
    await ConfigManager.set("services.google.accounts", accounts, "email");
  }
}

export async function removeConfiguredAccount(email: string): Promise<void> {
  const accounts = await getConfiguredAccounts();
  const filtered = accounts.filter(a => a !== email);
  await ConfigManager.set("services.google.accounts", filtered, "email");
}

export async function getFullAuthStatus(): Promise<GogAuthStatus> {
  const gogStatus = await checkGogInstalled();
  const configuredAccounts = await getConfiguredAccounts();
  
  const accounts: AccountStatus[] = [];
  for (const email of configuredAccounts) {
    const authorized = gogStatus.installed ? await checkGogAuth(email) : false;
    accounts.push({
      email,
      configured: true,
      authorized,
    });
  }

  return {
    installed: gogStatus.installed,
    version: gogStatus.version,
    accounts,
  };
}

export async function initiateGogAuth(email: string): Promise<{ success: boolean; message: string; authUrl?: string }> {
  const gogStatus = await checkGogInstalled();
  if (!gogStatus.installed) {
    return {
      success: false,
      message: "gog CLI is not installed. Please install it first: https://github.com/pdfinn/gog",
    };
  }

  try {
    const proc = Bun.spawn(["gog", "auth", "add", email], {
      stdout: "pipe",
      stderr: "pipe",
    });
    
    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();
    const output = stdout + stderr;

    const urlMatch = output.match(/https:\/\/accounts\.google\.com[^\s]+/);
    if (urlMatch) {
      return {
        success: true,
        message: `Please visit the following URL to authorize: ${urlMatch[0]}`,
        authUrl: urlMatch[0],
      };
    }

    if (output.includes("already authorized") || output.includes("success")) {
      await addConfiguredAccount(email);
      return {
        success: true,
        message: `Account ${email} is already authorized.`,
      };
    }

    return {
      success: false,
      message: `Unexpected output from gog: ${output.substring(0, 200)}`,
    };
  } catch (error) {
    return {
      success: false,
      message: `Failed to initiate auth: ${(error as Error).message}`,
    };
  }
}

export interface SyncProgress {
  status: 'searching' | 'processing' | 'complete' | 'error';
  synced?: number;
  total?: number;
  newJobs?: number;
  message?: string;
}

export async function syncEmails(
  query: string = "from:linkedin OR from:indeed",
  maxThreads: number = 20,
  onProgress?: (progress: SyncProgress) => void
): Promise<{ synced: number; newJobs: number }> {
  const status = await getFullAuthStatus();
  const authorizedAccounts = status.accounts.filter(a => a.authorized);
  
  if (authorizedAccounts.length === 0) {
    throw new Error("No authorized Gmail accounts found.");
  }

  onProgress?.({ status: 'searching' });
  
  const gmail = new GmailSource();
  const emails = await gmail.search(query, maxThreads);

  onProgress?.({ status: 'processing', total: emails.length, synced: 0 });

  const dispatcher = new Dispatcher();
  let saved = 0;
  let processed = 0;

  for (const email of emails) {
    try {
      await dispatcher.dispatch(email);
      saved++;
    } catch (e) {
      console.error(`Error processing email: ${e}`);
    }
    processed++;
    onProgress?.({ status: 'processing', total: emails.length, synced: processed });
  }

  onProgress?.({ status: 'complete', synced: processed, newJobs: saved });
  
  return { synced: processed, newJobs: saved };
}
