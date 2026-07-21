import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { usePolling } from '../hooks/usePolling';
import { api } from '../api/client';
import type { OpenCodeAccount } from '../api/types';
import { DailyChart } from '../components/DailyChart';

export function DailyTrends() {
  const { t } = useTranslation();
  const [days, setDays] = useState(30);
  const [accountId, setAccountId] = useState('');
  const [mode, setMode] = useState<'cost' | 'requests'>('cost');

  const { data: accounts } = usePolling(() => api.listOpenCodeAccounts(), 120000);

  const aid = accountId || undefined;
  const { data } = usePolling(
    () => api.getDailyStats(days, aid),
    60000,
  );

  const stats = data?.stats ?? [];

  const totalCost = stats.reduce((s, d) => s + d.total_cost_usd, 0);
  const totalRequests = stats.reduce((s, d) => s + d.request_count, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold">{t('dailyTrends.title')}</h1>
          <p className="text-xs text-base-content/40 mt-1">{t('dailyTrends.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            className="select select-bordered select-sm w-36"
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
          >
            <option value="">{t('common.allAccounts')}</option>
            {(accounts ?? []).map((a: OpenCodeAccount) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
          <select
            className="select select-bordered select-sm w-24"
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
          >
            <option value={7}>{t('timeRange.7days')}</option>
            <option value={14}>{t('timeRange.14days')}</option>
            <option value={30}>{t('timeRange.30days')}</option>
            <option value={90}>{t('timeRange.90days')}</option>
          </select>
        </div>
      </div>

      <div className="flex gap-4 text-sm">
        <div className="border border-base-200 rounded-lg px-4 py-2.5 flex-1">
          <div className="text-[11px] font-bold text-base-content/40 uppercase">{t('dailyTrends.totalCost')}</div>
          <div className="text-lg font-bold mt-0.5">${totalCost.toFixed(4)}</div>
        </div>
        <div className="border border-base-200 rounded-lg px-4 py-2.5 flex-1">
          <div className="text-[11px] font-bold text-base-content/40 uppercase">{t('dailyTrends.totalRequests')}</div>
          <div className="text-lg font-bold mt-0.5">{totalRequests.toLocaleString()}</div>
        </div>
      </div>

      <div className="tabs tabs-box bg-base-200 p-1">
        <button
          className={`tab tab-sm ${mode === 'cost' ? 'tab-active' : ''}`}
          onClick={() => setMode('cost')}
        >
          {t('dailyTrends.tabCost')}
        </button>
        <button
          className={`tab tab-sm ${mode === 'requests' ? 'tab-active' : ''}`}
          onClick={() => setMode('requests')}
        >
          {t('dailyTrends.tabRequests')}
        </button>
      </div>

      <div className="border border-base-200 rounded-xl overflow-hidden">
        <div className="p-4">
          <h3 className="text-xs font-bold text-base-content/50 uppercase mb-2">
            {mode === 'cost' ? t('dailyTrends.chartCost') : t('dailyTrends.chartRequests')}
          </h3>
          {stats.length === 0 ? (
            <div className="flex items-center justify-center h-48 text-base-content/40 text-sm">
              {t('common.noData')}
            </div>
          ) : (
            <DailyChart data={stats} mode={mode} />
          )}
        </div>
      </div>
    </div>
  );
}
