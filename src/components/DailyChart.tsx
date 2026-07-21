import { useTranslation } from 'react-i18next';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import type { DailyStat } from '../api/types';

interface DailyChartProps {
  data: DailyStat[];
  mode: 'cost' | 'requests';
}

export function DailyChart({ data, mode }: DailyChartProps) {
  const { t } = useTranslation();

  const chartData = [...data].reverse().map((d) => ({
    date: d.date.slice(5),
    fullDate: d.date,
    cost: Math.round(d.total_cost_usd * 1000000) / 1000000,
    requests: d.request_count,
  }));

  const formatValue = (v: number) => {
    if (mode === 'cost') return '$' + v.toFixed(4);
    return v.toString();
  };

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
          tickFormatter={formatValue}
          tick={{ fontSize: 11, fill: 'oklch(0.5 0.02 80)' }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          contentStyle={{
            background: 'oklch(0.99 0.01 80)',
            border: '1px solid oklch(0.87 0.01 80)',
            borderRadius: '8px',
            fontSize: '12px',
          }}
          formatter={(value, name) => {
            const v = Number(value);
            if (name === 'cost') return ['$' + v.toFixed(4), t('dailyTrends.tooltipCost')];
            return [v, t('dailyTrends.tooltipRequests')];
          }}
          labelFormatter={(label) => {
            const match = chartData.find((d) => d.date === label);
            return match?.fullDate || label;
          }}
        />
        <Line
          type="monotone"
          dataKey={mode === 'cost' ? 'cost' : 'requests'}
          stroke="oklch(0.6 0.18 340)"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4, fill: 'oklch(0.6 0.18 340)' }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
