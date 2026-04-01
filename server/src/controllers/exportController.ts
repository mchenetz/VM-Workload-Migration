import type {
  CalculationResult,
  ExportOptions,
} from '@vm-migration/shared';
import PdfPrinter from 'pdfmake';
import type { TDocumentDefinitions, Content, TableCell } from 'pdfmake/interfaces.js';

const fonts = {
  Roboto: {
    normal: 'node_modules/pdfmake/build/vfs_fonts/Roboto-Regular.ttf',
    bold: 'node_modules/pdfmake/build/vfs_fonts/Roboto-Medium.ttf',
    italics: 'node_modules/pdfmake/build/vfs_fonts/Roboto-Italic.ttf',
    bolditalics: 'node_modules/pdfmake/build/vfs_fonts/Roboto-MediumItalic.ttf',
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
          { text: 'Est. Time (s)', style: 'tableHeader' },
        ],
      ];

      for (const vmResult of result.perVMResults) {
        vmRows.push([
          vmResult.vmName,
          vmResult.diskSizeGB.toFixed(1),
          vmResult.estimatedSeconds.toFixed(1),
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
