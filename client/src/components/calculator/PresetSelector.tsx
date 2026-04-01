import type { TuningParams } from '../../types/calculation';
import { DEFAULT_TUNING } from '../../utils/constants';
import { Card } from '../shared/Card';

interface PresetSelectorProps {
  onSelect: (tuning: TuningParams) => void;
  activePreset: string | null;
}

const PRESETS = [
  {
    id: 'conservative',
    name: 'Conservative',
    icon: '\u{1F6E1}\uFE0F',
    desc: 'Minimal impact on production',
    tuning: {
      ...DEFAULT_TUNING,
      concurrentTransfers: 2,
      bandwidthUtilization: 0.5,
      compressionRatio: 0.2,
      vddkOverhead: 0.15,
    },
  },
  {
    id: 'balanced',
    name: 'Balanced',
    icon: '\u2696\uFE0F',
    desc: 'Recommended for most migrations',
    recommended: true,
    tuning: { ...DEFAULT_TUNING },
  },
  {
    id: 'aggressive',
    name: 'Aggressive',
    icon: '\u{1F680}',
    desc: 'Maximum speed, higher usage',
    tuning: {
      ...DEFAULT_TUNING,
      concurrentTransfers: 8,
      bandwidthUtilization: 0.85,
      compressionRatio: 0.5,
      vddkOverhead: 0.1,
    },
  },
];

export function PresetSelector({ onSelect, activePreset }: PresetSelectorProps) {
  return (
    <Card title="Quick Presets">
      <div className="grid grid-cols-3 gap-3">
        {PRESETS.map((preset) => {
          const isActive = activePreset === preset.id;
          return (
            <button
              key={preset.id}
              type="button"
              onClick={() => onSelect(preset.tuning)}
              className={`flex flex-col items-center gap-2 rounded-lg border-2 p-4 text-center transition-colors ${
                isActive
                  ? 'border-blue-500 bg-slate-700/50'
                  : 'border-slate-600 bg-slate-700 hover:border-slate-500'
              }`}
            >
              <span className="text-2xl">{preset.icon}</span>
              <span className="text-sm font-semibold text-slate-100">
                {preset.name}
              </span>
              {preset.recommended && (
                <span className="text-xs text-blue-400">(Recommended)</span>
              )}
              <span className="text-xs text-slate-400">{preset.desc}</span>
            </button>
          );
        })}
      </div>
    </Card>
  );
}
