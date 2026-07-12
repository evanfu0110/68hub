import { useEffect, useState } from 'react';
import { usePolling } from '../hooks/usePolling';
import { api } from '../api/client';
import { Loading } from '../components/Loading';
import { UsageTable } from '../components/UsageTable';
import type { OpenCodeAccount } from '../api/types';

export function UsageRecords() {
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
          <h1 className="text-xl font-semibold">使用记录</h1>
          <p className="text-sm text-base-content/50 mt-1">详细的使用记录日志，共 {total.toLocaleString()} 条</p>
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
            <option value="">全部账户</option>
            {(accounts ?? []).map((a: OpenCodeAccount) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
          <button className="btn btn-ghost btn-sm" onClick={() => refetch()}>
            刷新
          </button>
        </div>
      </div>

      <div className="bg-base-100 border border-base-200 rounded-box shadow-sm">
        <UsageTable records={records} showAccount />
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-base-content/40">
            第 {page + 1} / {totalPages} 页
          </span>
          <div className="flex gap-2">
            <button
              className="btn btn-ghost btn-sm"
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              上一页
            </button>
            <button
              className="btn btn-ghost btn-sm"
              disabled={page + 1 >= totalPages}
              onClick={() => setPage((p) => (p + 1 < totalPages ? p + 1 : p))}
            >
              下一页
            </button>
          </div>
        </div>
      )}

      {loading && <Loading />}
    </div>
  );
}
