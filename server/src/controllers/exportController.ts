import type {
  CalculationResult,
  ExportOptions,
  MigrationSchedule,
} from '@vm-migration/shared';
import PdfPrinter from 'pdfmake';
import type { TDocumentDefinitions, Content, TableCell } from 'pdfmake/interfaces.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

// Extract embedded fonts from pdfmake's vfs to temp files for PdfPrinter
const require_ = createRequire(import.meta.url);
const vfsModule = require_('pdfmake/build/vfs_fonts.js');
const vfs: Record<string, string> = vfsModule.pdfMake?.vfs ?? vfsModule;

const fontDir = path.join(os.tmpdir(), 'pdfmake-fonts');
fs.mkdirSync(fontDir, { recursive: true });

function extractFont(name: string): string {
  const filePath = path.join(fontDir, name);
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, Buffer.from(vfs[name], 'base64'));
  }
  return filePath;
}

const fonts = {
  Roboto: {
    normal: extractFont('Roboto-Regular.ttf'),
    bold: extractFont('Roboto-Medium.ttf'),
    italics: extractFont('Roboto-Italic.ttf'),
    bolditalics: extractFont('Roboto-MediumItalic.ttf'),
  },
};

const printer = new PdfPrinter(fonts);

// ── Chart & Calendar helpers ──────────────────────────────────────────────────

function escXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

interface BarItem { label: string; value: number; color: string; valueLabel: string }

/** Horizontal SVG bar chart — returns a pdfmake Content node. */
function hBarChart(items: BarItem[], width = 515): Content {
  if (items.length === 0) return { text: '' };
  const BAR_H = 22;
  const GAP = 5;
  const LABEL_W = 165;
  const VALUE_W = 75;
  const barMaxW = width - LABEL_W - VALUE_W;
  const maxVal = Math.max(...items.map(i => i.value), 1);
  const totalH = items.length * (BAR_H + GAP) + 14;

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${totalH}">`;
  svg += `<rect x="0" y="0" width="${width}" height="${totalH}" fill="#f8fafc" rx="6"/>`;

  items.forEach((item, i) => {
    const y = i * (BAR_H + GAP) + 7;
    const barW = Math.max(3, Math.round((item.value / maxVal) * barMaxW));
    if (i % 2 === 0) {
      svg += `<rect x="0" y="${y - 1}" width="${width}" height="${BAR_H + 2}" fill="#f1f5f9" rx="2"/>`;
    }
    svg += `<text x="6" y="${y + BAR_H - 5}" font-family="Helvetica" font-size="9" fill="#475569">${escXml(item.label)}</text>`;
    svg += `<rect x="${LABEL_W}" y="${y + 4}" width="${barMaxW}" height="${BAR_H - 8}" fill="#e2e8f0" rx="3"/>`;
    svg += `<rect x="${LABEL_W}" y="${y + 4}" width="${barW}" height="${BAR_H - 8}" fill="${item.color}" rx="3"/>`;
    svg += `<text x="${LABEL_W + barMaxW + 6}" y="${y + BAR_H - 5}" font-family="Helvetica" font-size="9" fill="#334155">${escXml(item.valueLabel)}</text>`;
  });

  svg += '</svg>';
  return { svg, width } as unknown as Content;
}

/** Vertical SVG bar chart (up to 30 bars) — returns a pdfmake Content node. */
function vBarChart(items: BarItem[], width = 515, chartH = 140): Content {
  if (items.length === 0) return { text: '' };
  const visible = items.slice(0, 30);
  const BOTTOM_LABEL_H = 28;
  const TOP_PAD = 10;
  const plotH = chartH - BOTTOM_LABEL_H - TOP_PAD;
  const maxVal = Math.max(...visible.map(i => i.value), 1);
  const barW = Math.max(6, Math.floor((width - 20) / visible.length) - 3);
  const totalW = visible.length * (barW + 3) + 20;
  const svgW = Math.min(width, totalW);
  const svgH = chartH;

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${svgW}" height="${svgH}">`;
  svg += `<rect x="0" y="0" width="${svgW}" height="${svgH}" fill="#f8fafc" rx="6"/>`;
  // grid lines
  for (let g = 0; g <= 4; g++) {
    const gy = TOP_PAD + plotH - Math.round((g / 4) * plotH);
    svg += `<line x1="10" y1="${gy}" x2="${svgW - 10}" y2="${gy}" stroke="#e2e8f0" stroke-width="0.5"/>`;
  }

  visible.forEach((item, i) => {
    const x = 10 + i * (barW + 3);
    const bH = Math.max(2, Math.round((item.value / maxVal) * plotH));
    const y = TOP_PAD + plotH - bH;
    svg += `<rect x="${x}" y="${y}" width="${barW}" height="${bH}" fill="${item.color}" rx="2"/>`;
    // x-axis label — rotate if long
    const label = escXml(item.label.slice(-5)); // last 5 chars (e.g. "04-07")
    svg += `<text x="${x + barW / 2}" y="${svgH - 4}" font-family="Helvetica" font-size="7" fill="#64748b" text-anchor="middle">${label}</text>`;
    // value on top of bar
    if (bH > 16) {
      svg += `<text x="${x + barW / 2}" y="${y + 12}" font-family="Helvetica" font-size="7" fill="#ffffff" text-anchor="middle">${escXml(item.valueLabel)}</text>`;
    }
  });
  svg += '</svg>';
  return { svg, width: svgW } as unknown as Content;
}

