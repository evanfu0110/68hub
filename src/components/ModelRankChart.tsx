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
import { ModelIcon } from './ModelIcon';

interface ModelRankChartProps {
  data: ModelTokenStat[];
  height?: number;
  compact?: boolean;
}

function shortModelName(model: string) {
  return model.includes('-') ? model.slice(model.indexOf('-') + 1) : model;
}

function ModelAxisTick({ x, y, payload }: { x?: number; y?: number; payload?: { value: string } }) {
  const model = payload?.value || '';
  return (
    <g transform={`translate(${x ?? 0},${y ?? 0})`}>
      <foreignObject x="-64" y="0" width="128" height="28">
        <div className="flex items-center justify-center gap-1 text-[11px] text-base-content/70 whitespace-nowrap">
          <ModelIcon model={model} className="w-3.5 h-3.5" />
          <span>{shortModelName(model)}</span>
        </div>
      </foreignObject>
    </g>
  );
}

export function ModelRankChart({ data, height = 320, compact }: ModelRankChartProps) {
  const barSize = compact ? 12 : Math.min(56, Math.max(22, 280 / Math.max(data.length, 1)));
  const chartData = data.map((d) => ({
    name: d.model,
    fullName: d.model,
    rawInput: d.total_input_tokens,
    rawOutput: d.total_output_tokens,
    输入: Math.log10(d.total_input_tokens + 1),
    输出: Math.log10(d.total_output_tokens + 1),
  }));

  const formatTokens = (v: number) => {
    if (v >= 1_000_000_000) return (v / 1_000_000_000).toFixed(1) + 'B';
    if (v >= 1_000_000) return (v / 1_000_000).toFixed(1) + 'M';
    if (v >= 1_000) return (v / 1_000).toFixed(1) + 'K';
    return v.toString();
  };

  const formatScaleTokens = (v: number) => formatTokens(Math.max(0, 10 ** v - 1));
  const maxDisplayValue = Math.max(
    ...chartData.map((d) => Math.max(d.输入, d.输出)),
    0,
  );
  const scaleTicks = [0, 3, 6, 9].filter((v) => v <= maxDisplayValue);
  if (maxDisplayValue > 0 && scaleTicks[scaleTicks.length - 1] !== maxDisplayValue) {
    scaleTicks.push(maxDisplayValue);
  }

  return (
    <ResponsiveContainer width="100%" height={height} className="select-none">
      <BarChart
        data={chartData}
        barCategoryGap={compact ? '35%' : data.length <= 3 ? '8%' : '15%'}
        barGap={0}
        margin={{ left: 24, right: 8 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.87 0.01 80)" vertical={false} />
        <XAxis
          dataKey="name"
          tick={<ModelAxisTick />}
          interval={0}
          minTickGap={0}
          height={36}
          axisLine={{ stroke: 'oklch(0.87 0.01 80)' }}
          tickLine={false}
        />
        <YAxis
          domain={[0, maxDisplayValue || 1]}
          ticks={scaleTicks}
          tickFormatter={formatScaleTokens}
          tick={{ fontSize: compact ? 10 : 11, fill: 'oklch(0.5 0.02 80)' }}
          axisLine={false}
          tickLine={false}
          width={compact ? 48 : 58}
        />
        <Tooltip
          contentStyle={{
            background: 'oklch(0.99 0.01 80)',
            border: '1px solid oklch(0.87 0.01 80)',
            borderRadius: '8px',
            fontSize: '12px',
          }}
          formatter={(_value, name, item) => {
            const rawValue = name === '输入' ? item.payload.rawInput : item.payload.rawOutput;
            return [formatTokens(rawValue), name === '输入' ? '输入' : '输出'];
          }}
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
        <Bar dataKey="输入" fill="oklch(0.6 0.15 200)" radius={[2, 2, 0, 0]} maxBarSize={barSize} />
        <Bar dataKey="输出" fill="oklch(0.65 0.18 340)" radius={[2, 2, 0, 0]} maxBarSize={barSize} />
      </BarChart>
    </ResponsiveContainer>
  );
}
