import type { FormulaStep } from '../../types/calculation';

interface FormulaDisplayProps {
  steps: FormulaStep[];
  method: string;
}

export function FormulaDisplay({ steps, method }: FormulaDisplayProps) {
  if (!steps || steps.length === 0) {
    return (
      <div className="bg-slate-900 rounded-lg p-4 text-sm text-slate-500">
        No formula steps available.
      </div>
    );
  }

  return (
    <div className="bg-slate-900 rounded-lg p-4 overflow-x-auto">
      <h4 className="text-sm font-semibold text-slate-300 mb-3">
        {method} -- Formula Breakdown
      </h4>
      <div className="space-y-2 font-mono text-sm">
        {steps.map((step, index) => (
          <div key={index} className="flex flex-col gap-0.5">
            <span className="text-slate-400">{step.label}</span>
            <div className="pl-4">
              <span className="text-slate-500">{step.formula}</span>
              {step.values && (
                <>
                  <span className="text-slate-600 mx-2">=</span>
                  <span className="text-blue-400">{step.values}</span>
                </>
              )}
              {step.result && (
                <>
                  <span className="text-slate-600 mx-2">=</span>
                  <span className="text-green-400 font-semibold">{step.result}</span>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
