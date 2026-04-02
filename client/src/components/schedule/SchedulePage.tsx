import { useState, useEffect } from 'react';
import { AppShell } from '../layout/AppShell';
import { Card } from '../shared/Card';
import { useAppStore } from '../../store/index';
import { generateSchedule, exportSchedulePDF } from '../../api/scheduleApi';
import { getVMSource } from '../../api/discovery';
import { scoreScheduledVM, TIER_STYLE } from '../../utils/vmDifficulty';
import type { VMSourceInfo } from '../../api/discovery';
import type { ScheduleParams, MigrationSchedule, ScheduleWindow, ScheduledVM } from '../../types/calculation';
import type { MigrationMethod } from '../../types/calculation';

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

function calcWindowMins(start: string, end: string): number {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  return (eh * 60 + em) - (sh * 60 + sm);
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

interface DragInfo { vmId: string; fromDate: string }

// ── Calendar ──────────────────────────────────────────────────────────────────

interface CalendarProps {
  schedule: MigrationSchedule;
  selectedDate: string | null;
  dragInfo: DragInfo | null;
  dragOverDate: string | null;
  onSelectDate: (date: string) => void;
  onRemoveDay: (date: string) => void;
  onDragOverDate: (date: string | null) => void;
  onDropOnDate: (date: string) => void;
}

function ScheduleCalendar({
  schedule, selectedDate, dragInfo, dragOverDate,
  onSelectDate, onRemoveDay, onDragOverDate, onDropOnDate,
}: CalendarProps) {
  const windowByDate = new Map(schedule.windows.map((w) => [w.date, w]));
  const months = getMonthsInRange(schedule.startDate, schedule.completionDate);
  const isDragging = dragInfo !== null;

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
                const isDragTarget = isDragging && win && date !== dragInfo!.fromDate;
                const isDragOver = date === dragOverDate;

                let cellClass = 'relative h-10 flex flex-col items-center justify-center select-none';
                if (win) {
                  if (isDragOver) {
                    cellClass += ' bg-teal-700/80 cursor-copy ring-2 ring-inset ring-teal-400';
                  } else if (isSelected) {
                    cellClass += ' bg-blue-600 text-white cursor-pointer';
                  } else if (isDragTarget) {
                    cellClass += ' bg-blue-900/60 hover:bg-teal-800/60 cursor-copy ring-1 ring-inset ring-teal-500/50 text-blue-200';
                  } else {
                    cellClass += ' bg-blue-900/60 hover:bg-blue-800/70 cursor-pointer text-blue-200';
                  }
                } else if (isToday) {
                  cellClass += ' bg-slate-800 ring-1 ring-inset ring-blue-500/50 text-slate-400 cursor-default';
                } else {
                  cellClass += ' bg-slate-900 text-slate-600 cursor-default';
                }

                const dayNum = parseInt(date.slice(8), 10);

                return (
                  <div
                    key={date}
                    className={cellClass}
                    onClick={() => {
                      if (isDragging && isDragTarget) { onDropOnDate(date); return; }
                      if (win) onSelectDate(date);
                    }}
                    onDragOver={(e) => { if (isDragTarget) { e.preventDefault(); onDragOverDate(date); } }}
                    onDragLeave={() => { if (dragOverDate === date) onDragOverDate(null); }}
                    onDrop={(e) => { e.preventDefault(); if (isDragTarget) onDropOnDate(date); }}
                    title={win ? `${win.vms.length} VM(s) — ${formatMinutes(win.totalMinutes)}` : undefined}
                  >
                    <span className="text-xs">{dayNum}</span>
                    {win && (
                      <span className={`text-[9px] leading-none ${isSelected ? 'text-blue-100' : isDragOver ? 'text-teal-200' : 'text-blue-400'}`}>
                        {win.vms.length}VM
                      </span>
                    )}
                    {/* Remove button — only on selected cell */}
                    {isSelected && win && !isDragging && (
                      <button
                        onClick={(e) => { e.stopPropagation(); onRemoveDay(date); }}
                        className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 hover:bg-red-400 text-white flex items-center justify-center text-[9px] font-bold leading-none shadow z-10"
                        title="Remove this day — VMs will be reshuffled"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
            {isDragging && (
              <p className="text-[10px] text-teal-400 mt-1">
                Drop on any highlighted day to move the VM there
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Window Detail ─────────────────────────────────────────────────────────────

interface WindowDetailProps {
  window: ScheduleWindow;
  windowIndex: number;
  totalWindows: number;
  availableMethods: VMSourceInfo['availableMethods'];
  vmOverrides: Record<string, MigrationMethod>;
  dragInfo: DragInfo | null;
  onMoveVM: (fromIdx: number, toIdx: number, vmId: string) => void;
  onOverrideMethod: (vmId: string, method: MigrationMethod) => void;
  onDragStartVM: (e: React.DragEvent, vmId: string, fromDate: string) => void;
  onDragEnd: () => void;
  onDropVM: (toDate: string) => void;
  onRemoveDay: (date: string) => void;
}

function WindowDetail({
  window: win, windowIndex, totalWindows, availableMethods, vmOverrides, dragInfo,
  onMoveVM, onOverrideMethod, onDragStartVM, onDragEnd, onDropVM, onRemoveDay,
}: WindowDetailProps) {
  const [dropTarget, setDropTarget] = useState(false);
  const compatibleMethods = availableMethods.filter((m) => m.compatible);
  const showMethodOverride = compatibleMethods.length > 1;
  const isDroppable = dragInfo !== null && dragInfo.fromDate !== win.date;

  return (
    <div
      onDragOver={(e) => { if (isDroppable) { e.preventDefault(); setDropTarget(true); } }}
      onDragLeave={() => setDropTarget(false)}
      onDrop={(e) => { e.preventDefault(); setDropTarget(false); if (isDroppable) onDropVM(win.date); }}
      className={`transition-all rounded-lg ${dropTarget ? 'ring-2 ring-teal-400 bg-teal-900/20 p-2' : ''}`}
    >
      <div className="flex items-center justify-between mb-3">
        <div>
          <span className="text-slate-200 font-medium">{win.date}</span>
          <span className="text-slate-400 text-sm ml-2">{win.windowStart}–{win.windowEnd}</span>
          {dropTarget && <span className="ml-2 text-xs text-teal-400 font-medium">Drop to move here</span>}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">{formatMinutes(win.totalMinutes)} total</span>
          <button
            onClick={() => onRemoveDay(win.date)}
            className="px-2 py-0.5 text-xs rounded bg-red-900/40 hover:bg-red-700/50 text-red-400 hover:text-red-300 border border-red-800/40 transition-colors"
            title="Remove this window — VMs will be reshuffled to other days"
          >
            Remove Day
          </button>
        </div>
      </div>
      <div className="space-y-2">
        {win.vms.map((vm) => {
          const hrs = Math.floor(vm.estimatedMinutes / 60);
          const mins = vm.estimatedMinutes % 60;
          const timeStr = hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;
          const { tier } = scoreScheduledVM(vm);
          const effectiveMethod = vmOverrides[vm.vmId] ?? vm.method;
          const isOverridden = !!vmOverrides[vm.vmId];
          const isDraggingThis = dragInfo?.vmId === vm.vmId;

          return (
            <div
              key={vm.vmId}
              draggable
              onDragStart={(e) => onDragStartVM(e, vm.vmId, win.date)}
              onDragEnd={onDragEnd}
              className={`flex items-center gap-2 rounded-lg px-2 py-2 transition-all ${
                isDraggingThis
                  ? 'opacity-40 bg-slate-700/30 ring-1 ring-dashed ring-slate-500'
                  : 'bg-slate-700/50 hover:bg-slate-700/70 cursor-grab active:cursor-grabbing'
              }`}
            >
              {/* Drag handle */}
              <div className="shrink-0 text-slate-500 hover:text-slate-300 cursor-grab active:cursor-grabbing px-0.5" title="Drag to move to another window">
                <svg viewBox="0 0 10 16" className="w-2.5 h-4 fill-current">
                  <circle cx="2" cy="2" r="1.5"/><circle cx="8" cy="2" r="1.5"/>
                  <circle cx="2" cy="8" r="1.5"/><circle cx="8" cy="8" r="1.5"/>
                  <circle cx="2" cy="14" r="1.5"/><circle cx="8" cy="14" r="1.5"/>
                </svg>
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm text-slate-200 truncate">{vm.vmName}</p>
                  <span className={`px-1.5 py-0.5 rounded text-xs font-medium shrink-0 ${TIER_STYLE[tier]}`}>{tier}</span>
                </div>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  <p className="text-xs text-slate-400">{vm.diskSizeGB.toFixed(1)} GB &bull; {timeStr}</p>
                  {showMethodOverride ? (
                    <select
                      value={effectiveMethod}
                      onChange={(e) => onOverrideMethod(vm.vmId, e.target.value as MigrationMethod)}
                      onClick={(e) => e.stopPropagation()}
                      className={`text-xs rounded px-1.5 py-0.5 border focus:outline-none focus:ring-1 focus:ring-blue-500 ${
                        isOverridden
                          ? 'bg-amber-900/40 border-amber-600/50 text-amber-300'
                          : 'bg-slate-600 border-slate-500 text-slate-300'
                      }`}
                    >
                      {compatibleMethods.map((m) => (
                        <option key={m.method} value={m.method}>{m.label}</option>
                      ))}
                    </select>
                  ) : (
                    <span className="text-xs text-slate-500">
                      {effectiveMethod === 'xcopy' ? 'XCopy' : 'Net Copy'}
                    </span>
                  )}
                </div>
              </div>

              {/* Move arrows */}
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

// ── Page ─────────────────────────────────────────────────────────────────────

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
  const [vmSource, setVmSource] = useState<VMSourceInfo>({
    source: 'none',
    availableMethods: [
      { method: 'network_copy', label: 'Network Copy', compatible: true },
      { method: 'xcopy',        label: 'XCopy (VAAI)', compatible: true },
    ],
    recommendedMethod: 'network_copy',
  });
  const [vmOverrides, setVmOverrides] = useState<Record<string, MigrationMethod>>({});
  const [dragInfo, setDragInfo] = useState<DragInfo | null>(null);
  const [dragOverDate, setDragOverDate] = useState<string | null>(null);

  // Load VM source info on mount
  useEffect(() => {
    getVMSource().then((info) => {
      setVmSource(info);
      if (info.source === 'discovered') {
        setParam('preferredMethod', info.recommendedMethod as MigrationMethod);
      }
    }).catch(() => {});
  }, []);

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

  function handleOverrideMethod(vmId: string, method: MigrationMethod) {
    setVmOverrides((prev) => ({ ...prev, [vmId]: method }));
  }

  async function handleGenerate() {
    setLoading(true);
    setError(null);
    setVmOverrides({});
    setDragInfo(null);
    try {
      const paramsWithOverrides = { ...params, vmMethodOverrides: vmOverrides };
      const result = await generateSchedule(paramsWithOverrides, calculationResults?.results);
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

  // ── Move VM between window indices ──
  function recalcWindow(w: ScheduleWindow): ScheduleWindow {
    const totalMinutes = w.vms.reduce(
      (s, v, i) => s + v.estimatedMinutes + (i > 0 ? schedule!.params.bufferMinutes : 0),
      0,
    );
    return { ...w, totalMinutes };
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

    windows[fromIdx] = recalcWindow(from);
    windows[toIdx] = recalcWindow(to);

    const filtered = windows.filter((w) => w.vms.length > 0);
    const completionDate = filtered.length > 0 ? filtered[filtered.length - 1].date : schedule.startDate;
    setSchedule({ ...schedule, windows: filtered, completionDate });
    if (from.vms.length === 0 && selectedDate === from.date) setSelectedDate(null);
  }

  // ── Drag VM between dates ──
  function handleDragStartVM(e: React.DragEvent, vmId: string, fromDate: string) {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', `${vmId}|${fromDate}`);
    setDragInfo({ vmId, fromDate });
  }

  function handleDragEnd() {
    setDragInfo(null);
    setDragOverDate(null);
  }

  function handleDropOnDate(toDate: string) {
    if (!schedule || !dragInfo) return;
    const { vmId, fromDate } = dragInfo;
    if (fromDate === toDate) { handleDragEnd(); return; }
    const fromIdx = schedule.windows.findIndex((w) => w.date === fromDate);
    const toIdx = schedule.windows.findIndex((w) => w.date === toDate);
    if (fromIdx === -1 || toIdx === -1) { handleDragEnd(); return; }
    handleMoveVM(fromIdx, toIdx, vmId);
    handleDragEnd();
  }

  // ── Remove a day and redistribute its VMs ──
  function handleRemoveDay(date: string) {
    if (!schedule) return;
    const windowIdx = schedule.windows.findIndex((w) => w.date === date);
    if (windowIdx === -1) return;

    const displacedVMs = [...schedule.windows[windowIdx].vms];
    const remaining = schedule.windows
      .filter((_, i) => i !== windowIdx)
      .map((w) => ({ ...w, vms: [...w.vms] }));

    const windowMins = calcWindowMins(schedule.params.windowStart, schedule.params.windowEnd);
    const maxC = schedule.params.maxConcurrent;
    const buf = schedule.params.bufferMinutes;

    function tryAdd(w: ScheduleWindow, vm: ScheduledVM): boolean {
      if (w.vms.length >= maxC) return false;
      const addedMins = vm.estimatedMinutes + (w.vms.length > 0 ? buf : 0);
      if (w.totalMinutes + addedMins > windowMins) return false;
      w.vms.push(vm);
      w.totalMinutes += addedMins;
      return true;
    }

    for (const vm of displacedVMs) {
      let placed = false;
      // Try subsequent windows first (keep migration moving forward)
      const startIdx = Math.min(windowIdx, remaining.length - 1);
      for (let i = startIdx; i < remaining.length; i++) {
        if (tryAdd(remaining[i], vm)) { placed = true; break; }
      }
      // Then try earlier windows
      if (!placed) {
        for (let i = startIdx - 1; i >= 0; i--) {
          if (tryAdd(remaining[i], vm)) { placed = true; break; }
        }
      }
      // Force into last window as overflow
      if (!placed && remaining.length > 0) {
        const last = remaining[remaining.length - 1];
        last.vms.push(vm);
        last.totalMinutes += vm.estimatedMinutes + (last.vms.length > 1 ? buf : 0);
      }
    }

    const completionDate = remaining.length > 0 ? remaining[remaining.length - 1].date : schedule.startDate;
    setSchedule({ ...schedule, windows: remaining, completionDate });
    if (selectedDate === date) setSelectedDate(null);
  }

  const selectedWindow = schedule?.windows.find((w) => w.date === selectedDate);
  const selectedWindowIndex = schedule?.windows.findIndex((w) => w.date === selectedDate) ?? -1;

  const windowDetailProps = {
    availableMethods: vmSource.availableMethods,
    vmOverrides,
    dragInfo,
    onMoveVM: handleMoveVM,
    onOverrideMethod: handleOverrideMethod,
    onDragStartVM: handleDragStartVM,
    onDragEnd: handleDragEnd,
    onDropVM: handleDropOnDate,
    onRemoveDay: handleRemoveDay,
  };

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
                  <input type="time" value={params.windowStart} onChange={(e) => setParam('windowStart', e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Window End</label>
                  <input type="time" value={params.windowEnd} onChange={(e) => setParam('windowEnd', e.target.value)} className={inputClass} />
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
                  <input type="number" min={1} max={20} value={params.maxConcurrent} onChange={(e) => setParam('maxConcurrent', parseInt(e.target.value) || 1)} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Buffer (min)</label>
                  <input type="number" min={0} value={params.bufferMinutes} onChange={(e) => setParam('bufferMinutes', parseInt(e.target.value) || 0)} className={inputClass} />
                </div>
              </div>

              <div>
                <label className={labelClass}>
                  Preferred Method
                  {vmSource.source === 'discovered' && (
                    <span className="ml-2 text-green-400">● auto-detected</span>
                  )}
                  {vmSource.source === 'imported' && (
                    <span className="ml-2 text-yellow-500">⚠ compatibility unknown (CSV import)</span>
                  )}
                </label>
                <select
                  value={params.preferredMethod}
                  onChange={(e) => setParam('preferredMethod', e.target.value as ScheduleParams['preferredMethod'])}
                  className={inputClass}
                >
                  {(vmSource.availableMethods.length > 0
                    ? vmSource.availableMethods.filter((m) => vmSource.source !== 'discovered' || m.compatible)
                    : [
                        { method: 'network_copy', label: 'Network Copy', compatible: true },
                        { method: 'xcopy',        label: 'XCopy (VAAI)', compatible: true },
                      ]
                  ).map((m) => (
                    <option key={m.method} value={m.method}>{m.label}</option>
                  ))}
                </select>
                {vmSource.source === 'discovered' && vmSource.availableMethods.some((m) => !m.compatible) && (
                  <p className="text-xs text-slate-500 mt-1">
                    {vmSource.availableMethods.filter((m) => !m.compatible).map((m) => m.reason).join(' · ')}
                  </p>
                )}
              </div>
            </div>

            {error && <p className="text-xs text-red-400 mt-3">{error}</p>}

            <button
              onClick={handleGenerate}
              disabled={loading || params.workDays.length === 0}
              className="mt-4 w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Generating…' : 'Generate Schedule'}
            </button>
            {!loading && (
              <p className="text-xs text-slate-500 mt-2 text-center">
                No calculation results — server will auto-calculate using cached VMs.
              </p>
            )}
          </Card>

          {schedule && (
            <Card>
              <h3 className="text-sm font-semibold text-slate-300 mb-3">Export Schedule</h3>
              <div className="space-y-3">
                <div>
                  <label className={labelClass}>Project Name</label>
                  <input type="text" value={projectName} onChange={(e) => setProjectName(e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Company Name (optional)</label>
                  <input type="text" value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Acme Corp" className={inputClass} />
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
                <h3 className="text-sm font-semibold text-slate-300 mb-1">
                  Migration Calendar
                </h3>
                <p className="text-xs text-slate-500 mb-4">
                  Click a day to select • ✕ on selected day to remove &amp; reshuffle • Drag VMs onto days to move them
                </p>
                <ScheduleCalendar
                  schedule={schedule}
                  selectedDate={selectedDate}
                  dragInfo={dragInfo}
                  dragOverDate={dragOverDate}
                  onSelectDate={setSelectedDate}
                  onRemoveDay={handleRemoveDay}
                  onDragOverDate={setDragOverDate}
                  onDropOnDate={handleDropOnDate}
                />
              </Card>

              {/* Selected day detail */}
              {selectedWindow && selectedWindowIndex !== -1 && (
                <Card>
                  <WindowDetail
                    window={selectedWindow}
                    windowIndex={selectedWindowIndex}
                    totalWindows={schedule.windows.length}
                    {...windowDetailProps}
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
                      className={`rounded-lg border p-3 transition-colors ${
                        selectedDate === win.date
                          ? 'border-blue-500 bg-blue-900/20'
                          : 'border-slate-700 hover:border-slate-600'
                      }`}
                    >
                      <div
                        className="flex items-center justify-between cursor-pointer"
                        onClick={() => setSelectedDate(win.date === selectedDate ? null : win.date)}
                      >
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
                            {...windowDetailProps}
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
