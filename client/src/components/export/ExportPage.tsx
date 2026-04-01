import { useState } from 'react';
import { AppShell } from '../layout/AppShell';
import { Card } from '../shared/Card';
import { useAppStore } from '../../store';
import { exportPDF } from '../../api/exportApi';

export function ExportPage() {
  const calculationResults = useAppStore((s) => s.calculationResults);

  const [projectName, setProjectName] = useState('VM Migration Assessment');
  const [companyName, setCompanyName] = useState('');
  const [includeVMDetails, setIncludeVMDetails] = useState(true);
  const [includeFormulas, setIncludeFormulas] = useState(true);
  const [includeRecommendations, setIncludeRecommendations] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasResults = calculationResults !== null;

  async function handleExport() {
    if (!calculationResults) return;
    setGenerating(true);
    setError(null);
    try {
      const options = {
        projectName,
        companyName,
        includeVMDetails,
        includeFormulas,
        includeRecommendations,
      };
      const blob = await exportPDF(calculationResults, options);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${projectName.replace(/\s+/g, '-')}-migration-report.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate report');
    } finally {
      setGenerating(false);
    }
  }

  const inputClass = 'bg-slate-700 border border-slate-600 text-white rounded-lg px-4 py-2 w-full focus:outline-none focus:ring-2 focus:ring-blue-500';
  const labelClass = 'text-sm text-slate-400 mb-1 block';

  return (
    <AppShell title="Export Report">
      <Card>
        <div className="space-y-6">
          {/* Project Info */}
          <div className="space-y-4">
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

          {/* Include Sections */}
          <div>
            <h4 className="text-md font-semibold text-slate-200 mb-3">Include Sections</h4>
            <div className="space-y-2">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeVMDetails}
                  onChange={(e) => setIncludeVMDetails(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-600 bg-slate-700 text-blue-500 accent-blue-500"
                />
                <span className="text-sm text-slate-300">VM Details</span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeFormulas}
                  onChange={(e) => setIncludeFormulas(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-600 bg-slate-700 text-blue-500 accent-blue-500"
                />
                <span className="text-sm text-slate-300">Formula Breakdown</span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeRecommendations}
                  onChange={(e) => setIncludeRecommendations(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-600 bg-slate-700 text-blue-500 accent-blue-500"
                />
                <span className="text-sm text-slate-300">Recommendations</span>
              </label>
            </div>
          </div>

          {/* Preview */}
          <div>
            <h4 className="text-md font-semibold text-slate-200 mb-3">Preview</h4>
            <div className="rounded-lg bg-slate-700/50 border border-slate-600 p-4 text-sm text-slate-300 space-y-1">
              {hasResults ? (
                <>
                  <p>
                    <span className="text-slate-400">Project:</span> {projectName}
                    {companyName && ` - ${companyName}`}
                  </p>
                  <p>
                    <span className="text-slate-400">VMs:</span>{' '}
                    {calculationResults.summary.totalVMs} totaling{' '}
                    {calculationResults.summary.totalDiskGB} GB
                  </p>
                  <p>
                    <span className="text-slate-400">Fastest method:</span>{' '}
                    {calculationResults.summary.fastestTimeFormatted} via{' '}
                    {calculationResults.results.find(
                      (r) => r.method === calculationResults.summary.fastestMethod
                    )?.methodLabel ?? calculationResults.summary.fastestMethod}
                  </p>
                  <p>
                    <span className="text-slate-400">Sections:</span>{' '}
                    {[
                      includeVMDetails && 'VM Details',
                      includeFormulas && 'Formulas',
                      includeRecommendations && 'Recommendations',
                    ]
                      .filter(Boolean)
                      .join(', ') || 'None selected'}
                  </p>
                  <p>
                    <span className="text-slate-400">Methods compared:</span>{' '}
                    {calculationResults.results.filter((r) => r.compatible).length} compatible
                  </p>
                </>
              ) : (
                <p className="text-slate-500 italic">
                  No calculation results available. Run a calculation first to see a preview.
                </p>
              )}
            </div>
          </div>

          {/* Error */}
          {error && <p className="text-sm text-red-400">{error}</p>}

          {/* Export Button */}
          <button
            onClick={handleExport}
            disabled={!hasResults || generating}
            className="w-full rounded-lg bg-blue-500 px-6 py-3 text-base font-medium text-white hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {generating ? 'Generating Report...' : 'Generate PDF Report'}
          </button>

          {!hasResults && (
            <p className="text-sm text-center text-slate-500">
              Run a calculation first to generate a report.
            </p>
          )}
        </div>
      </Card>
    </AppShell>
  );
}