const MONTH_NAMES_LONG = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function getMonthRange(start: string, end: string): { year: number; month: number }[] {
  const [sy, sm] = start.split('-').map(Number);
  const [ey, em] = end.split('-').map(Number);
  const months: { year: number; month: number }[] = [];
  let y = sy, m = sm - 1;
  while (y < ey || (y === ey && m <= em - 1)) {
    months.push({ year: y, month: m });
    m++; if (m > 11) { m = 0; y++; }
  }
  return months;
}

function fmtMins(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/** Pdfmake table for a single calendar month. Scheduled days get blue cells. */
function calendarMonthTable(
  year: number,
  month: number,
  windowByDate: Map<string, { vmCount: number; duration: string }>,
): Content {
  const DAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const headerRow: TableCell[] = DAY_ABBR.map(d => ({
    text: d, style: 'calHeader', alignment: 'center' as const,
  }));

  const cells: TableCell[] = Array(firstDay).fill(null).map(() => ({
    text: '', fillColor: '#f1f5f9', border: [false, false, false, false],
  }));

  for (let d = 1; d <= daysInMonth; d++) {
    const mm = String(month + 1).padStart(2, '0');
    const dd = String(d).padStart(2, '0');
    const dateStr = `${year}-${mm}-${dd}`;
    const win = windowByDate.get(dateStr);

    if (win) {
      cells.push({
        stack: [
          { text: String(d), fontSize: 9, bold: true, color: '#ffffff', alignment: 'center' as const },
          { text: `${win.vmCount} VM${win.vmCount !== 1 ? 's' : ''}`, fontSize: 7, color: '#bfdbfe', alignment: 'center' as const },
          { text: win.duration, fontSize: 6, color: '#93c5fd', alignment: 'center' as const },
        ],
        fillColor: '#1d4ed8',
        margin: [1, 4, 1, 4] as [number, number, number, number],
      });
    } else {
      cells.push({
        text: String(d),
        alignment: 'center' as const,
        fontSize: 9,
        color: '#64748b',
        margin: [1, 5, 1, 5] as [number, number, number, number],
      });
    }
  }

  while (cells.length % 7 !== 0) {
    cells.push({ text: '', fillColor: '#f1f5f9', border: [false, false, false, false] });
  }

  const rows: TableCell[][] = [headerRow];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));

  return {
    table: {
      headerRows: 1,
      widths: ['*', '*', '*', '*', '*', '*', '*'],
      body: rows,
    },
    layout: {
      hLineWidth: () => 0.5,
      vLineWidth: () => 0.5,
      hLineColor: () => '#e2e8f0',
      vLineColor: () => '#e2e8f0',
    },
    margin: [0, 0, 0, 16] as [number, number, number, number],
  } as unknown as Content;
}

// ── Common doc styles & footer ────────────────────────────────────────────────

const DOC_STYLES = {
  title:      { fontSize: 26, bold: true,  color: '#1e293b' },
  subtitle:   { fontSize: 16,              color: '#475569' },
  meta:       { fontSize: 10,              color: '#94a3b8' },
  heading:    { fontSize: 18, bold: true,  color: '#1e293b' },
  subheading: { fontSize: 13, bold: true,  color: '#334155' },
  label:      { fontSize: 11, bold: true,  color: '#475569' },
  chartTitle: { fontSize: 11, bold: true,  color: '#475569' },
  tableHeader:{ fontSize: 10, bold: true,  color: '#1e293b', fillColor: '#f1f5f9' },
  calHeader:  { fontSize: 9,  bold: true,  color: '#475569', fillColor: '#f8fafc' },
};

