import { useState } from 'react';
import type { CalculationResponse, MigrationMethod } from '../../types/calculation';
import { METHOD_COLORS } from '../../utils/constants';
import { Card } from '../shared/Card';
import { LoadingSpinner } from '../shared/LoadingSpinner';
import { EmptyState } from '../shared/EmptyState';
import { FormulaDisplay } from './FormulaDisplay';

interface ResultsBreakdownProps {
  results: CalculationResponse | null;
  loading: boolean;
}

function severityColor(severity: string): string {
  switch (severity) {
    case 'critical':
      return 'bg-red-500/20 text-red-400 border-red-500/30';
    case 'warning':
      return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
    default:
      return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
  }
}

export function ResultsBreakdown({ results, loading }: ResultsBreakdownProps) {
  const [expandedFormula, setExpandedFormula] = useState<MigrationMethod | null>(null);

  if (loading) {
    return (
      <Card title="Results">
        <LoadingSpinner />
      </Card>
    );
  }

  if (!results) {
    return (
      <Card>
        <EmptyState
          icon="📊"
          title="No Results Yet"
          description="Run a calculation to see results"
        />
      </Card>
    );
  }

  const { results: methodResults, recommendedMethod, summary } = results;

  return (
    <div className="space-y-4">
      {(methodResults ?? []).map((result) => {
        const color = METHOD_COLORS[result.method] ?? '#3b82f6';
        const isRecommended = result.method === recommendedMethod;
        const isExpanded = expandedFormula === result.method;

        return (
          <Card key={result.method}>
            <div className={`${!result.compatible ? 'opacity-50' : ''}`}>
              {/* Header */}
              <div className="flex items-center justify-between mb-3">
                <h4
                  className="text-base font-semibold"
                  style={{ color }}
                >
                  {result.methodLabel}
                </h4>
                {isRecommended && result.compatible && (
                  <span className="text-xs font-medium px-2 py-1 rounded-full bg-green-500/20 text-green-400 border border-green-500/30">
                    Recommended
                  </span>
                )}
              </div>

              {/* Time or Incompatible */}
              {result.compatible ? (
                <p className="text-2xl font-bold text-white mb-3">
                  {result.totalTimeFormatted || 'N/A'}
                </p>
              ) : (
                <p className="text-sm text-slate-400 italic mb-3">
                  {result.incompatibleReason || 'Not compatible with current configuration'}
                </p>
              )}

              {/* Bottlenecks */}
              {result.compatible &&
                result.bottlenecks &&
                result.bottlenecks.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-3">
                    {result.bottlenecks.map((b, i) => (
                      <span
                        key={i}
                        className={`text-xs px-2 py-1 rounded-full border ${severityColor(b.severity)}`}
                        title={b.suggestion}
                      >
                        {b.message}
                      </span>
                    ))}
                  </div>
                )}

              {/* Formula Toggle */}
              {result.compatible &&
                result.formulaSteps &&
                result.formulaSteps.length > 0 && (
                  <div>
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedFormula(isExpanded ? null : result.method)
                      }
                      className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
                    >
                      {isExpanded ? 'Hide Formula' : 'Show Formula'}
                    </button>
                    {isExpanded && (
                      <div className="mt-3">
                        <FormulaDisplay
                          steps={result.formulaSteps}
                          method={result.methodLabel}
                        />
                      </div>
                    )}
                  </div>
                )}
            </div>
          </Card>
        );
      })}

      {/* Summary / Recommendations */}
      {summary && (
        <Card title="Summary">
          <div className="space-y-2 text-sm text-slate-300">
            <p>
              <span className="text-slate-400">Total VMs:</span>{' '}
              {summary.totalVMs?.toLocaleString() ?? 0}
            </p>
            <p>
              <span className="text-slate-400">Total Disk:</span>{' '}
              {summary.totalDiskGB != null
                ? summary.totalDiskGB >= 1024
                  ? `${(summary.totalDiskGB / 1024).toFixed(1)} TB`
                  : `${summary.totalDiskGB} GB`
                : 'N/A'}
            </p>
            <p>
              <span className="text-slate-400">Fastest Time:</span>{' '}
              {summary.fastestTimeFormatted || 'N/A'}
            </p>
          </div>
        </Card>
      )}

      {/* Recommendations list from all methods */}
      {(() => {
        const allRecs = (methodResults ?? []).flatMap(
          (r) => r.recommendations ?? []
        );
        if (allRecs.length === 0) return null;
        return (
          <Card title="Recommendations">
            <ul className="space-y-2">
              {allRecs.map((rec, i) => (
                <li
                  key={i}
                  className="flex items-start gap-2 text-sm text-slate-300"
                >
                  <span className="text-blue-400 mt-0.5 shrink-0">&#8226;</span>
                  <span>{rec}</span>
                </li>
              ))}
            </ul>
          </Card>
        );
      })()}
    </div>
  );
}
