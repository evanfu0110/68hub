import { useState, type MouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import type { UsageRecord } from '../api/types';
import { ModelIcon } from './ModelIcon';

interface UsageTableProps {
  records: UsageRecord[];
  showAccount?: boolean;
}

const planMap: Record<string, string> = {
  lite: 'go',
};

function displayPlan(p: string | null) {
  if (!p) return null;
  return planMap[p] || p;
}

function CacheBreakdown({ record, rect }: { record: UsageRecord; rect: DOMRect }) {
  const { t } = useTranslation();
  const uncached = record.uncached_input_tokens ?? record.input_tokens ?? 0;
  const cacheHit = record.cache_read_tokens ?? 0;
  const cacheWrite = record.cache_write_tokens ?? 0;
  const totalInput = record.input_tokens ?? uncached + cacheHit + cacheWrite;
  const output = record.output_tokens ?? 0;
  const hitRate = totalInput > 0 ? ((cacheHit / totalInput) * 100).toFixed(1) : '0.0';
  const format = (v: number) => v.toLocaleString();

  return createPortal(
    <div
      className="fixed z-50 w-56 rounded-lg border border-base-300 bg-base-100 p-3 text-xs shadow-lg pointer-events-none"
      style={{ left: Math.min(rect.left, window.innerWidth - 224), top: rect.bottom + 8 }}
    >
      <div className="font-semibold mb-2">{t('tokenStats.breakdownTitle')}</div>
      <div className="flex justify-between gap-4 py-0.5">
        <span className="text-base-content/60">{t('tokenStats.uncachedInput')}</span>
        <span className="tabular-nums">{format(uncached)}</span>
      </div>
      <div className="flex justify-between gap-4 py-0.5">
        <span className="text-base-content/60">{t('tokenStats.cacheHit')}</span>
        <span className="tabular-nums">{format(cacheHit)}</span>
      </div>
      <div className="flex justify-between gap-4 py-0.5">
        <span className="text-base-content/60">{t('tokenStats.cacheWrite')}</span>
        <span className="tabular-nums">{format(cacheWrite)}</span>
      </div>
      <div className="flex justify-between gap-4 border-t border-base-200 mt-1 pt-1">
        <span className="text-base-content/60">{t('tokenStats.totalInput')}</span>
        <span className="tabular-nums">{format(totalInput)}</span>
      </div>
      <div className="flex justify-between gap-4 py-0.5">
        <span className="text-base-content/60">{t('tokenStats.output')}</span>
        <span className="tabular-nums">{format(output)}</span>
      </div>
      <div className="text-base-content/40 mt-1">{t('tokenStats.cacheHitRate', { rate: hitRate })}</div>
    </div>,
    document.body,
  );
}

export function UsageTable({ records, showAccount }: UsageTableProps) {
  const { t, i18n } = useTranslation();
  const [hover, setHover] = useState<{ record: UsageRecord; rect: DOMRect } | null>(null);

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    const locale = i18n.language === 'zh' ? 'zh-CN' : 'en-US';
    return d.toLocaleString(locale, {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const showBreakdown = (record: UsageRecord) => (e: MouseEvent<HTMLTableCellElement>) => {
    setHover({ record, rect: e.currentTarget.getBoundingClientRect() });
  };

  return (
    <div className="overflow-x-auto">
      <table className="table table-sm">
        <thead>
          <tr className="text-base-content/40 text-xs uppercase tracking-wider">
            {showAccount && <th>{t('common.account')}</th>}
                <th>{t('common.time')}</th>
                <th>{t('common.model')}</th>
                <th className="text-right">{t('common.input')}</th>
                <th className="text-right">{t('common.output')}</th>
            <th className="text-right">{t('common.cost')}</th>
            <th>{t('common.plan')}</th>
          </tr>
        </thead>
        <tbody>
          {records.length === 0 ? (
            <tr>
              <td colSpan={showAccount ? 7 : 6} className="text-center py-8 text-base-content/40 text-sm">
                {t('common.noUsageRecords')}
              </td>
            </tr>
          ) : (
            records.map((r) => (
              <tr key={r.usg_id} className="hover">
                {showAccount && (
                  <td
                    className="text-sm text-base-content/70 max-w-[10rem] truncate"
                    title={r.account_name}
                  >
                    {r.account_name || '-'}
                  </td>
                )}
                <td className="text-sm text-base-content/60 tabular-nums">{formatTime(r.created_at)}</td>
                <td className="text-sm font-medium">
                  <div className="flex items-center gap-1.5">
                    <ModelIcon model={r.model} />
                    <span className="truncate">{r.model}</span>
                  </div>
                </td>
                <td
                  className="text-right text-sm tabular-nums cursor-help"
                  onMouseEnter={showBreakdown(r)}
                  onMouseLeave={() => setHover(null)}
                >
                  {r.input_tokens.toLocaleString()}
                </td>
                <td className="text-right text-sm tabular-nums">{r.output_tokens.toLocaleString()}</td>
                <td className="text-right text-sm tabular-nums">${r.cost_usd.toFixed(6)}</td>
                <td className="text-xs">
                  {r.plan && <span className="badge badge-ghost badge-xs">{displayPlan(r.plan)}</span>}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      {hover && <CacheBreakdown record={hover.record} rect={hover.rect} />}
    </div>
  );
}
