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

export function UsageTable({ records, showAccount }: UsageTableProps) {
  const { t, i18n } = useTranslation();

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
                  <td className="text-sm text-base-content/70">{r.account_name || '-'}</td>
                )}
                <td className="text-sm text-base-content/60 tabular-nums">{formatTime(r.created_at)}</td>
                <td className="text-sm font-medium">
                  <div className="flex items-center gap-1.5">
                    <ModelIcon model={r.model} />
                    <span className="truncate">{r.model}</span>
                  </div>
                </td>
                <td className="text-right text-sm tabular-nums">{r.input_tokens.toLocaleString()}</td>
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
    </div>
  );
}
