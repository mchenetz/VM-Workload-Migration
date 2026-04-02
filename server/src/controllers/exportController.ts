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
    {
      text: `Generated: ${new Date().toLocaleDateString()}`,
      style: 'meta',
      margin: [0, 20, 0, 40],
    },
    { text: '', pageBreak: 'after' },
  );

  // Executive summary table
  content.push({ text: 'Executive Summary', style: 'heading', margin: [0, 0, 0, 10] });

  const summaryRows: TableCell[][] = [
    [
      { text: 'Method', style: 'tableHeader' },
      { text: 'Total Time', style: 'tableHeader' },
      { text: 'Compatible', style: 'tableHeader' },
    ],
  ];

  for (const result of results) {
    summaryRows.push([
      result.methodLabel,
      result.totalTimeFormatted,
      result.compatible ? 'Yes' : `No - ${result.incompatibleReason ?? 'Unknown'}`,
    ]);
  }

  content.push({
    table: {
      headerRows: 1,
      widths: ['*', 'auto', 'auto'],
      body: summaryRows,
    },
    layout: 'lightHorizontalLines',
    margin: [0, 0, 0, 20] as [number, number, number, number],
  });

  // Per-method results
  for (const result of results) {
    content.push({ text: result.methodLabel, style: 'subheading', margin: [0, 15, 0, 5] });
    content.push({
      text: `Total time: ${result.totalTimeFormatted}`,
      margin: [0, 0, 0, 10] as [number, number, number, number],
    });

    // VM details table
    if (options.includeVMDetails && result.perVMResults.length > 0) {
      const vmRows: TableCell[][] = [
        [
          { text: 'VM Name', style: 'tableHeader' },
          { text: 'Disk Size (GB)', style: 'tableHeader' },
          { text: 'Est. Time (min)', style: 'tableHeader' },
        ],
      ];

      for (const vmResult of result.perVMResults) {
        vmRows.push([
          vmResult.vmName,
          vmResult.diskSizeGB.toFixed(1),
          (vmResult.estimatedSeconds / 60).toFixed(1),
        ]);
      }

      content.push({
        table: {
          headerRows: 1,
          widths: ['*', 'auto', 'auto'],
          body: vmRows,
        },
        layout: 'lightHorizontalLines',
        margin: [0, 0, 0, 10] as [number, number, number, number],
      });
    }

    // Formula steps
    if (options.includeFormulas && result.formulaSteps.length > 0) {
      content.push({ text: 'Calculation Steps', style: 'label', margin: [0, 5, 0, 5] });

      const formulaRows: TableCell[][] = [
        [
          { text: 'Step', style: 'tableHeader' },
          { text: 'Formula', style: 'tableHeader' },
          { text: 'Result', style: 'tableHeader' },
        ],
      ];

      for (const step of result.formulaSteps) {
        formulaRows.push([step.label, step.formula, step.result]);
      }

      content.push({
        table: {
          headerRows: 1,
          widths: ['auto', '*', 'auto'],
          body: formulaRows,
        },
        layout: 'lightHorizontalLines',
        margin: [0, 0, 0, 10] as [number, number, number, number],
      });
    }

    // Recommendations
    if (options.includeRecommendations && result.recommendations.length > 0) {
      content.push({ text: 'Recommendations', style: 'label', margin: [0, 5, 0, 5] });

      const recItems: Content[] = result.recommendations.map((rec) => ({
        text: rec,
        margin: [10, 2, 0, 2] as [number, number, number, number],
      }));

      content.push({
        ul: recItems.map((item) =>
          typeof item === 'object' && 'text' in item ? (item as { text: string }).text : '',
        ),
        margin: [0, 0, 0, 10] as [number, number, number, number],
      });
    }

    // Bottlenecks
    if (result.bottlenecks.length > 0) {
      content.push({ text: 'Bottlenecks & Warnings', style: 'label', margin: [0, 5, 0, 5] });

      content.push({
        ul: result.bottlenecks.map(
          (b) => `[${b.severity.toUpperCase()}] ${b.message} - ${b.suggestion}`,
        ),
        margin: [0, 0, 0, 10] as [number, number, number, number],
      });
    }
  }

  const docDefinition: TDocumentDefinitions = {
    content,
    styles: {
      title: { fontSize: 26, bold: true, color: '#1e293b' },
      subtitle: { fontSize: 16, color: '#475569' },
      meta: { fontSize: 10, color: '#94a3b8' },
      heading: { fontSize: 18, bold: true, color: '#1e293b' },
      subheading: { fontSize: 14, bold: true, color: '#334155' },
      label: { fontSize: 11, bold: true, color: '#475569' },
      tableHeader: { fontSize: 10, bold: true, color: '#1e293b', fillColor: '#f1f5f9' },
    },
    defaultStyle: {
      fontSize: 10,
      color: '#334155',
    },
    pageMargins: [40, 40, 40, 40],
    footer: (currentPage: number, pageCount: number) => ({
      text: `Page ${currentPage} of ${pageCount}`,
      alignment: 'center' as const,
      margin: [0, 10, 0, 0],
      fontSize: 8,
      color: '#94a3b8',
    }),
  };

  return new Promise<Buffer>((resolve, reject) => {
    const pdfDoc = printer.createPdfKitDocument(docDefinition);
    const chunks: Uint8Array[] = [];

    pdfDoc.on('data', (chunk: Uint8Array) => chunks.push(chunk));
    pdfDoc.on('end', () => resolve(Buffer.concat(chunks)));
    pdfDoc.on('error', reject);

    pdfDoc.end();
  });
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

  // Title page
  content.push(
    { text: 'VM Migration Schedule', style: 'title', margin: [0, 80, 0, 10] },
    { text: options.projectName, style: 'subtitle', margin: [0, 0, 0, 5] },
  );

  if (options.companyName) {
    content.push({ text: options.companyName, style: 'subtitle', margin: [0, 0, 0, 5] });
  }

  content.push(
    {
      text: `Generated: ${new Date().toLocaleDateString()}`,
      style: 'meta',
      margin: [0, 20, 0, 40],
    },
    { text: '', pageBreak: 'after' },
  );

  // Summary
  content.push({ text: 'Schedule Summary', style: 'heading', margin: [0, 0, 0, 10] });

  const totalVMs = schedule.windows.reduce((s, w) => s + w.vms.length, 0);
  const summaryRows: TableCell[][] = [
    [
      { text: 'Start Date', style: 'tableHeader' },
      { text: 'Completion Date', style: 'tableHeader' },
      { text: 'Total Days', style: 'tableHeader' },
      { text: 'Migration Windows', style: 'tableHeader' },
      { text: 'Total VMs', style: 'tableHeader' },
    ],
    [
      schedule.startDate,
      schedule.completionDate,
      String(schedule.totalDays),
      String(schedule.windows.length),
      String(totalVMs),
    ],
  ];

  content.push({
    table: { headerRows: 1, widths: ['*', '*', 'auto', 'auto', 'auto'], body: summaryRows },
    layout: 'lightHorizontalLines',
    margin: [0, 0, 0, 20] as [number, number, number, number],
  });

  // Schedule parameters
  content.push({ text: 'Schedule Parameters', style: 'subheading', margin: [0, 10, 0, 5] });

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const workDaysLabel = schedule.params.workDays.map((d) => dayNames[d]).join(', ');

  const paramRows: TableCell[][] = [
    [
      { text: 'Parameter', style: 'tableHeader' },
      { text: 'Value', style: 'tableHeader' },
    ],
    ['Daily Window', `${schedule.params.windowStart} – ${schedule.params.windowEnd}`],
    ['Work Days', workDaysLabel],
    ['Max Concurrent', String(schedule.params.maxConcurrent)],
    ['Buffer Between VMs', `${schedule.params.bufferMinutes} min`],
    ['Preferred Method', schedule.params.preferredMethod === 'xcopy' ? 'XCopy (VAAI)' : 'Network Copy'],
  ];

  content.push({
    table: { headerRows: 1, widths: ['*', '*'], body: paramRows },
    layout: 'lightHorizontalLines',
    margin: [0, 0, 0, 20] as [number, number, number, number],
  });

  // Migration windows
  content.push(
    { text: '', pageBreak: 'before' },
    { text: 'Migration Windows', style: 'heading', margin: [0, 0, 0, 10] },
  );

  const windowRows: TableCell[][] = [
    [
      { text: 'Date', style: 'tableHeader' },
      { text: 'Window', style: 'tableHeader' },
      { text: 'VMs', style: 'tableHeader' },
      { text: 'Method', style: 'tableHeader' },
      { text: 'Est. Duration', style: 'tableHeader' },
    ],
  ];

  for (const win of schedule.windows) {
    const vmNames = win.vms.map((v) => v.vmName).join('\n');
    const hrs = Math.floor(win.totalMinutes / 60);
    const mins = win.totalMinutes % 60;
    const duration = hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;
    const method = win.vms[0]?.method === 'xcopy' ? 'XCopy' : 'Net Copy';

    windowRows.push([
      win.date,
      `${win.windowStart}–${win.windowEnd}`,
      vmNames,
      method,
      duration,
    ]);
  }

  content.push({
    table: {
      headerRows: 1,
      widths: ['auto', 'auto', '*', 'auto', 'auto'],
      body: windowRows,
    },
    layout: 'lightHorizontalLines',
    margin: [0, 0, 0, 20] as [number, number, number, number],
  });

  // VM details per window
  content.push(
    { text: '', pageBreak: 'before' },
    { text: 'VM Details by Window', style: 'heading', margin: [0, 0, 0, 10] },
  );

  for (const win of schedule.windows) {
    content.push({
      text: `${win.date}  (${win.windowStart}–${win.windowEnd})`,
      style: 'subheading',
      margin: [0, 10, 0, 4] as [number, number, number, number],
    });

    const vmRows: TableCell[][] = [
      [
        { text: 'VM Name', style: 'tableHeader' },
        { text: 'Disk (GB)', style: 'tableHeader' },
        { text: 'Est. Time', style: 'tableHeader' },
        { text: 'Method', style: 'tableHeader' },
      ],
    ];

    for (const vm of win.vms) {
      const hrs = Math.floor(vm.estimatedMinutes / 60);
      const mins = vm.estimatedMinutes % 60;
      const timeStr = hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;
      vmRows.push([
        vm.vmName,
        vm.diskSizeGB.toFixed(1),
        timeStr,
        vm.method === 'xcopy' ? 'XCopy' : 'Net Copy',
      ]);
    }

    content.push({
      table: { headerRows: 1, widths: ['*', 'auto', 'auto', 'auto'], body: vmRows },
      layout: 'lightHorizontalLines',
      margin: [0, 0, 0, 8] as [number, number, number, number],
    });
  }

  const docDefinition: TDocumentDefinitions = {
    content,
    styles: {
      title: { fontSize: 26, bold: true, color: '#1e293b' },
      subtitle: { fontSize: 16, color: '#475569' },
      meta: { fontSize: 10, color: '#94a3b8' },
      heading: { fontSize: 18, bold: true, color: '#1e293b' },
      subheading: { fontSize: 13, bold: true, color: '#334155' },
      label: { fontSize: 11, bold: true, color: '#475569' },
      tableHeader: { fontSize: 10, bold: true, color: '#1e293b', fillColor: '#f1f5f9' },
    },
    defaultStyle: { fontSize: 10, color: '#334155' },
    pageMargins: [40, 40, 40, 40],
    footer: (currentPage: number, pageCount: number) => ({
      text: `Page ${currentPage} of ${pageCount}`,
      alignment: 'center' as const,
      margin: [0, 10, 0, 0],
      fontSize: 8,
      color: '#94a3b8',
    }),
  };

  return new Promise<Buffer>((resolve, reject) => {
    const pdfDoc = printer.createPdfKitDocument(docDefinition);
    const chunks: Uint8Array[] = [];
    pdfDoc.on('data', (chunk: Uint8Array) => chunks.push(chunk));
    pdfDoc.on('end', () => resolve(Buffer.concat(chunks)));
    pdfDoc.on('error', reject);
    pdfDoc.end();
  });
}