function docFooter(currentPage: number, pageCount: number): Content {
  return {
    text: `Page ${currentPage} of ${pageCount}`,
    alignment: 'center',
    margin: [0, 10, 0, 0],
    fontSize: 8,
    color: '#94a3b8',
  } as Content;
}

function pdfFromContent(content: Content[]): Promise<Buffer> {
  const doc: TDocumentDefinitions = {
    content,
    styles: DOC_STYLES,
    defaultStyle: { fontSize: 10, color: '#334155' },
    pageMargins: [40, 40, 40, 40],
    footer: docFooter,
  };
  return new Promise<Buffer>((resolve, reject) => {
    const pdfDoc = printer.createPdfKitDocument(doc);
    const chunks: Uint8Array[] = [];
    pdfDoc.on('data', (c: Uint8Array) => chunks.push(c));
    pdfDoc.on('end', () => resolve(Buffer.concat(chunks)));
    pdfDoc.on('error', reject);
    pdfDoc.end();
  });
}

// ── Recommendations / Estimate PDF ───────────────────────────────────────────

const METHOD_COLORS_PDF: Record<string, string> = {
  network_copy: '#3b82f6',
  xcopy: '#a855f7',
};

export async function generatePDF(
  results: CalculationResult[],
  options: ExportOptions,
): Promise<Buffer> {
  const content: Content[] = [];

  // Title page
  content.push(
    { text: 'VM Migration Estimate', style: 'title', margin: [0, 80, 0, 10] },
    { text: options.projectName, style: 'subtitle', margin: [0, 0, 0, 5] },
  );
  if (options.companyName) {
    content.push({ text: options.companyName, style: 'subtitle', margin: [0, 0, 0, 5] });
  }
  content.push(
    { text: `Generated: ${new Date().toLocaleDateString()}`, style: 'meta', margin: [0, 20, 0, 40] },
    { text: '', pageBreak: 'after' },
  );

  // ── Executive Summary ──
  content.push({ text: 'Executive Summary', style: 'heading', margin: [0, 0, 0, 10] });

  const summaryRows: TableCell[][] = [
    [
      { text: 'Method',     style: 'tableHeader' },
      { text: 'Total Time', style: 'tableHeader' },
      { text: 'Compatible', style: 'tableHeader' },
    ],
  ];
  for (const r of results) {
    summaryRows.push([
      r.methodLabel,
      r.totalTimeFormatted,
      r.compatible ? 'Yes' : `No — ${r.incompatibleReason ?? 'Unknown'}`,
    ]);
  }
  content.push({
    table: { headerRows: 1, widths: ['*', 'auto', 'auto'], body: summaryRows },
    layout: 'lightHorizontalLines',
    margin: [0, 0, 0, 20] as [number, number, number, number],
  });

  // ── Method Comparison Chart ──
  const compatibleResults = results.filter(r => r.compatible);
  if (compatibleResults.length > 0) {
    content.push({ text: 'Method Comparison', style: 'chartTitle', margin: [0, 0, 0, 6] });
    const maxSec = Math.max(...compatibleResults.map(r => r.totalTimeSeconds), 1);
    content.push(hBarChart(
      compatibleResults.map(r => ({
        label: r.methodLabel,
        value: r.totalTimeSeconds,
        color: METHOD_COLORS_PDF[r.method] ?? '#3b82f6',
        valueLabel: r.totalTimeFormatted,
      })),
      515,
    ));
    void maxSec;
    content.push({ text: '', margin: [0, 0, 0, 20] });
  }

  // ── Disk Size Distribution (from first compatible result with VM data) ──
  const firstWithVMs = results.find(r => r.compatible && r.perVMResults.length > 0);
  if (firstWithVMs && options.includeVMDetails) {
    const buckets = [
      { label: '< 50 GB',        min: 0,    max: 50,   count: 0 },
      { label: '50 – 200 GB',    min: 50,   max: 200,  count: 0 },
      { label: '200 – 500 GB',   min: 200,  max: 500,  count: 0 },
      { label: '500 GB – 1 TB',  min: 500,  max: 1024, count: 0 },
      { label: '> 1 TB',         min: 1024, max: Infinity, count: 0 },
    ];
    for (const vm of firstWithVMs.perVMResults) {
      const b = buckets.find(bk => vm.diskSizeGB >= bk.min && vm.diskSizeGB < bk.max);
      if (b) b.count++;
    }
    const populated = buckets.filter(b => b.count > 0);
    if (populated.length > 0) {
      content.push({ text: 'VM Disk Size Distribution', style: 'chartTitle', margin: [0, 0, 0, 6] });
      content.push(hBarChart(
        populated.map(b => ({
          label: b.label,
          value: b.count,
          color: '#0ea5e9',
          valueLabel: `${b.count} VM${b.count !== 1 ? 's' : ''}`,
        })),
        515,
      ));
      content.push({ text: '', margin: [0, 0, 0, 20] });
    }
  }

  // ── Per-method detail sections ──
  for (const result of results) {
    content.push({ text: result.methodLabel, style: 'subheading', margin: [0, 15, 0, 5] });
    content.push({ text: `Total time: ${result.totalTimeFormatted}`, margin: [0, 0, 0, 10] as [number, number, number, number] });

    if (options.includeVMDetails && result.perVMResults.length > 0) {
      const vmRows: TableCell[][] = [
        [
          { text: 'VM Name',       style: 'tableHeader' },
          { text: 'Disk (GB)',     style: 'tableHeader' },
          { text: 'Est. Time (min)', style: 'tableHeader' },
        ],
      ];
      for (const vm of result.perVMResults) {
        vmRows.push([vm.vmName, vm.diskSizeGB.toFixed(1), (vm.estimatedSeconds / 60).toFixed(1)]);
      }
      content.push({
        table: { headerRows: 1, widths: ['*', 'auto', 'auto'], body: vmRows },
        layout: 'lightHorizontalLines',
        margin: [0, 0, 0, 10] as [number, number, number, number],
      });
    }

    if (options.includeFormulas && result.formulaSteps.length > 0) {
      content.push({ text: 'Calculation Steps', style: 'label', margin: [0, 5, 0, 5] });
      const fRows: TableCell[][] = [
        [
          { text: 'Step',    style: 'tableHeader' },
          { text: 'Formula', style: 'tableHeader' },
          { text: 'Result',  style: 'tableHeader' },
        ],
      ];
      for (const s of result.formulaSteps) fRows.push([s.label, s.formula, s.result]);
      content.push({
        table: { headerRows: 1, widths: ['auto', '*', 'auto'], body: fRows },
        layout: 'lightHorizontalLines',
        margin: [0, 0, 0, 10] as [number, number, number, number],
      });
    }

    if (options.includeRecommendations && result.recommendations.length > 0) {
      content.push({ text: 'Recommendations', style: 'label', margin: [0, 5, 0, 5] });
      content.push({ ul: result.recommendations, margin: [0, 0, 0, 10] as [number, number, number, number] });
    }

    if (result.bottlenecks.length > 0) {
      content.push({ text: 'Bottlenecks & Warnings', style: 'label', margin: [0, 5, 0, 5] });
      content.push({
        ul: result.bottlenecks.map(b => `[${b.severity.toUpperCase()}] ${b.message} — ${b.suggestion}`),
        margin: [0, 0, 0, 10] as [number, number, number, number],
      });
    }
  }

  return pdfFromContent(content);
}

