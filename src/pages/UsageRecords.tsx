import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { usePolling } from '../hooks/usePolling';
import { api } from '../api/client';
import { Loading } from '../components/Loading';
import { UsageTable } from '../components/UsageTable';
import type { OpenCodeAccount } from '../api/types';

export function UsageRecords() {
  const { t } = useTranslation();
  const [page, setPage] = useState(0);
  const [accountId, setAccountId] = useState('');
  const limit = 50;

  const { data: accounts } = usePolling(
    () => api.listOpenCodeAccounts(),
    120000,
  );

  const { data, loading, refetch } = usePolling(
    () => api.getAllUsage(page * limit, limit, accountId || undefined),
    30000,
  );

  useEffect(() => { refetch(); }, [page, accountId, refetch]);

  const records = data?.records ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / limit);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">{t('usageRecords.title')}</h1>
          <p className="text-sm text-base-content/50 mt-1">{t('usageRecords.subtitle', { total: total.toLocaleString() })}</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            className="select select-bordered select-sm w-40"
            value={accountId}
            onChange={(e) => {
              setAccountId(e.target.value);
              setPage(0);
            }}
          >
            <option value="">{t('common.allAccounts')}</option>
            {(accounts ?? []).map((a: OpenCodeAccount) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
          <button className="btn btn-ghost btn-sm" onClick={() => refetch()}>
            {t('common.refresh')}
          </button>
        </div>
      </div>

      <div className="bg-base-100 border border-base-200 rounded-box shadow-sm">
        <UsageTable records={records} showAccount />
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-base-content/40">
            {t('common.page', { current: page + 1, total: totalPages })}
          </span>
          <div className="flex gap-2">
            <button
              className="btn btn-ghost btn-sm"
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              {t('common.prevPage')}
            </button>
            <button
              className="btn btn-ghost btn-sm"
              disabled={page + 1 >= totalPages}
              onClick={() => setPage((p) => (p + 1 < totalPages ? p + 1 : p))}
            >
              {t('common.nextPage')}
            </button>
          </div>
        </div>
      )}

      {loading && <Loading />}
    </div>
  );
}
