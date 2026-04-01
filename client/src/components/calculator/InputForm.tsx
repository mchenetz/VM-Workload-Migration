import { useState } from 'react';
import type { TuningParams } from '../../types/calculation';
import { useAppStore } from '../../store';
import { Card } from '../shared/Card';

interface InputFormProps {
  onCalculate: (input: {
    vmCount: number;
    totalDiskSizeGB: number;
    tuning: TuningParams;
  }) => void;
  loading: boolean;
}

const BANDWIDTH_OPTIONS = [
  { label: '1 Gbps', value: 1 },
  { label: '10 Gbps', value: 10 },
  { label: '25 Gbps', value: 25 },
  { label: '40 Gbps', value: 40 },
  { label: '100 Gbps', value: 100 },
];

export function InputForm({ onCalculate, loading }: InputFormProps) {
  const { tuning, setTuning } = useAppStore();
  const [vmCount, setVmCount] = useState(10);
  const [totalDiskSizeGB, setTotalDiskSizeGB] = useState(500);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onCalculate({ vmCount, totalDiskSizeGB, tuning });
  };

  const updateTuning = (partial: Partial<TuningParams>) => {
    setTuning(partial);
  };

  return (
    <Card title="Migration Parameters">
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic Inputs */}
        <div className="space-y-4">
          <h4 className="text-sm font-semibold text-slate-300 uppercase tracking-wide">
            Basic Inputs
          </h4>

          <div>
            <label className="text-sm text-slate-400 block mb-1">VM Count</label>
            <input
              type="number"
              min={1}
              max={10000}
              value={vmCount}
              onChange={(e) => setVmCount(Math.max(1, Math.min(10000, Number(e.target.value))))}
              className="w-full bg-slate-700 border border-slate-600 text-white rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="text-sm text-slate-400 block mb-1">
              Total Disk Size (GB)
            </label>
            <input
              type="number"
              min={1}
              value={totalDiskSizeGB}
              onChange={(e) => setTotalDiskSizeGB(Math.max(1, Number(e.target.value)))}
              className="w-full bg-slate-700 border border-slate-600 text-white rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-slate-500 mt-1">
              {(totalDiskSizeGB / 1024).toFixed(2)} TB
            </p>
          </div>

          <div>
            <label className="text-sm text-slate-400 block mb-1">
              Network Bandwidth
            </label>
            <select
              value={tuning.networkBandwidthGbps}
              onChange={(e) => updateTuning({ networkBandwidthGbps: Number(e.target.value) })}
              className="w-full bg-slate-700 border border-slate-600 text-white rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {BANDWIDTH_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Advanced Settings */}
        <div>
          <button
            type="button"
            onClick={() => setAdvancedOpen(!advancedOpen)}
            className="flex items-center gap-2 text-sm font-semibold text-slate-300 uppercase tracking-wide hover:text-slate-100 transition-colors"
          >
            <span
              className={`transition-transform ${advancedOpen ? 'rotate-90' : ''}`}
            >
              &#9654;
            </span>
            Advanced Settings
          </button>

          {advancedOpen && (
            <div className="mt-4 space-y-4">
              {/* Concurrent Transfers */}
              <div>
                <label className="text-sm text-slate-400 flex justify-between mb-1">
                  <span>Concurrent Transfers</span>
                  <span className="text-slate-300">{tuning.concurrentTransfers}</span>
                </label>
                <input
                  type="range"
                  min={1}
                  max={20}
                  value={tuning.concurrentTransfers}
                  onChange={(e) => updateTuning({ concurrentTransfers: Number(e.target.value) })}
                  className="w-full accent-blue-500"
                />
              </div>

              {/* Bandwidth Utilization */}
              <div>
                <label className="text-sm text-slate-400 flex justify-between mb-1">
                  <span>Bandwidth Utilization</span>
                  <span className="text-slate-300">
                    {Math.round(tuning.bandwidthUtilization * 100)}%
                  </span>
                </label>
                <input
                  type="range"
                  min={10}
                  max={95}
                  value={Math.round(tuning.bandwidthUtilization * 100)}
                  onChange={(e) =>
                    updateTuning({ bandwidthUtilization: Number(e.target.value) / 100 })
                  }
                  className="w-full accent-blue-500"
                />
              </div>

              {/* Compression Ratio */}
              <div>
                <label className="text-sm text-slate-400 flex justify-between mb-1">
                  <span>Compression Ratio</span>
                  <span className="text-slate-300">
                    {Math.round(tuning.compressionRatio * 100)}%
                  </span>
                </label>
                <input
                  type="range"
                  min={0}
                  max={80}
                  value={Math.round(tuning.compressionRatio * 100)}
                  onChange={(e) =>
                    updateTuning({ compressionRatio: Number(e.target.value) / 100 })
                  }
                  className="w-full accent-blue-500"
                />
              </div>

              {/* VDDK Overhead */}
              <div>
                <label className="text-sm text-slate-400 flex justify-between mb-1">
                  <span>VDDK Overhead</span>
                  <span className="text-slate-300">
                    {Math.round(tuning.vddkOverhead * 100)}%
                  </span>
                </label>
                <input
                  type="range"
                  min={5}
                  max={25}
                  value={Math.round(tuning.vddkOverhead * 100)}
                  onChange={(e) =>
                    updateTuning({ vddkOverhead: Number(e.target.value) / 100 })
                  }
                  className="w-full accent-blue-500"
                />
              </div>

              {/* XCopy Speed Multiplier */}
              <div>
                <label className="text-sm text-slate-400 flex justify-between mb-1">
                  <span>XCopy Speed Multiplier</span>
                  <span className="text-slate-300">{tuning.xcopySpeedMultiplier}x</span>
                </label>
                <input
                  type="range"
                  min={2}
                  max={15}
                  value={tuning.xcopySpeedMultiplier}
                  onChange={(e) =>
                    updateTuning({ xcopySpeedMultiplier: Number(e.target.value) })
                  }
                  className="w-full accent-blue-500"
                />
              </div>

              {/* Storage IOPS */}
              <div>
                <label className="text-sm text-slate-400 block mb-1">
                  Storage IOPS
                </label>
                <input
                  type="number"
                  min={1000}
                  value={tuning.storageIOPS}
                  onChange={(e) => updateTuning({ storageIOPS: Number(e.target.value) })}
                  className="w-full bg-slate-700 border border-slate-600 text-white rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          )}
        </div>

        {/* Warm Migration */}
        <div className="space-y-3">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={tuning.warmMigration}
              onChange={(e) => updateTuning({ warmMigration: e.target.checked })}
              className="w-4 h-4 rounded bg-slate-700 border-slate-600 text-blue-500 focus:ring-blue-500"
            />
            <span className="text-sm font-semibold text-slate-300">
              Warm Migration
            </span>
          </label>

          {tuning.warmMigration && (
            <div className="ml-7 space-y-4">
              <div>
                <label className="text-sm text-slate-400 flex justify-between mb-1">
                  <span>Daily Change Rate</span>
                  <span className="text-slate-300">
                    {(tuning.dailyChangeRate * 100).toFixed(1)}%
                  </span>
                </label>
                <input
                  type="range"
                  min={5}
                  max={100}
                  value={Math.round(tuning.dailyChangeRate * 1000)}
                  onChange={(e) =>
                    updateTuning({ dailyChangeRate: Number(e.target.value) / 1000 })
                  }
                  className="w-full accent-blue-500"
                />
              </div>

              <div>
                <label className="text-sm text-slate-400 block mb-1">
                  Days Since Cutover
                </label>
                <input
                  type="number"
                  min={1}
                  max={30}
                  value={tuning.daysSinceCutover}
                  onChange={(e) =>
                    updateTuning({
                      daysSinceCutover: Math.max(1, Math.min(30, Number(e.target.value))),
                    })
                  }
                  className="w-full bg-slate-700 border border-slate-600 text-white rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          )}
        </div>

        {/* Calculate Button */}
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-blue-500 hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-3 rounded-lg transition-colors"
        >
          {loading ? 'Calculating...' : 'Estimate Migration Time'}
        </button>
      </form>
    </Card>
  );
}
