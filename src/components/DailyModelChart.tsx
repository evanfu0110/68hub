import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import type { DailyModelStat } from '../api/types';

interface DailyModelChartProps {
  data: DailyModelStat[];
  mode: 'cost' | 'requests';
}

const COLORS = [
  'oklch(0.6 0.18 340)',
  'oklch(0.55 0.18 200)',
  'oklch(0.6 0.18 160)',
  'oklch(0.55 0.18 280)',
  'oklch(0.6 0.18 40)',
  'oklch(0.5 0.12 20)',
];

export function DailyModelChart({ data, mode }: DailyModelChartProps) {
  const models = [...new Set(data.map((d) => d.model))];
  const dates = [...new Set(data.map((d) => d.date))].sort();

  const chartData = dates.map((date) => {
    const row: Record<string, string | number> = { date: date.slice(5), fullDate: date };
    for (const model of models) {
      const match = data.find((d) => d.date === date && d.model === model);
      row[model] = match ? (mode === 'cost' ? match.total_cost_usd : match.request_count) : 0;
    }
    return row;
  });

  return (
    <ResponsiveContainer width="100%" height={320} className="select-none">
      <LineChart data={chartData} margin={{ left: 10 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.87 0.01 80)" />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 11, fill: 'oklch(0.5 0.02 80)' }}
          axisLine={{ stroke: 'oklch(0.87 0.01 80)' }}
          tickLine={false}
        />
        <YAxis
          tick={{ fontSize: 11, fill: 'oklch(0.5 0.02 80)' }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v: number) => mode === 'cost' ? '$' + v.toFixed(4) : v.toString()}
        />
        <Tooltip
          contentStyle={{
            background: 'oklch(0.99 0.01 80)',
            border: '1px solid oklch(0.87 0.01 80)',
            borderRadius: '8px',
            fontSize: '12px',
          }}
          labelFormatter={(label) => {
            const match = chartData.find((d) => d.date === label);
            return match?.fullDate || label;
          }}
        />
        <Legend
          iconType="circle"
          formatter={(value) => (
            <span className="text-xs text-base-content/70">{value}</span>
          )}
        />
        {models.map((model, i) => (
          <Line
            key={model}
            type="monotone"
            dataKey={model}
            stroke={COLORS[i % COLORS.length]}
            strokeWidth={1.5}
            dot={false}
            activeDot={{ r: 3 }}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
