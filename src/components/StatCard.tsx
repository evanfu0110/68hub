interface StatCardProps {
  label: string;
  value: string | number;
  sub?: string;
  icon: JSX.Element;
  color?: 'primary' | 'secondary' | 'accent' | 'info';
}

const iconBg: Record<string, string> = {
  primary: 'bg-primary/10',
  secondary: 'bg-secondary/10',
  accent: 'bg-accent/10',
  info: 'bg-info/10',
};

const iconColor: Record<string, string> = {
  primary: 'text-primary',
  secondary: 'text-secondary',
  accent: 'text-accent',
  info: 'text-info',
};

export function StatCard({ label, value, sub, icon, color = 'primary' }: StatCardProps) {
  return (
    <div className="card bg-base-100 border border-base-200 shadow-sm">
      <div className="card-body p-4 gap-2">
        <div className="flex items-center justify-between">
          <span className={`p-2 rounded-lg ${iconBg[color]} ${iconColor[color]}`}>
            {icon}
          </span>
          <span className="text-2xl font-bold tabular-nums">{value}</span>
        </div>
        <div>
          <div className="text-sm text-base-content/60">{label}</div>
          {sub && <div className="text-xs text-base-content/40 mt-0.5">{sub}</div>}
        </div>
      </div>
    </div>
  );
}
