import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { usePolling } from '../hooks/usePolling';
import { api } from '../api/client';
import { ModelIcon } from '../components/ModelIcon';
import { UsageTable } from '../components/UsageTable';
import type { QuotaWindow } from '../api/types';

function fmt(v: number) {
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(2) + 'M';
  if (v >= 1_000) return (v / 1_000).toFixed(1) + 'K';
  return v.toString();
}

function fmtTime(sec: number) {
  if (sec <= 0) return '0';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

const barColors: Record<string, string> = {
  '5h Rolling': 'bg-primary',
  Weekly: 'bg-secondary',
  Monthly: 'bg-accent',
};

const barLabelKeys: Record<string, string> = {
  '5h Rolling': 'dashboard.5h',
  Weekly: 'dashboard.7d',
  Monthly: 'dashboard.30d',
};

function QuotaBar({ windows }: { windows: QuotaWindow[] }) {
  const { t, i18n } = useTranslation();
  return (
    <div className="space-y-3">
      {windows.map((w) => {
        const v = Math.min(Math.round(w.used), 100);
        const c = w.blocked ? 'bg-base-200'
          : v >= 100 ? 'bg-error'
          : v >= 80 ? 'bg-warning'
          : barColors[w.label] || 'bg-primary';
        return (
          <div key={w.label}>
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${c}`} />
                <span className="text-xs text-base-content/60">{t(barLabelKeys[w.label] || w.label)}</span>
              </div>
              <span className="text-xs font-bold tabular-nums">{v}%</span>
            </div>
            <div className="h-2 bg-base-200 rounded-full overflow-hidden">
              <div className={`h-full rounded-full transition-all duration-500 ${c}`} style={{ width: `${v}%` }} />
            </div>
            {w.label === '5h Rolling' && w.reset_in_sec > 0 && (
              <div className="text-[10px] text-base-content/30 mt-0.5">
                {t('dashboard.countdown', { time: fmtTime(w.reset_in_sec) })}
              </div>
            )}
            {w.label !== '5h Rolling' && w.reset_at && (
              <div className="text-[10px] text-base-content/30 mt-0.5">
                {t('dashboard.resetTime', { date: new Date(w.reset_at).toLocaleDateString(i18n.language === 'zh' ? 'zh-CN' : 'en-US') })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

const DONUT_COLORS = ['oklch(0.6 0.15 200)', 'oklch(0.65 0.18 340)'];

function ModelDonut({ models: raw }: { models: { model: string; total_input_tokens: number; total_output_tokens: number; total_cost_usd: number; request_count: number }[] }) {
  const { t } = useTranslation();
  const top = [...raw]
    .sort((a, b) => (b.total_input_tokens + b.total_output_tokens) - (a.total_input_tokens + a.total_output_tokens))
    .slice(0, 3);

  const chartData = [
    { name: 'Input', value: top.reduce((s, m) => s + m.total_input_tokens, 0) },
    { name: 'Output', value: top.reduce((s, m) => s + m.total_output_tokens, 0) },
  ];
  const total = chartData[0].value + chartData[1].value;

  if (top.length === 0) {
    return <div className="text-sm text-base-content/40 text-center py-10">{t('common.noData')}</div>;
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-6">
        <div className="w-[150px] h-[150px] shrink-0 select-none">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                innerRadius={48}
                outerRadius={68}
                dataKey="value"
                startAngle={90}
                endAngle={-270}
              >
                {chartData.map((_, i) => (
                  <Cell key={i} fill={DONUT_COLORS[i]} stroke="none" />
                ))}
              </Pie>
              <Tooltip
                formatter={(value) => [fmt(Number(value)), t('dashboard.heroTooltipTokens')]}
                contentStyle={{ background: 'oklch(0.99 0.01 80)', border: '1px solid oklch(0.87 0.01 80)', borderRadius: '8px', fontSize: '12px' }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="flex-1 min-w-0 space-y-2.5">
          {top.map((m, i) => (
            <div key={m.model}>
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-[10px] font-bold text-base-content/20 shrink-0 w-4">#{i + 1}</span>
                <ModelIcon model={m.model} />
                <span className="text-sm font-semibold truncate">{m.model}</span>
              </div>
              <div className="text-[11px] text-base-content/40 tabular-nums ml-[22px] mt-0.5 truncate">
                {t('common.input')} {fmt(m.total_input_tokens)} · {t('common.output')} {fmt(m.total_output_tokens)} · {t('dashboard.requests', { count: m.request_count })}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-5 pt-2 border-t border-base-200">
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: DONUT_COLORS[0] }} />
          <span className="text-[11px] text-base-content/50">{t('common.input')} {fmt(chartData[0].value)}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: DONUT_COLORS[1] }} />
          <span className="text-[11px] text-base-content/50">{t('common.output')} {fmt(chartData[1].value)}</span>
        </div>
        <span className="text-[11px] text-base-content/30 ml-auto shrink-0">{t('common.total')} {fmt(total)}</span>
      </div>
    </div>
  );
}

export function Dashboard() {
  const { t, i18n } = useTranslation();
  const { data, loading } = usePolling(() => api.getDashboard('30d'), 30000);

  const overview = data?.overview?.opencode;
  const quota = (data?.quota ?? []).filter((q) => q.success);
  const tokens = data?.model_tokens ?? [];

  const hero = useMemo(() => {
    const tkn = tokens.reduce((s, m) => s + m.total_input_tokens + m.total_output_tokens, 0);
    const r = tokens.reduce((s, m) => s + m.request_count, 0);
    return [
      { label: t('dashboard.account'), value: overview?.account_count ?? '-', sub: t('dashboard.availableBlocked', { available: overview?.success_count ?? 0, blocked: overview?.blocked_count ?? 0 }) },
      { label: t('dashboard.remainingQuota'), value: overview ? `${overview.avg_effective_remaining}%` : '-', sub: t('dashboard.avgRemainingRatio') },
      { label: t('dashboard.totalTokenConsumption'), value: fmt(tkn), sub: t('dashboard.requests', { count: r.toLocaleString() }) },
    ];
  }, [overview, tokens, t, i18n.language]);

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-86px)]">
        <div className="w-48 space-y-2">
          <div className="h-1 bg-base-200 rounded-full overflow-hidden relative">
            <div className="absolute inset-0 h-full bg-gradient-to-r from-primary to-secondary rounded-full animate-loading-bar" />
          </div>
          <p className="text-[11px] text-base-content/40 text-center">{t('common.loading')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold">{t('dashboard.title')}</h1>

      <div className="grid grid-cols-3 gap-4">
        {hero.map((h) => (
          <div key={h.label} className="border border-base-200 rounded-xl px-4 py-3">
            <div className="text-[11px] font-bold text-base-content/40 uppercase tracking-wider">{h.label}</div>
            <div className="text-3xl font-bold mt-1">{h.value}</div>
            <div className="text-[11px] text-base-content/40 mt-0.5">{h.sub}</div>
          </div>
        ))}
      </div>

      <div className="flex gap-4">
        <div className="flex-1 border border-base-200 rounded-xl p-4 flex flex-col min-h-0">
          <div className="text-xs font-bold text-base-content/50 uppercase tracking-wider mb-3 shrink-0">{t('dashboard.accountQuotaStatus')}</div>
          {quota.length === 0 ? (
            <div className="text-sm text-base-content/40 text-center py-6">{t('common.noData')}</div>
          ) : (
            <div className="flex-1 max-h-[280px] overflow-y-auto space-y-4 pr-1">
              {quota.map((q) => (
                <div key={q.account_id}>
                  <div className="text-sm font-semibold text-base-content/70 mb-2">{q.name}</div>
                  <QuotaBar windows={q.windows} />
                </div>
              ))}
            </div>
          )}
          <div className="text-[11px] text-base-content/30 mt-3 pt-3 border-t border-base-200 shrink-0">
            {quota.some((q) => q.windows.some((w) => w.used >= 100))
              ? t('dashboard.partialExhausted')
              : quota.some((q) => q.windows.some((w) => w.used >= 80))
              ? t('dashboard.partialWarning')
              : t('dashboard.allGood')}
          </div>
        </div>

        <div className="flex-1 border border-base-200 rounded-xl p-4">
          <div className="text-xs font-bold text-base-content/50 uppercase tracking-wider mb-3">{t('dashboard.modelTop3')}</div>
          <ModelDonut models={tokens} />
          <div className="text-[11px] text-base-content/30 mt-3 pt-3 border-t border-base-200">
            {tokens.length > 0
              ? t('dashboard.mostConsumed', {
                  model: tokens[0]?.model ?? '',
                  percent: tokens[0] ? ((tokens[0].total_input_tokens + tokens[0].total_output_tokens) / (tokens.reduce((s, m) => s + m.total_input_tokens + m.total_output_tokens, 0)) * 100).toFixed(1) : 0,
                })
              : t('dashboard.noModelData')}
          </div>
        </div>
      </div>

      <div className="border border-base-200 rounded-xl p-4">
        <div className="text-xs font-bold text-base-content/50 uppercase tracking-wider mb-3">{t('dashboard.recentUsage')}</div>
        <UsageTable records={data?.recent_usage?.records ?? []} showAccount />
      </div>
    </div>
  );
}
