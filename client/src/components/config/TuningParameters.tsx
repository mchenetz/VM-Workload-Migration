import { useAppStore } from '../../store';
import { Card } from '../shared/Card';

export function TuningParameters() {
  const tuning = useAppStore((s) => s.tuning);
  const setTuning = useAppStore((s) => s.setTuning);
  const resetTuning = useAppStore((s) => s.resetTuning);

  const labelClass = 'text-sm text-slate-400 mb-1 block';
  const inputClass = 'bg-slate-700 border border-slate-600 text-white rounded-lg px-4 py-2 w-full focus:outline-none focus:ring-2 focus:ring-blue-500';
  const sliderClass = 'w-full accent-blue-500';
  const sectionTitleClass = 'text-md font-semibold text-slate-200 mb-3 mt-2';

  return (
    <Card title="Global Tuning Parameters">
      <div className="space-y-6">
        {/* Network */}
        <section>
          <h4 className={sectionTitleClass}>Network</h4>
          <div className="space-y-4">
            <div>
              <label className={labelClass}>Bandwidth (Gbps)</label>
              <select
                value={tuning.networkBandwidthGbps}
                onChange={(e) => setTuning({ networkBandwidthGbps: Number(e.target.value) })}
                className={inputClass}
              >
                <option value={1}>1 Gbps</option>
                <option value={10}>10 Gbps</option>
                <option value={25}>25 Gbps</option>
                <option value={40}>40 Gbps</option>
                <option value={100}>100 Gbps</option>
              </select>
            </div>

            <div>
              <div className="flex items-center justify-between">
                <label className={labelClass}>Utilization (%)</label>
                <span className="text-sm text-slate-300">{Math.round(tuning.bandwidthUtilization * 100)}%</span>
              </div>
              <input
                type="range"
                min={0.1}
                max={1}
                step={0.05}
                value={tuning.bandwidthUtilization}
                onChange={(e) => setTuning({ bandwidthUtilization: Number(e.target.value) })}
                className={sliderClass}
              />
            </div>

            <div>
              <div className="flex items-center justify-between">
                <label className={labelClass}>Compression Ratio (%)</label>
                <span className="text-sm text-slate-300">{Math.round(tuning.compressionRatio * 100)}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={0.9}
                step={0.05}
                value={tuning.compressionRatio}
                onChange={(e) => setTuning({ compressionRatio: Number(e.target.value) })}
                className={sliderClass}
              />
            </div>
          </div>
        </section>

        {/* Transfer */}
        <section>
          <h4 className={sectionTitleClass}>Transfer</h4>
          <div className="space-y-4">
            <div>
              <label className={labelClass}>Concurrent Transfers</label>
              <input
                type="number"
                min={1}
                max={32}
                value={tuning.concurrentTransfers}
                onChange={(e) => setTuning({ concurrentTransfers: Number(e.target.value) })}
                className={inputClass}
              />
            </div>

            <div>
              <div className="flex items-center justify-between">
                <label className={labelClass}>VDDK Overhead (%)</label>
                <span className="text-sm text-slate-300">{Math.round(tuning.vddkOverhead * 100)}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={0.5}
                step={0.01}
                value={tuning.vddkOverhead}
                onChange={(e) => setTuning({ vddkOverhead: Number(e.target.value) })}
                className={sliderClass}
              />
            </div>

            <div>
              <div className="flex items-center justify-between">
                <label className={labelClass}>XCopy Speed Multiplier</label>
                <span className="text-sm text-slate-300">{tuning.xcopySpeedMultiplier}x</span>
              </div>
              <input
                type="range"
                min={1}
                max={20}
                step={0.5}
                value={tuning.xcopySpeedMultiplier}
                onChange={(e) => setTuning({ xcopySpeedMultiplier: Number(e.target.value) })}
                className={sliderClass}
              />
            </div>
          </div>
        </section>

        {/* Storage */}
        <section>
          <h4 className={sectionTitleClass}>Storage</h4>
          <div className="space-y-4">
            <div>
              <label className={labelClass}>IOPS</label>
              <input
                type="number"
                min={1000}
                max={500000}
                step={1000}
                value={tuning.storageIOPS}
                onChange={(e) => setTuning({ storageIOPS: Number(e.target.value) })}
                className={inputClass}
              />
            </div>
          </div>
        </section>

        {/* Warm Migration */}
        <section>
          <h4 className={sectionTitleClass}>Warm Migration</h4>
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <label className="relative inline-flex cursor-pointer items-center">
                <input
                  type="checkbox"
                  checked={tuning.warmMigration}
                  onChange={(e) => setTuning({ warmMigration: e.target.checked })}
                  className="peer sr-only"
                />
                <div className="h-6 w-11 rounded-full bg-slate-600 peer-checked:bg-blue-500 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all peer-checked:after:translate-x-full" />
              </label>
              <span className="text-sm text-slate-300">Enable Warm Migration</span>
            </div>

            {tuning.warmMigration && (
              <>
                <div>
                  <div className="flex items-center justify-between">
                    <label className={labelClass}>Daily Change Rate (%)</label>
                    <span className="text-sm text-slate-300">{Math.round(tuning.dailyChangeRate * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min={0.001}
                    max={0.2}
                    step={0.001}
                    value={tuning.dailyChangeRate}
                    onChange={(e) => setTuning({ dailyChangeRate: Number(e.target.value) })}
                    className={sliderClass}
                  />
                </div>

                <div>
                  <label className={labelClass}>Days Since Cutover</label>
                  <input
                    type="number"
                    min={1}
                    max={30}
                    value={tuning.daysSinceCutover}
                    onChange={(e) => setTuning({ daysSinceCutover: Number(e.target.value) })}
                    className={inputClass}
                  />
                </div>
              </>
            )}
          </div>
        </section>

        <div className="pt-4 border-t border-slate-700">
          <button
            onClick={resetTuning}
            className="rounded-lg border border-slate-600 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-700 transition-colors"
          >
            Reset to Defaults
          </button>
        </div>
      </div>
    </Card>
  );
}
