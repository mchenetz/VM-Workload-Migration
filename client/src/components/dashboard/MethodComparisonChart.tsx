import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import type { CalculationResult } from '../../types/calculation';
import type { MigrationMethod } from '../../types/calculation';
import { Card } from '../shared/Card';
import { METHOD_COLORS } from '../../utils/constants';
import { formatTime } from '../../utils/formatters';

interface MethodComparisonChartProps {
  results: CalculationResult[];
}

interface ChartDatum {
  method: MigrationMethod;
  label: string;
  seconds: number;
  formatted: string;
}

function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: ChartDatum }>;
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm shadow-lg">
      <p className="font-semibold text-slate-100">{d.label}</p>
      <p className="text-slate-300">{d.formatted}</p>
    </div>
  );
}

export function MethodComparisonChart({ results }: MethodComparisonChartProps) {
  const data: ChartDatum[] = results
    .filter((r) => r.compatible)
    .map((r) => ({
      method: r.method,
      label: r.methodLabel,
      seconds: r.totalTimeSeconds,
      formatted: r.totalTimeFormatted,
    }));

  return (
    <Card title="Method Comparison">
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={data} layout="vertical" margin={{ left: 20, right: 30 }}>
          <XAxis
            type="number"
            tickFormatter={(v: number) => formatTime(v)}
            stroke="#94a3b8"
            fontSize={12}
          />
          <YAxis
            type="category"
            dataKey="label"
            width={180}
            stroke="#94a3b8"
            fontSize={12}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(148,163,184,0.1)' }} />
          <Bar dataKey="seconds" radius={[0, 6, 6, 0]} barSize={28}>
            {data.map((entry) => (
              <Cell key={entry.method} fill={METHOD_COLORS[entry.method]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </Card>
  );
}
