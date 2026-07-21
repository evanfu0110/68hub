import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { usePolling } from '../hooks/usePolling';
import { api } from '../api/client';
import type { ModelTokenStat, OpenCodeAccount } from '../api/types';
import { ModelIcon } from '../components/ModelIcon';
import { ModelRankChart } from '../components/ModelRankChart';
import { DailyModelChart } from '../components/DailyModelChart';

export function TokenStats() {
  const { t } = useTranslation();
  const [days, setDays] = useState(30);
  const [accountId, setAccountId] = useState('');
  const [tab, setTab] = useState<'ranking' | 'daily'>('ranking');

  const { data: accounts } = usePolling(() => api.listOpenCodeAccounts(), 120000);

  const aid = accountId || undefined;
  const { data: modelTokens } = usePolling(
    () => api.getModelTokenStats(days, aid),
    60000,
    tab === 'ranking',
  );

  const { data: dailyModels } = usePolling(
    () => api.getDailyModelStats(days, aid),
    60000,
    tab === 'daily',
  );

  const stats = modelTokens?.stats ?? [];
  const dailyStats = dailyModels?.stats ?? [];

  const totalInput = stats.reduce((s, m) => s + m.total_input_tokens, 0);
  const totalOutput = stats.reduce((s, m) => s + m.total_output_tokens, 0);
  const totalCost = stats.reduce((s, m) => s + m.total_cost_usd, 0);
  const totalRequests = stats.reduce((s, m) => s + m.request_count, 0);

  const formatTokens = (v: number) => {
    if (v >= 1_000_000) return (v / 1_000_000).toFixed(2) + 'M';
    if (v >= 1_000) return (v / 1_000).toFixed(1) + 'K';
    return v.toString();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold">{t('tokenStats.title')}</h1>
          <p className="text-xs text-base-content/40 mt-1">{t('tokenStats.subtitle')}</p>
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
        {[
          { label: t('tokenStats.totalRequests'), value: totalRequests.toLocaleString() },
          { label: t('tokenStats.input'), value: formatTokens(totalInput) },
          { label: t('tokenStats.output'), value: formatTokens(totalOutput) },
          { label: t('tokenStats.totalCost'), value: `$${totalCost.toFixed(4)}` },
        ].map((item) => (
          <div key={item.label} className="border border-base-200 rounded-lg px-4 py-2.5 flex-1">
            <div className="text-[11px] font-bold text-base-content/40 uppercase">{item.label}</div>
            <div className="text-lg font-bold mt-0.5">{item.value}</div>
          </div>
        ))}
      </div>

      <div className="tabs tabs-box bg-base-200 p-1">
        <button
          className={`tab tab-sm ${tab === 'ranking' ? 'tab-active' : ''}`}
          onClick={() => setTab('ranking')}
        >
          {t('tokenStats.modelRanking')}
        </button>
        <button
          className={`tab tab-sm ${tab === 'daily' ? 'tab-active' : ''}`}
          onClick={() => setTab('daily')}
        >
          {t('tokenStats.dailyTrends')}
        </button>
      </div>

      {tab === 'ranking' && (
        <>
          <div className="border border-base-200 rounded-xl overflow-hidden">
            <div className="p-4">
              <h3 className="text-xs font-bold text-base-content/50 uppercase mb-2">{t('tokenStats.modelUsage')}</h3>
              <ModelRankChart data={stats} />
            </div>
          </div>

          <div className="border border-base-200 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="table table-sm">
                <thead>
                  <tr className="text-base-content/40 text-xs uppercase tracking-wider">
                    <th>{t('tokenStats.tableModel')}</th>
                    <th className="text-right">{t('tokenStats.tableRequests')}</th>
                    <th className="text-right">{t('tokenStats.tableInput')}</th>
                    <th className="text-right">{t('tokenStats.tableOutput')}</th>
                    <th className="text-right">{t('tokenStats.tableTotalTokens')}</th>
                    <th className="text-right">{t('tokenStats.tableCost')}</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center py-8 text-base-content/40 text-sm">
                        {t('common.noData')}
                      </td>
                    </tr>
                  ) : (
                    stats.map((m: ModelTokenStat) => (
                      <tr key={m.model} className="hover">
                        <td className="text-sm font-medium">
                          <div className="flex items-center gap-1.5">
                            <ModelIcon model={m.model} />
                            <span>{m.model}</span>
                          </div>
                        </td>
                        <td className="text-right text-sm tabular-nums">{m.request_count.toLocaleString()}</td>
                        <td className="text-right text-sm tabular-nums">{m.total_input_tokens.toLocaleString()}</td>
                        <td className="text-right text-sm tabular-nums">{m.total_output_tokens.toLocaleString()}</td>
                        <td className="text-right text-sm tabular-nums">
                          {(m.total_input_tokens + m.total_output_tokens).toLocaleString()}
                        </td>
                        <td className="text-right text-sm tabular-nums">${m.total_cost_usd.toFixed(6)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {tab === 'daily' && (
        <div className="border border-base-200 rounded-xl p-4">
          <h3 className="text-xs font-bold text-base-content/50 uppercase mb-2">{t('tokenStats.modelDailyTrends')}</h3>
          <DailyModelChart data={dailyStats} mode="cost" />
        </div>
      )}
    </div>
  );
}