// ── Schedule PDF ──────────────────────────────────────────────────────────────

interface SchedulePDFOptions {
  projectName: string;
  companyName?: string;
}

export async function generateSchedulePDF(
  schedule: MigrationSchedule,
  options: SchedulePDFOptions,
): Promise<Buffer> {
  const content: Content[] = [];

  const totalVMs = schedule.windows.reduce((s, w) => s + w.vms.length, 0);
  const totalDiskGB = schedule.windows.reduce(
    (s, w) => s + w.vms.reduce((ss, v) => ss + v.diskSizeGB, 0), 0,
  );
  const totalMins = schedule.windows.reduce((s, w) => s + w.totalMinutes, 0);

  // ── Title page ──
  content.push(
    { text: 'VM Migration Schedule', style: 'title', margin: [0, 80, 0, 10] },
    { text: options.projectName, style: 'subtitle', margin: [0, 0, 0, 5] },
  );
  if (options.companyName) {
    content.push({ text: options.companyName, style: 'subtitle', margin: [0, 0, 0, 5] });
  }
  content.push(
    { text: `Generated: ${new Date().toLocaleDateString()}`, style: 'meta', margin: [0, 20, 0, 40] },
    { text: '', pageBreak: 'after' },
  );

  // ── Summary table ──
  content.push({ text: 'Schedule Summary', style: 'heading', margin: [0, 0, 0, 10] });

  content.push({
    table: {
      headerRows: 1,
      widths: ['*', '*', 'auto', 'auto', 'auto', 'auto'],
      body: [
        [
          { text: 'Start Date',      style: 'tableHeader' },
          { text: 'Completion',      style: 'tableHeader' },
          { text: 'Calendar Days',   style: 'tableHeader' },
          { text: 'Windows',         style: 'tableHeader' },
          { text: 'Total VMs',       style: 'tableHeader' },
          { text: 'Total Est. Time', style: 'tableHeader' },
        ],
        [
          schedule.startDate,
          schedule.completionDate,
          String(schedule.totalDays),
          String(schedule.windows.length),
          String(totalVMs),
          fmtMins(totalMins),
        ],
      ],
    },
    layout: 'lightHorizontalLines',
    margin: [0, 0, 0, 14] as [number, number, number, number],
  });

  // ── Schedule parameters ──
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  content.push({
    table: {
      headerRows: 1,
      widths: ['*', '*'],
      body: [
        [{ text: 'Parameter', style: 'tableHeader' }, { text: 'Value', style: 'tableHeader' }],
        ['Daily Window',      `${schedule.params.windowStart} – ${schedule.params.windowEnd}`],
        ['Work Days',         schedule.params.workDays.map(d => dayNames[d]).join(', ')],
        ['Max Concurrent',    String(schedule.params.maxConcurrent)],
        ['Buffer Between VMs', `${schedule.params.bufferMinutes} min`],
        ['Preferred Method',  schedule.params.preferredMethod === 'xcopy' ? 'XCopy (VAAI)' : 'Network Copy'],
        ['Total Disk to Migrate', `${totalDiskGB.toFixed(1)} GB`],
      ],
    },
    layout: 'lightHorizontalLines',
    margin: [0, 0, 0, 20] as [number, number, number, number],
  });

  // ── Overview Charts ──
  content.push({ text: '', pageBreak: 'before' });
  content.push({ text: 'Migration Overview', style: 'heading', margin: [0, 0, 0, 14] });

  // VMs per window bar chart
  content.push({ text: 'VMs Scheduled per Window', style: 'chartTitle', margin: [0, 0, 0, 6] });
  content.push(vBarChart(
    schedule.windows.map(w => ({
      label: w.date,
      value: w.vms.length,
      color: '#1d4ed8',
      valueLabel: String(w.vms.length),
    })),
    515, 150,
  ));
  content.push({ text: '', margin: [0, 0, 0, 18] });

  // Estimated duration per window bar chart
  content.push({ text: 'Estimated Duration per Window', style: 'chartTitle', margin: [0, 0, 0, 6] });
  content.push(vBarChart(
    schedule.windows.map(w => ({
      label: w.date,
      value: w.totalMinutes,
      color: '#0891b2',
      valueLabel: fmtMins(w.totalMinutes),
    })),
    515, 150,
  ));
  content.push({ text: '', margin: [0, 0, 0, 18] });

  // Disk per window bar chart (total GB per window)
  content.push({ text: 'Disk Volume per Window (GB)', style: 'chartTitle', margin: [0, 0, 0, 6] });
  content.push(vBarChart(
    schedule.windows.map(w => {
      const gb = w.vms.reduce((s, v) => s + v.diskSizeGB, 0);
      return {
        label: w.date,
        value: gb,
        color: '#7c3aed',
        valueLabel: gb >= 1024 ? `${(gb / 1024).toFixed(1)}T` : `${Math.round(gb)}G`,
      };
    }),
    515, 150,
  ));
  content.push({ text: '', margin: [0, 0, 0, 18] });

  // VM size distribution across all windows
  const allVMs = schedule.windows.flatMap(w => w.vms);
  const buckets = [
    { label: '< 50 GB',       min: 0,    max: 50,       count: 0 },
    { label: '50–200 GB',     min: 50,   max: 200,      count: 0 },
    { label: '200–500 GB',    min: 200,  max: 500,      count: 0 },
    { label: '500 GB–1 TB',   min: 500,  max: 1024,     count: 0 },
    { label: '> 1 TB',        min: 1024, max: Infinity, count: 0 },
  ];
  for (const vm of allVMs) {
    const b = buckets.find(bk => vm.diskSizeGB >= bk.min && vm.diskSizeGB < bk.max);
    if (b) b.count++;
  }
  const populated = buckets.filter(b => b.count > 0);
  if (populated.length > 0) {
    content.push({ text: 'VM Disk Size Distribution', style: 'chartTitle', margin: [0, 0, 0, 6] });
    content.push(hBarChart(
      populated.map(b => ({
        label: b.label,
        value: b.count,
        color: '#0ea5e9',
        valueLabel: `${b.count} VM${b.count !== 1 ? 's' : ''}`,
      })),
      515,
    ));
    content.push({ text: '', margin: [0, 0, 0, 8] });
  }

  // ── Calendar Grid ──
  content.push({ text: '', pageBreak: 'before' });
  content.push({ text: 'Migration Calendar', style: 'heading', margin: [0, 0, 0, 8] });
  content.push({
    text: 'Blue cells indicate scheduled migration windows. VM count and estimated duration shown inside.',
    fontSize: 9,
    color: '#64748b',
    margin: [0, 0, 0, 14] as [number, number, number, number],
  });

  // Build lookup map
  const windowByDate = new Map<string, { vmCount: number; duration: string }>();
  for (const win of schedule.windows) {
    windowByDate.set(win.date, { vmCount: win.vms.length, duration: fmtMins(win.totalMinutes) });
  }

  const months = getMonthRange(schedule.startDate, schedule.completionDate);
  for (const { year, month } of months) {
    content.push({
      text: `${MONTH_NAMES_LONG[month]} ${year}`,
      style: 'subheading',
      margin: [0, 8, 0, 6] as [number, number, number, number],
    });
    content.push(calendarMonthTable(year, month, windowByDate));
  }

  // ── Migration Windows Table ──
  content.push({ text: '', pageBreak: 'before' });
  content.push({ text: 'Migration Windows', style: 'heading', margin: [0, 0, 0, 10] });

  const winRows: TableCell[][] = [
    [
      { text: 'Date',         style: 'tableHeader' },
      { text: 'Window',       style: 'tableHeader' },
      { text: 'VMs',          style: 'tableHeader' },
      { text: 'Method',       style: 'tableHeader' },
      { text: 'Est. Duration', style: 'tableHeader' },
    ],
  ];
  for (const win of schedule.windows) {
    const hrs = Math.floor(win.totalMinutes / 60);
    const mins = win.totalMinutes % 60;
    winRows.push([
      win.date,
      `${win.windowStart}–${win.windowEnd}`,
      win.vms.map(v => v.vmName).join('\n'),
      win.vms[0]?.method === 'xcopy' ? 'XCopy' : 'Net Copy',
      hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`,
    ]);
  }
  content.push({
    table: { headerRows: 1, widths: ['auto', 'auto', '*', 'auto', 'auto'], body: winRows },
    layout: 'lightHorizontalLines',
    margin: [0, 0, 0, 20] as [number, number, number, number],
  });

  // ── VM Details per window ──
  content.push({ text: '', pageBreak: 'before' });
  content.push({ text: 'VM Details by Window', style: 'heading', margin: [0, 0, 0, 10] });

  for (const win of schedule.windows) {
    content.push({
      text: `${win.date}  (${win.windowStart}–${win.windowEnd})`,
      style: 'subheading',
      margin: [0, 10, 0, 4] as [number, number, number, number],
    });
    const vmRows: TableCell[][] = [
      [
        { text: 'VM Name',    style: 'tableHeader' },
        { text: 'Disk (GB)',  style: 'tableHeader' },
        { text: 'Est. Time',  style: 'tableHeader' },
        { text: 'Method',     style: 'tableHeader' },
      ],
    ];
    for (const vm of win.vms) {
      const h = Math.floor(vm.estimatedMinutes / 60);
      const m = vm.estimatedMinutes % 60;
      vmRows.push([
        vm.vmName,
        vm.diskSizeGB.toFixed(1),
        h > 0 ? `${h}h ${m}m` : `${m}m`,
        vm.method === 'xcopy' ? 'XCopy' : 'Net Copy',
      ]);
    }
    content.push({
      table: { headerRows: 1, widths: ['*', 'auto', 'auto', 'auto'], body: vmRows },
      layout: 'lightHorizontalLines',
      margin: [0, 0, 0, 8] as [number, number, number, number],
    });
  }

  return pdfFromContent(content);
}
