import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import type { ModelTokenStat } from '../api/types';

interface ModelRankChartProps {
  data: ModelTokenStat[];
  height?: number;
  compact?: boolean;
}

export function ModelRankChart({ data, height = 320, compact }: ModelRankChartProps) {
  const chartData = data.map((d) => ({
    name: d.model.length > 14 ? d.model.slice(0, 12) + '…' : d.model,
    fullName: d.model,
    输入: d.total_input_tokens,
    输出: d.total_output_tokens,
  }));

  const formatTokens = (v: number) => {
    if (v >= 1_000_000) return (v / 1_000_000).toFixed(1) + 'M';
    if (v >= 1_000) return (v / 1_000).toFixed(1) + 'K';
    return v.toString();
  };

  return (
    <ResponsiveContainer width="100%" height={height} className="select-none">
      <BarChart data={chartData} barCategoryGap={compact ? '40%' : '20%'} margin={{ left: 10 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.87 0.01 80)" vertical={false} />
        <XAxis
          dataKey="name"
          tick={{ fontSize: compact ? 10 : 11, fill: 'oklch(0.5 0.02 80)' }}
          axisLine={{ stroke: 'oklch(0.87 0.01 80)' }}
          tickLine={false}
          tickFormatter={(v: string) => {
            const d = chartData.find((x) => x.name === v);
            return d ? (d.fullName.length > 14 ? d.fullName.slice(0, 12) + '…' : d.fullName) : v;
          }}
        />
        <YAxis
          tickFormatter={formatTokens}
          tick={{ fontSize: compact ? 10 : 11, fill: 'oklch(0.5 0.02 80)' }}
          axisLine={false}
          tickLine={false}
          width={compact ? 35 : 40}
        />
        <Tooltip
          contentStyle={{
            background: 'oklch(0.99 0.01 80)',
            border: '1px solid oklch(0.87 0.01 80)',
            borderRadius: '8px',
            fontSize: '12px',
          }}
          formatter={(value, name) => [formatTokens(Number(value)), name === '输入' ? '输入' : '输出']}
          labelFormatter={(label) => {
            const match = chartData.find((d) => d.name === label);
            return match?.fullName || label;
          }}
        />
        <Legend
          iconType="circle"
          iconSize={compact ? 6 : 8}
          formatter={(value) => (
            <span className={`${compact ? 'text-[10px]' : 'text-xs'} text-base-content/70`}>{value === '输入' ? '输入' : '输出'}</span>
          )}
        />
        <Bar dataKey="输入" stackId="a" fill="oklch(0.6 0.15 200)" radius={[2, 2, 0, 0]} maxBarSize={compact ? 16 : undefined} />
        <Bar dataKey="输出" stackId="a" fill="oklch(0.65 0.18 340)" radius={[2, 2, 0, 0]} maxBarSize={compact ? 16 : undefined} />
      </BarChart>
    </ResponsiveContainer>
  );
}
