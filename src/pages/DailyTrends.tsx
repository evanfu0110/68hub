import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { usePolling } from '../hooks/usePolling';
import { api } from '../api/client';
import { ModelIcon } from '../components/ModelIcon';
import type { OpenCodeAccount } from '../api/types';

const toDateStr = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const fmtTokens = (v: number) => {
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(2) + 'M';
  if (v >= 1_000) return (v / 1_000).toFixed(1) + 'K';
  return v.toString();
};

export function DailyTrends() {
  const { t, i18n } = useTranslation();
  const [selectedDate, setSelectedDate] = useState(() => toDateStr(new Date()));
  const [accountId, setAccountId] = useState('');

  const { data: accounts } = usePolling(() => api.listOpenCodeAccounts(), 120000);

  const aid = accountId || undefined;

  const { data: dayModels } = usePolling(
    () => api.getDailyModelStats(365, aid),
    60000,
    true,
    [aid],
  );

  const today = useMemo(() => toDateStr(new Date()), []);
  const yesterday = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return toDateStr(d);
  }, []);

  const dayStats = useMemo(() => {
    const rows = (dayModels?.stats ?? []).filter((r) => r.date === selectedDate);
    return {
      rows,
      requestCount: rows.reduce((s, r) => s + r.request_count, 0),
      totalInput: rows.reduce((s, r) => s + r.total_input_tokens, 0),
      totalOutput: rows.reduce((s, r) => s + r.total_output_tokens, 0),
      cacheHit: rows.reduce((s, r) => s + r.cache_hit_tokens, 0),
      cacheRate: rows.reduce((s, r) => s + r.uncached_input_tokens + r.cache_hit_tokens + r.cache_write_tokens, 0) > 0
        ? (rows.reduce((s, r) => s + r.cache_hit_tokens, 0) /
          rows.reduce((s, r) => s + r.uncached_input_tokens + r.cache_hit_tokens + r.cache_write_tokens, 0)) * 100
        : 0,
      totalCost: rows.reduce((s, r) => s + r.total_cost_usd, 0),
    };
  }, [dayModels, selectedDate]);

  const fmtDate = (s: string) => {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(
      i18n.language === 'zh' ? 'zh-CN' : 'en-US',
      { year: 'numeric', month: 'short', day: 'numeric' },
    );
  };

  const dateLabel =
    selectedDate === today
      ? t('dailyTrends.today')
      : selectedDate === yesterday
      ? t('dailyTrends.yesterday')
      : fmtDate(selectedDate);

  const shiftDay = (delta: number) => {
    const [y, m, d] = selectedDate.split('-').map(Number);
    const t = new Date(Date.UTC(y, m - 1, d));
    t.setUTCDate(t.getUTCDate() + delta);
    const yy = t.getUTCFullYear();
    const mm = String(t.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(t.getUTCDate()).padStart(2, '0');
    setSelectedDate(`${yy}-${mm}-${dd}`);
  };

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
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          className="btn btn-sm btn-ghost"
          onClick={() => shiftDay(-1)}
          aria-label={t('dailyTrends.prevDay')}
        >
          ‹
        </button>
        <input
          type="date"
          className="input input-bordered input-sm"
          value={selectedDate}
          max={today}
          onChange={(e) => e.target.value && setSelectedDate(e.target.value)}
        />
        <button
          className="btn btn-sm btn-ghost"
          onClick={() => shiftDay(1)}
          disabled={selectedDate >= today}
          aria-label={t('dailyTrends.nextDay')}
        >
          ›
        </button>
        <span className="text-sm font-bold">{dateLabel}</span>
        {selectedDate !== today && (
          <button
            className="btn btn-sm btn-primary"
            onClick={() => setSelectedDate(today)}
          >
            {t('dailyTrends.backToToday')}
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4 text-sm">
        <div className="border border-base-200 rounded-lg px-4 py-2.5">
          <div className="text-[11px] font-bold text-base-content/40 uppercase">{t('dailyTrends.totalRequests')}</div>
          <div className="text-lg font-bold mt-0.5">{dayStats.requestCount.toLocaleString()}</div>
        </div>
        <div className="border border-base-200 rounded-lg px-4 py-2.5">
          <div className="text-[11px] font-bold text-base-content/40 uppercase">{t('dailyTrends.totalInput')}</div>
          <div className="text-lg font-bold mt-0.5">{fmtTokens(dayStats.totalInput)}</div>
        </div>
        <div className="border border-base-200 rounded-lg px-4 py-2.5">
          <div className="text-[11px] font-bold text-base-content/40 uppercase">{t('dailyTrends.totalOutput')}</div>
          <div className="text-lg font-bold mt-0.5">{fmtTokens(dayStats.totalOutput)}</div>
        </div>
        <div className="border border-base-200 rounded-lg px-4 py-2.5">
          <div className="text-[11px] font-bold text-base-content/40 uppercase">{t('dailyTrends.cacheTokens')}</div>
          <div className="text-lg font-bold mt-0.5">{fmtTokens(dayStats.cacheHit)}</div>
        </div>
        <div className="border border-base-200 rounded-lg px-4 py-2.5">
          <div className="text-[11px] font-bold text-base-content/40 uppercase">{t('dailyTrends.cacheRate')}</div>
          <div className="text-lg font-bold mt-0.5">{dayStats.cacheRate.toFixed(1)}%</div>
        </div>
        <div className="border border-base-200 rounded-lg px-4 py-2.5">
          <div className="text-[11px] font-bold text-base-content/40 uppercase">{t('dailyTrends.totalCost')}</div>
          <div className="text-lg font-bold mt-0.5">${dayStats.totalCost.toFixed(4)}</div>
        </div>
      </div>

      <div className="border border-base-200 rounded-xl overflow-hidden">
        <div className="p-4">
          <h3 className="text-xs font-bold text-base-content/50 uppercase mb-2">{t('dailyTrends.modelBreakdown')}</h3>
          {dayStats.rows.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-base-content/40 text-sm">
              {t('common.noData')}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="table table-sm">
                <thead>
                  <tr className="text-base-content/40 text-xs uppercase tracking-wider">
                    <th>{t('common.model')}</th>
                    <th className="text-right">{t('common.requests')}</th>
                    <th className="text-right">{t('common.input')}</th>
                    <th className="text-right">{t('common.output')}</th>
                    <th className="text-right">{t('dailyTrends.cacheTokens')}</th>
                    <th className="text-right">{t('dailyTrends.cacheRate')}</th>
                    <th className="text-right">{t('common.totalTokens')}</th>
                    <th className="text-right">{t('common.cost')}</th>
                  </tr>
                </thead>
                <tbody>
                  {dayStats.rows
                    .slice()
                    .sort((a, b) => b.total_input_tokens + b.total_output_tokens - (a.total_input_tokens + a.total_output_tokens))
                    .map((r) => (
                      <tr key={r.model} className="hover">
                        <td className="text-sm font-medium">
                          <div className="flex items-center gap-1.5">
                            <ModelIcon model={r.model} />
                            <span>{r.model}</span>
                          </div>
                        </td>
                        <td className="text-right text-sm tabular-nums">{r.request_count.toLocaleString()}</td>
                        <td className="text-right text-sm tabular-nums">{fmtTokens(r.total_input_tokens)}</td>
                        <td className="text-right text-sm tabular-nums">{fmtTokens(r.total_output_tokens)}</td>
                        <td className="text-right text-sm tabular-nums">{fmtTokens(r.cache_hit_tokens)}</td>
                        <td className="text-right text-sm tabular-nums">
                          {r.uncached_input_tokens + r.cache_hit_tokens + r.cache_write_tokens > 0
                            ? `${((r.cache_hit_tokens / (r.uncached_input_tokens + r.cache_hit_tokens + r.cache_write_tokens)) * 100).toFixed(1)}%`
                            : '0.0%'}
                        </td>
                        <td className="text-right text-sm tabular-nums">
                          {fmtTokens(r.total_input_tokens + r.total_output_tokens)}
                        </td>
                        <td className="text-right text-sm tabular-nums">${r.total_cost_usd.toFixed(4)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
