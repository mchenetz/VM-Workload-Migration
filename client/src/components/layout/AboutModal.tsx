import { useEffect, useState } from 'react';
import { api } from '../../api/client';

interface VersionInfo {
  version: string;
  name: string;
  description: string;
  repository: string;
  license: string;
  builtWith: { name: string; version: string }[];
  nodeEnv: string;
}

interface AboutModalProps {
  open: boolean;
  onClose: () => void;
}

export function AboutModal({ open, onClose }: AboutModalProps) {
  const [info, setInfo] = useState<VersionInfo | null>(null);

  useEffect(() => {
    if (!open) return;
    api.get<VersionInfo>('/version').then((r) => setInfo(r.data)).catch(() => {});
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl p-8"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-200 transition-colors"
          aria-label="Close"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Logo + name */}
        <div className="flex items-center gap-4 mb-6">
          <div className="w-12 h-12 rounded-xl bg-blue-500/20 border border-blue-500/40 flex items-center justify-center shrink-0">
            <svg className="w-7 h-7 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 14.25h13.5m-13.5 0a3 3 0 01-3-3m3 3a3 3 0 100 6h13.5a3 3 0 100-6m-16.5-3a3 3 0 013-3h13.5a3 3 0 013 3m-19.5 0a4.5 4.5 0 01.9-2.7L5.737 5.1a3.375 3.375 0 012.7-1.35h7.126c1.062 0 2.062.5 2.7 1.35l2.587 3.45a4.5 4.5 0 01.9 2.7m0 0a3 3 0 01-3 3m0 3h.008v.008h-.008v-.008zm0-6h.008v.008h-.008v-.008zm-3 6h.008v.008h-.008v-.008zm0-6h.008v.008h-.008v-.008z" />
            </svg>
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-100">VM Migration Estimator</h2>
            {info ? (
              <span className="inline-flex items-center gap-1.5 mt-1 px-2 py-0.5 rounded-full bg-blue-500/20 border border-blue-500/30 text-xs font-medium text-blue-300">
                v{info.version}
              </span>
            ) : (
              <div className="mt-1 h-5 w-16 rounded-full bg-slate-700 animate-pulse" />
            )}
          </div>
        </div>

        {info ? (
          <>
            {/* Description */}
            <p className="text-sm text-slate-400 mb-6 leading-relaxed">{info.description}</p>

            {/* Details grid */}
            <div className="space-y-3 mb-6">
              <Row label="Environment" value={info.nodeEnv} />
              <Row label="License" value={info.license} />
              <Row
                label="Repository"
                value={
                  <a
                    href={info.repository}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 hover:text-blue-300 underline underline-offset-2 transition-colors"
                  >
                    GitHub ↗
                  </a>
                }
              />
            </div>

            {/* Built with */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Built with</p>
              <div className="flex flex-wrap gap-2">
                {info.builtWith.map((tech) => (
                  <span
                    key={tech.name}
                    className="px-2.5 py-1 rounded-lg bg-slate-800 border border-slate-700 text-xs text-slate-300"
                  >
                    {tech.name} {tech.version}
                  </span>
                ))}
              </div>
            </div>
          </>
        ) : (
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-4 rounded bg-slate-700 animate-pulse" style={{ width: `${70 - i * 10}%` }} />
            ))}
          </div>
        )}

        <div className="mt-6 pt-5 border-t border-slate-800 text-center text-xs text-slate-600">
          OpenShift MTV · VDDK · XCopy (VAAI) · FlashArray Volume Copy
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-slate-500">{label}</span>
      <span className="text-slate-300 font-medium">{value}</span>
    </div>
  );
}
