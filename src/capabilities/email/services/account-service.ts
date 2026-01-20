import { db } from '../../../core/db';
import { emailAccounts, sysConfig, type EmailAccount } from '../../../db/schema';
import { eq } from 'drizzle-orm';

export interface AccountInfo {
  id: number;
  email: string;
  isPrimary: boolean;
  isAuthorized: boolean;
  alias?: string | null;
  lastSyncAt?: string | null;
}

function toAccountInfo(row: EmailAccount): AccountInfo {
  return {
    id: row.id,
    email: row.email,
    isPrimary: !!row.isPrimary,
    isAuthorized: !!row.isAuthorized,
    alias: row.alias,
    lastSyncAt: row.lastSyncAt,
  };
}

export async function listAccounts(): Promise<AccountInfo[]> {
  const rows = await db.select().from(emailAccounts).all();
  return rows.map(toAccountInfo);
}

export async function getPrimaryAccount(): Promise<AccountInfo | null> {
  const row = await db.select().from(emailAccounts)
    .where(eq(emailAccounts.isPrimary, 1)).get();
  return row ? toAccountInfo(row) : null;
}

export async function getAuthorizedAccounts(): Promise<AccountInfo[]> {
  const rows = await db.select().from(emailAccounts)
    .where(eq(emailAccounts.isAuthorized, 1)).all();
  return rows.map(toAccountInfo);
}

export async function setPrimaryAccount(email: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.update(emailAccounts).set({ isPrimary: 0 });
    await tx.update(emailAccounts)
      .set({ isPrimary: 1 })
      .where(eq(emailAccounts.email, email));
  });
}

export async function addAccount(email: string, options?: { 
  alias?: string; 
  isPrimary?: boolean;
  isAuthorized?: boolean;
}): Promise<AccountInfo> {
  const existing = await db.select().from(emailAccounts)
    .where(eq(emailAccounts.email, email)).get();
  
  if (existing) {
    const updates: Partial<EmailAccount> = {};
    if (options?.alias !== undefined) updates.alias = options.alias;
    if (options?.isPrimary !== undefined) updates.isPrimary = options.isPrimary ? 1 : 0;
    if (options?.isAuthorized !== undefined) updates.isAuthorized = options.isAuthorized ? 1 : 0;
    
    if (Object.keys(updates).length > 0) {
      await db.update(emailAccounts).set(updates).where(eq(emailAccounts.id, existing.id));
    }
    
    const updated = await db.select().from(emailAccounts)
      .where(eq(emailAccounts.id, existing.id)).get();
    return toAccountInfo(updated!);
  }
  
  const [result] = await db.insert(emailAccounts).values({
    email,
    alias: options?.alias,
    isPrimary: options?.isPrimary ? 1 : 0,
    isAuthorized: options?.isAuthorized ? 1 : 0,
  }).returning();
  
  return toAccountInfo(result);
}

export async function removeAccount(email: string): Promise<void> {
  await db.delete(emailAccounts).where(eq(emailAccounts.email, email));
}

export async function updateAccountAuth(email: string, isAuthorized: boolean): Promise<void> {
  await db.update(emailAccounts)
    .set({ isAuthorized: isAuthorized ? 1 : 0 })
    .where(eq(emailAccounts.email, email));
}

export async function updateLastSync(email: string): Promise<void> {
  await db.update(emailAccounts)
    .set({ lastSyncAt: new Date().toISOString() })
    .where(eq(emailAccounts.email, email));
}

export async function getAccountByEmail(email: string): Promise<AccountInfo | null> {
  const row = await db.select().from(emailAccounts)
    .where(eq(emailAccounts.email, email)).get();
  return row ? toAccountInfo(row) : null;
}

export async function migrateFromLegacyConfig(): Promise<{ migrated: number; skipped: number }> {
  const legacyConfig = await db.select().from(sysConfig)
    .where(eq(sysConfig.key, 'services.google.accounts')).get();
  
  if (!legacyConfig) {
    return { migrated: 0, skipped: 0 };
  }

  let legacyAccounts: string[] = [];
  try {
    legacyAccounts = JSON.parse(legacyConfig.value);
  } catch {
    return { migrated: 0, skipped: 0 };
  }

  let migrated = 0;
  let skipped = 0;
  const isFirstAccount = (await listAccounts()).length === 0;

  for (let i = 0; i < legacyAccounts.length; i++) {
    const email = legacyAccounts[i];
    const existing = await getAccountByEmail(email);
    
    if (existing) {
      skipped++;
      continue;
    }

    await addAccount(email, {
      isPrimary: isFirstAccount && i === 0,
      isAuthorized: true,
    });
    migrated++;
  }

  return { migrated, skipped };
}

export async function ensureAccountsInitialized(): Promise<void> {
  const accounts = await listAccounts();
  if (accounts.length === 0) {
    await migrateFromLegacyConfig();
  }
}
