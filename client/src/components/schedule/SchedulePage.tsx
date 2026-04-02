import { useState } from 'react';
import { AppShell } from '../layout/AppShell';
import { Card } from '../shared/Card';
import { useAppStore } from '../../store/index';
import { generateSchedule, exportSchedulePDF } from '../../api/scheduleApi';
import type { ScheduleParams, MigrationSchedule, ScheduleWindow } from '../../types/calculation';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_NAMES_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const DEFAULT_PARAMS: ScheduleParams = {
  startDate: new Date().toISOString().slice(0, 10),
  windowStart: '08:00',
  windowEnd: '18:00',
  workDays: [1, 2, 3, 4, 5],
  maxConcurrent: 2,
  preferredMethod: 'network_copy',
  bufferMinutes: 30,
};

function formatMinutes(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/** Returns ISO date string for each day in the calendar grid (6 weeks = 42 cells). */
function getCalendarGrid(year: number, month: number): (string | null)[] {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (string | null)[] = Array(firstDay).fill(null);
  for (let d = 1; d <= daysInMonth; d++) {
    const mm = String(month + 1).padStart(2, '0');
    const dd = String(d).padStart(2, '0');
    cells.push(`${year}-${mm}-${dd}`);
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function getMonthsInRange(start: string, end: string): { year: number; month: number }[] {
  const [sy, sm] = start.split('-').map(Number);
  const [ey, em] = end.split('-').map(Number);
  const months: { year: number; month: number }[] = [];
  let y = sy;
  let m = sm - 1;
  while (y < ey || (y === ey && m <= em - 1)) {
    months.push({ year: y, month: m });
    m++;
    if (m > 11) { m = 0; y++; }
  }
  return months;
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

interface CalendarProps {
  schedule: MigrationSchedule;
  selectedDate: string | null;
  onSelectDate: (date: string) => void;
}

function ScheduleCalendar({ schedule, selectedDate, onSelectDate }: CalendarProps) {
  const windowByDate = new Map(schedule.windows.map((w) => [w.date, w]));
  const months = getMonthsInRange(schedule.startDate, schedule.completionDate);

  return (
    <div className="space-y-6">
      {months.map(({ year, month }) => {
        const grid = getCalendarGrid(year, month);
        return (
          <div key={`${year}-${month}`}>
            <h4 className="text-sm font-semibold text-slate-300 mb-2">
              {MONTH_NAMES[month]} {year}
            </h4>
            <div className="grid grid-cols-7 gap-px bg-slate-700 rounded-lg overflow-hidden text-xs">
              {DAY_NAMES.map((d) => (
                <div key={d} className="bg-slate-800 text-center text-slate-500 py-1 font-medium">
                  {d}
                </div>
              ))}
              {grid.map((date, i) => {
                if (!date) {
                  return <div key={`empty-${i}`} className="bg-slate-900/50 h-10" />;
                }
                const win = windowByDate.get(date);
                const isSelected = date === selectedDate;
                const isToday = date === new Date().toISOString().slice(0, 10);

                let cellClass = 'bg-slate-900 cursor-default h-10 flex flex-col items-center justify-center relative';
                if (win) {
                  cellClass = `${isSelected
                    ? 'bg-blue-500 text-white'
                    : 'bg-blue-900/60 hover:bg-blue-800/70 cursor-pointer text-blue-200'} h-10 flex flex-col items-center justify-center relative`;
                } else if (isToday) {
                  cellClass = 'bg-slate-800 h-10 flex flex-col items-center justify-center relative ring-1 ring-inset ring-blue-500/50';
                }

                const dayNum = parseInt(date.slice(8), 10);
                return (
                  <div
                    key={date}
                    className={cellClass}
                    onClick={() => win && onSelectDate(date)}
                    title={win ? `${win.vms.length} VM(s) — ${formatMinutes(win.totalMinutes)}` : undefined}
                  >
                    <span className={`text-xs ${win ? '' : 'text-slate-500'}`}>{dayNum}</span>
                    {win && (
                      <span className={`text-[9px] leading-none ${isSelected ? 'text-blue-100' : 'text-blue-400'}`}>
                        {win.vms.length}VM
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

interface WindowDetailProps {
  window: ScheduleWindow;
  windowIndex: number;
  totalWindows: number;
  onMoveVM: (fromIdx: number, toIdx: number, vmId: string) => void;
}

function WindowDetail({ window: win, windowIndex, totalWindows, onMoveVM }: WindowDetailProps) {
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div>
          <span className="text-slate-200 font-medium">{win.date}</span>
          <span className="text-slate-400 text-sm ml-2">{win.windowStart}–{win.windowEnd}</span>
        </div>
        <span className="text-xs text-slate-400">{formatMinutes(win.totalMinutes)} total</span>
      </div>
      <div className="space-y-2">
        {win.vms.map((vm) => {
          const hrs = Math.floor(vm.estimatedMinutes / 60);
          const mins = vm.estimatedMinutes % 60;
          const timeStr = hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;
          return (
            <div
              key={vm.vmId}
              className="flex items-center gap-3 rounded-lg bg-slate-700/50 px-3 py-2"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm text-slate-200 truncate">{vm.vmName}</p>
                <p className="text-xs text-slate-400">
                  {vm.diskSizeGB.toFixed(1)} GB &bull; {timeStr} &bull;{' '}
                  {vm.method === 'xcopy' ? 'XCopy' : 'Net Copy'}
                </p>
              </div>
              <div className="flex gap-1 shrink-0">
                {windowIndex > 0 && (
                  <button
                    onClick={() => onMoveVM(windowIndex, windowIndex - 1, vm.vmId)}
                    className="px-2 py-1 text-xs rounded bg-slate-600 hover:bg-slate-500 text-slate-300 transition-colors"
                    title="Move to previous window"
                  >
                    ◀
                  </button>
                )}
                {windowIndex < totalWindows - 1 && (
                  <button
                    onClick={() => onMoveVM(windowIndex, windowIndex + 1, vm.vmId)}
                    className="px-2 py-1 text-xs rounded bg-slate-600 hover:bg-slate-500 text-slate-300 transition-colors"
                    title="Move to next window"
                  >
                    ▶
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function SchedulePage() {
  const calculationResults = useAppStore((s) => s.calculationResults);

  const [params, setParams] = useState<ScheduleParams>({ ...DEFAULT_PARAMS });
  const [schedule, setSchedule] = useState<MigrationSchedule | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [projectName, setProjectName] = useState('VM Migration Schedule');
  const [companyName, setCompanyName] = useState('');
  const [exporting, setExporting] = useState(false);

  const inputClass =
    'bg-slate-700 border border-slate-600 text-white rounded-lg px-3 py-2 w-full text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';
  const labelClass = 'text-xs text-slate-400 mb-1 block';

  function setParam<K extends keyof ScheduleParams>(key: K, value: ScheduleParams[K]) {
    setParams((p) => ({ ...p, [key]: value }));
  }

  function toggleWorkDay(day: number) {
    setParams((p) => ({
      ...p,
      workDays: p.workDays.includes(day)
        ? p.workDays.filter((d) => d !== day)
        : [...p.workDays, day].sort(),
    }));
  }

  async function handleGenerate() {
    setLoading(true);
    setError(null);
    try {
      const result = await generateSchedule(params, calculationResults?.results);
      setSchedule(result);
      setSelectedDate(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate schedule');
    } finally {
      setLoading(false);
    }
  }

  async function handleExportPDF() {
    if (!schedule) return;
    setExporting(true);
    setError(null);
    try {
      const blob = await exportSchedulePDF(schedule, projectName, companyName || undefined);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${projectName.replace(/\s+/g, '-')}-schedule.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to export PDF');
    } finally {
      setExporting(false);
    }
  }

  function handleMoveVM(fromIdx: number, toIdx: number, vmId: string) {
    if (!schedule) return;
    const windows = schedule.windows.map((w) => ({ ...w, vms: [...w.vms] }));
    const from = windows[fromIdx];
    const to = windows[toIdx];
    const vmIdx = from.vms.findIndex((v) => v.vmId === vmId);
    if (vmIdx === -1) return;
    const [vm] = from.vms.splice(vmIdx, 1);
    to.vms.push(vm);

    const recalcMinutes = (w: typeof from) =>
      w.vms.reduce(
        (s, v, i) => s + v.estimatedMinutes + (i > 0 ? schedule.params.bufferMinutes : 0),
        0,
      );
    from.totalMinutes = recalcMinutes(from);
    to.totalMinutes = recalcMinutes(to);

    const filtered = windows.filter((w) => w.vms.length > 0);
    setSchedule({ ...schedule, windows: filtered });

    // If selected date was the emptied window, clear selection
    if (from.vms.length === 0 && selectedDate === from.date) {
      setSelectedDate(null);
    }
  }

  const selectedWindow = schedule?.windows.find((w) => w.date === selectedDate);
  const selectedWindowIndex = schedule?.windows.findIndex((w) => w.date === selectedDate) ?? -1;

  return (
    <AppShell title="Migration Schedule">
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Left: params form */}
        <div className="space-y-4">
          <Card>
            <h3 className="text-base font-semibold text-slate-100 mb-4">Schedule Parameters</h3>
            <div className="space-y-3">
              <div>
                <label className={labelClass}>Start Date</label>
                <input
                  type="date"
                  value={params.startDate}
                  onChange={(e) => setParam('startDate', e.target.value)}
                  className={inputClass}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>Window Start</label>
                  <input
                    type="time"
                    value={params.windowStart}
                    onChange={(e) => setParam('windowStart', e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Window End</label>
                  <input
                    type="time"
                    value={params.windowEnd}
                    onChange={(e) => setParam('windowEnd', e.target.value)}
                    className={inputClass}
                  />
                </div>
              </div>

              <div>
                <label className={labelClass}>Work Days</label>
                <div className="flex gap-1 flex-wrap">
                  {DAY_NAMES.map((name, day) => (
                    <button
                      key={day}
                      onClick={() => toggleWorkDay(day)}
                      className={`px-2 py-1 text-xs rounded font-medium transition-colors ${
                        params.workDays.includes(day)
                          ? 'bg-blue-500 text-white'
                          : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
                      }`}
                      title={DAY_NAMES_FULL[day]}
                    >
                      {name}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>Max Concurrent</label>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={params.maxConcurrent}
                    onChange={(e) => setParam('maxConcurrent', parseInt(e.target.value) || 1)}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Buffer (min)</label>
                  <input
                    type="number"
                    min={0}
                    value={params.bufferMinutes}
                    onChange={(e) => setParam('bufferMinutes', parseInt(e.target.value) || 0)}
                    className={inputClass}
                  />
                </div>
              </div>

              <div>
                <label className={labelClass}>Preferred Method</label>
                <select
                  value={params.preferredMethod}
                  onChange={(e) => setParam('preferredMethod', e.target.value as ScheduleParams['preferredMethod'])}
                  className={inputClass}
                >
                  <option value="network_copy">Network Copy</option>
                  <option value="xcopy">XCopy (VAAI)</option>
                </select>
              </div>
            </div>

            {error && <p className="text-xs text-red-400 mt-3">{error}</p>}

            <button
              onClick={handleGenerate}
              disabled={loading || params.workDays.length === 0}
              className="mt-4 w-full rounded-lg bg-blue-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Generating…' : 'Generate Schedule'}
            </button>

            {!calculationResults && (
              <p className="text-xs text-slate-500 mt-2 text-center">
                No calculation results — server will auto-calculate using cached VMs.
              </p>
            )}
          </Card>

          {/* Export options (shown after schedule is generated) */}
          {schedule && (
            <Card>
              <h3 className="text-base font-semibold text-slate-100 mb-3">Export PDF</h3>
              <div className="space-y-3">
                <div>
                  <label className={labelClass}>Project Name</label>
                  <input
                    type="text"
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Company Name (optional)</label>
                  <input
                    type="text"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    placeholder="Acme Corp"
                    className={inputClass}
                  />
                </div>
              </div>
              <button
                onClick={handleExportPDF}
                disabled={exporting}
                className="mt-3 w-full rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {exporting ? 'Generating PDF…' : 'Export Schedule PDF'}
              </button>
            </Card>
          )}
        </div>

        {/* Right: calendar + details */}
        <div className="xl:col-span-2 space-y-6">
          {schedule ? (
            <>
              {/* Summary bar */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: 'Total VMs', value: schedule.windows.reduce((s, w) => s + w.vms.length, 0) },
                  { label: 'Windows', value: schedule.windows.length },
                  { label: 'Start', value: schedule.startDate },
                  { label: 'Completion', value: schedule.completionDate },
                ].map((item) => (
                  <div key={item.label} className="rounded-lg bg-slate-800 border border-slate-700 p-3">
                    <p className="text-xs text-slate-400">{item.label}</p>
                    <p className="text-sm font-semibold text-slate-100 mt-0.5">{item.value}</p>
                  </div>
                ))}
              </div>

              {/* Calendar */}
              <Card>
                <h3 className="text-sm font-semibold text-slate-300 mb-4">
                  Migration Calendar
                  <span className="text-slate-500 font-normal ml-2">— click a highlighted day for details</span>
                </h3>
                <ScheduleCalendar
                  schedule={schedule}
                  selectedDate={selectedDate}
                  onSelectDate={setSelectedDate}
                />
              </Card>

              {/* Selected day detail */}
              {selectedWindow && selectedWindowIndex !== -1 && (
                <Card>
                  <WindowDetail
                    window={selectedWindow}
                    windowIndex={selectedWindowIndex}
                    totalWindows={schedule.windows.length}
                    onMoveVM={handleMoveVM}
                  />
                </Card>
              )}

              {/* All windows list */}
              <Card>
                <h3 className="text-sm font-semibold text-slate-300 mb-4">All Migration Windows</h3>
                <div className="space-y-3">
                  {schedule.windows.map((win, idx) => (
                    <div
                      key={win.date}
                      className={`rounded-lg border p-3 cursor-pointer transition-colors ${
                        selectedDate === win.date
                          ? 'border-blue-500 bg-blue-900/20'
                          : 'border-slate-700 hover:border-slate-600'
                      }`}
                      onClick={() => setSelectedDate(win.date === selectedDate ? null : win.date)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-2 h-2 rounded-full bg-blue-400 shrink-0" />
                          <div>
                            <span className="text-sm font-medium text-slate-200">{win.date}</span>
                            <span className="text-xs text-slate-500 ml-2">{win.windowStart}–{win.windowEnd}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-slate-400">
                          <span>{win.vms.length} VM{win.vms.length !== 1 ? 's' : ''}</span>
                          <span>{formatMinutes(win.totalMinutes)}</span>
                          <svg
                            className={`w-4 h-4 transition-transform ${selectedDate === win.date ? 'rotate-180' : ''}`}
                            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                          </svg>
                        </div>
                      </div>

                      {selectedDate === win.date && (
                        <div className="mt-3 pt-3 border-t border-slate-700">
                          <WindowDetail
                            window={win}
                            windowIndex={idx}
                            totalWindows={schedule.windows.length}
                            onMoveVM={handleMoveVM}
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </Card>
            </>
          ) : (
            <div className="flex h-64 items-center justify-center rounded-xl border border-dashed border-slate-700 bg-slate-800/50">
              <div className="text-center">
                <svg className="mx-auto mb-3 h-10 w-10 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 9v7.5" />
                </svg>
                <p className="text-slate-400 text-sm">Configure parameters and generate a schedule</p>
                <p className="text-slate-600 text-xs mt-1">Requires discovered VMs from VMware</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
