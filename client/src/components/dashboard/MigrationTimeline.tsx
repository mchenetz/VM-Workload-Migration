import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import type { CalculationResult, MigrationMethod } from '../../types/calculation';
import { Card } from '../shared/Card';
import { METHOD_COLORS } from '../../utils/constants';
import { formatTime } from '../../utils/formatters';

interface MigrationTimelineProps {
  results: CalculationResult[];
}

interface TimelineDatum {
  method: MigrationMethod;
  label: string;
  seconds: number;
  displaySeconds: number;
  formatted: string;
}

function TimelineTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: TimelineDatum }>;
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm shadow-lg">
      <p className="font-semibold text-slate-100">{d.label}</p>
      <p className="text-slate-300">Duration: {d.formatted}</p>
    </div>
  );
}

export function MigrationTimeline({ results }: MigrationTimelineProps) {
  const compatible = results.filter((r) => r.compatible);
  const maxTime = Math.max(...compatible.map((r) => r.totalTimeSeconds));
  const minVisible = maxTime * 0.03;

  const data: TimelineDatum[] = compatible.map((r) => ({
    method: r.method,
    label: r.methodLabel,
    seconds: r.totalTimeSeconds,
    displaySeconds: Math.max(r.totalTimeSeconds, minVisible),
    formatted: r.totalTimeFormatted,
  }));

  return (
    <Card title="Migration Timeline">
      <ResponsiveContainer width="100%" height={200}>
        <BarChart
          data={data}
          layout="vertical"
          margin={{ left: 20, right: 30 }}
        >
          <XAxis
            type="number"
            dataKey="displaySeconds"
            tickFormatter={(v: number) => formatTime(v)}
            stroke="#94a3b8"
            fontSize={12}
            domain={[0, maxTime]}
          />
          <YAxis
            type="category"
            dataKey="label"
            width={180}
            stroke="#94a3b8"
            fontSize={12}
          />
          <Tooltip
            content={<TimelineTooltip />}
            cursor={{ fill: 'rgba(148,163,184,0.1)' }}
          />
          <Bar dataKey="displaySeconds" radius={[0, 6, 6, 0]} barSize={28}>
            {data.map((entry) => (
              <Cell key={entry.method} fill={METHOD_COLORS[entry.method]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </Card>
  );
}
