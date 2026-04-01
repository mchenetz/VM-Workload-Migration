import type { CalculationResponse } from '../../types/calculation';
import { formatBytes } from '../../utils/formatters';
import { METHOD_LABELS, METHOD_COLORS } from '../../utils/constants';

interface OverviewCardsProps {
  data: CalculationResponse;
}

export function OverviewCards({ data }: OverviewCardsProps) {
  const { summary, recommendedMethod } = data;

  return (
    <div className="grid grid-cols-4 gap-6">
      {/* Total VMs */}
      <div className="rounded-xl border border-slate-700 bg-slate-800 p-6">
        <p className="text-3xl font-bold text-slate-100">{summary.totalVMs}</p>
        <p className="mt-1 text-sm text-slate-400">Virtual Machines</p>
      </div>

      {/* Total Storage */}
      <div className="rounded-xl border border-slate-700 bg-slate-800 p-6">
        <p className="text-3xl font-bold text-slate-100">
          {formatBytes(summary.totalDiskGB)}
        </p>
        <p className="mt-1 text-sm text-slate-400">Total Disk Size</p>
      </div>

      {/* Fastest Method */}
      <div className="rounded-xl border border-slate-700 bg-slate-800 p-6">
        <p
          className="text-3xl font-bold"
          style={{ color: METHOD_COLORS[summary.fastestMethod] }}
        >
          {summary.fastestTimeFormatted}
        </p>
        <p className="mt-1 text-sm text-slate-400">
          {METHOD_LABELS[summary.fastestMethod]}
        </p>
      </div>

      {/* Recommended */}
      <div className="rounded-xl border border-slate-700 bg-slate-800 p-6">
        <div className="flex items-center gap-2">
          <svg
            className="h-5 w-5 text-yellow-400"
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
          </svg>
          <span
            className="rounded-full px-3 py-0.5 text-sm font-semibold"
            style={{
              backgroundColor: `${METHOD_COLORS[recommendedMethod]}20`,
              color: METHOD_COLORS[recommendedMethod],
            }}
          >
            {METHOD_LABELS[recommendedMethod]}
          </span>
        </div>
        <p className="mt-3 text-sm text-slate-400">Recommended Method</p>
      </div>
    </div>
  );
}
