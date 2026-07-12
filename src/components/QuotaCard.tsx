import type { QuotaWindow } from '../api/types';

interface QuotaCardProps {
  name: string;
  windows: QuotaWindow[];
}

const ringColor: Record<string, string> = {
  Rolling: 'text-primary',
  Weekly: 'text-secondary',
  Monthly: 'text-accent',
};

function QuotaRing({ label, used, blocked }: { label: string; used: number; blocked?: boolean }) {
  const value = Math.min(Math.round(used), 100);
  let colorClass = ringColor[label] || 'text-primary';
  if (blocked) colorClass = 'text-base-content/30';
  else if (value >= 100) colorClass = 'text-error';
  else if (value >= 80) colorClass = 'text-warning';

  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className={`radial-progress ${colorClass}`}
        style={{ '--value': value, '--size': '3.5rem', '--thickness': '4px' } as React.CSSProperties}
        role="progressbar"
      >
        <span className="text-xs font-bold">{value}%</span>
      </div>
    </div>
  );
}

export function QuotaCard({ name, windows }: QuotaCardProps) {
  const labels: Record<string, string> = {
    Rolling: '5h',
    Weekly: '7d',
    Monthly: '30d',
  };

  return (
    <div className="card bg-base-100 border border-base-200 shadow-sm">
      <div className="card-body p-4">
        <h3 className="text-sm font-medium text-base-content/80 mb-3 truncate">{name}</h3>
        <div className="flex justify-around">
          {windows.map((w) => (
            <div key={w.label} className="flex flex-col items-center gap-1">
              <QuotaRing label={w.label} used={w.used} blocked={w.blocked} />
              <span className="text-[10px] text-base-content/60">{labels[w.label] || w.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
