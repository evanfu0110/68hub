import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { usePolling } from '../hooks/usePolling';
import { api } from '../api/client';
import type { ModelTokenStat, OpenCodeAccount } from '../api/types';
import { ModelIcon } from '../components/ModelIcon';
import { ModelRankChart } from '../components/ModelRankChart';
import { TokenBreakdownTooltip } from '../components/TokenBreakdownTooltip';
import { DailyChart } from '../components/DailyChart';
import { getStoredTimeRange, storeTimeRange, TimeRangeTabs, type TimeRange } from '../components/TimeRangeTabs';

const PERIOD_MAP: Record<TimeRange, string> = {
  today: 'today',
  '7d': '7d',
  '30d': '30d',
  all: 'all',
};

const TREND_DAYS: Record<TimeRange, number> = {
  today: 0,
  '7d': 7,
  '30d': 30,
  all: 365,
};

export function TokenStats() {
  const { t } = useTranslation();
  const [range, setRange] = useState<TimeRange>(getStoredTimeRange);
  const [accountId, setAccountId] = useState('');
  const [mode, setMode] = useState<'cost' | 'requests'>('cost');

  useEffect(() => {
    storeTimeRange(range);
  }, [range]);

  const { data: accounts } = usePolling(() => api.listOpenCodeAccounts(), 120000);

  const aid = accountId || undefined;
  const { data: modelTokens } = usePolling(
    () => api.getModelTokenStats(1, aid, PERIOD_MAP[range]),
    60000,
    true,
    [range, aid],
  );

  const { data: trendData } = usePolling(
    () => api.getDailyStats(TREND_DAYS[range], aid),
    60000,
    range !== 'today',
    [range, aid],
  );

  const stats = modelTokens?.stats ?? [];
  const trendStats = trendData?.stats ?? [];

  const totalInput = stats.reduce((s, m) => s + m.total_input_tokens, 0);
  const totalOutput = stats.reduce((s, m) => s + m.total_output_tokens, 0);
  const totalCost = stats.reduce((s, m) => s + m.total_cost_usd, 0);
  const totalRequests = stats.reduce((s, m) => s + m.request_count, 0);
  const uncachedInput = stats.reduce((s, m) => s + Number(m.uncached_input_tokens ?? m.total_input_tokens ?? 0), 0);
  const cacheHit = stats.reduce((s, m) => s + Number(m.cache_hit_tokens ?? 0), 0);
  const cacheWrite = stats.reduce((s, m) => s + Number(m.cache_write_tokens ?? 0), 0);
  const cacheHitRate = uncachedInput + cacheHit + cacheWrite > 0
    ? ((cacheHit / (uncachedInput + cacheHit + cacheWrite)) * 100).toFixed(1)
    : '0.0';

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
          <TimeRangeTabs value={range} onChange={setRange} />
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4 text-sm">
        {[
          { label: t('tokenStats.totalRequests'), value: totalRequests.toLocaleString() },
          {
            label: t('common.totalTokens'),
            value: formatTokens(totalInput + totalOutput),
            breakdown: {
              uncachedInput,
              cacheHit,
              cacheWrite,
              output: totalOutput,
            },
          },
          { label: t('tokenStats.totalCost'), value: `$${totalCost.toFixed(4)}` },
          { label: t('tokenStats.cacheHitRateLabel'), value: `${cacheHitRate}%` },
        ].map((item) => (
          <div key={item.label} className="border border-base-200 rounded-lg px-4 py-2.5 flex-1">
            <div className="text-[11px] font-bold text-base-content/40 uppercase">{item.label}</div>
            {item.breakdown ? (
              <TokenBreakdownTooltip {...item.breakdown}>
                <div className="text-lg font-bold mt-0.5">{item.value}</div>
              </TokenBreakdownTooltip>
            ) : (
              <div className="text-lg font-bold mt-0.5">{item.value}</div>
            )}
          </div>
        ))}
      </div>

      <div className="border border-base-200 rounded-xl overflow-hidden">
        <div className="p-4">
          <h3 className="text-xs font-bold text-base-content/50 uppercase mb-2">{t('tokenStats.modelUsage')}</h3>
          {stats.length === 0 ? (
            <div className="flex items-center justify-center h-48 text-base-content/40 text-sm">
              {t('common.noData')}
            </div>
          ) : (
            <ModelRankChart data={stats} />
          )}
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
                <th className="text-right">{t('tokenStats.tableCacheHitRate')}</th>
                <th className="text-right">{t('tokenStats.tableCost')}</th>
              </tr>
            </thead>
            <tbody>
              {stats.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-base-content/40 text-sm">
                    {t('common.noData')}
                  </td>
                </tr>
              ) : (
                stats.map((m: ModelTokenStat) => {
                  const uncached = Number(m.uncached_input_tokens ?? m.total_input_tokens ?? 0);
                  const hit = Number(m.cache_hit_tokens ?? 0);
                  const write = Number(m.cache_write_tokens ?? 0);
                  const totalIn = uncached + hit + write;
                  const rate = totalIn > 0 ? (hit / totalIn) * 100 : 0;
                  return (
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
                      <td className="text-right text-sm tabular-nums">{rate.toFixed(1)}%</td>
                      <td className="text-right text-sm tabular-nums">${m.total_cost_usd.toFixed(6)}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {range !== 'today' && (
        <>
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-base-content/50 uppercase">{t('tokenStats.trendTitle')}</h3>
            <div className="tabs tabs-box bg-base-200 p-1">
              <button
                type="button"
                aria-pressed={mode === 'cost'}
                className={`rounded-md font-medium transition-colors whitespace-nowrap px-2 py-0.5 text-[11px] focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus-visible:ring-offset-base-200 ${mode === 'cost'
                  ? 'bg-primary text-primary-content shadow-sm'
                  : 'text-base-content/60 hover:bg-base-100/70 hover:text-base-content'}`}
                onClick={() => setMode('cost')}
              >
                {t('tokenStats.trendCost')}
              </button>
              <button
                type="button"
                aria-pressed={mode === 'requests'}
                className={`rounded-md font-medium transition-colors whitespace-nowrap px-2 py-0.5 text-[11px] focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus-visible:ring-offset-base-200 ${mode === 'requests'
                  ? 'bg-primary text-primary-content shadow-sm'
                  : 'text-base-content/60 hover:bg-base-100/70 hover:text-base-content'}`}
                onClick={() => setMode('requests')}
              >
                {t('tokenStats.trendRequests')}
              </button>
            </div>
          </div>

          <div className="border border-base-200 rounded-xl overflow-hidden">
            <div className="p-4">
              {trendStats.length === 0 ? (
                <div className="flex items-center justify-center h-48 text-base-content/40 text-sm">
                  {t('common.noData')}
                </div>
              ) : (
                <DailyChart data={trendStats} mode={mode} />
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
