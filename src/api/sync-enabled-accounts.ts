interface SyncableAccount {
  id: string;
  enabled: boolean;
}

interface UsageSyncResult {
  inserted: number;
}

interface SyncDependencies {
  listAccounts: () => Promise<SyncableAccount[]>;
  syncUsage: (id: string) => Promise<UsageSyncResult>;
}

export interface EnabledAccountsSyncResult {
  accountCount: number;
  inserted: number;
}

export async function syncEnabledAccounts({
  listAccounts,
  syncUsage,
}: SyncDependencies): Promise<EnabledAccountsSyncResult> {
  const accounts = (await listAccounts()).filter((account) => account.enabled);
  let inserted = 0;
  const failures: unknown[] = [];

  for (const account of accounts) {
    try {
      const result = await syncUsage(account.id);
      inserted += result.inserted;
    } catch (error) {
      failures.push(error);
    }
  }

  if (failures.length > 0) {
    const first = failures[0];
    const message = first instanceof Error ? first.message : String(first);
    throw new Error(`${failures.length}/${accounts.length} accounts failed: ${message}`);
  }

  return { accountCount: accounts.length, inserted };
}
