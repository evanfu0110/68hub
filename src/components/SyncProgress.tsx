interface SyncProgressProps {
  status: string;
  current: number;
  total: number;
  inserted: number;
}

export function SyncProgressBar({ status, current, total }: SyncProgressProps) {
  if (status !== 'running' && status !== 'done') return null;

  const pct = total > 0 ? Math.min(Math.round((current / total) * 100), 100) : 0;

  if (status === 'done') {
    return (
      <div className="w-28">
        <div className="h-1.5 bg-base-200 rounded-full overflow-hidden">
          <div className="h-full bg-success rounded-full" style={{ width: '100%' }} />
        </div>
        <div className="text-[10px] text-success/60 text-center mt-0.5">完成</div>
      </div>
    );
  }

  return (
    <div className="w-28">
      <div className="h-1.5 bg-base-200 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-primary to-secondary rounded-full transition-all duration-500 ease-out"
          style={{ width: `${Math.max(pct, 4)}%` }}
        />
      </div>
      <div className="text-[10px] text-base-content/40 text-center mt-0.5 tabular-nums">
        {current > 0 ? `${current}/${total} 页` : '同步中...'}
      </div>
    </div>
  );
}
