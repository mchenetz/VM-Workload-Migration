import { useState } from 'react';
import { useAppStore } from '../../store';
import { StatusDot } from '../shared/StatusDot';
import { AboutModal } from './AboutModal';
import type { PlatformType } from '../../types/platform';

interface TopBarProps {
  title?: string;
}

const platformLabels: Record<PlatformType, string> = {
  vmware: 'VMware',
  openshift: 'OpenShift',
  flasharray: 'FlashArray',
};

export function TopBar({ title }: TopBarProps) {
  const platforms = useAppStore((s) => s.platforms);
  const sidebarCollapsed = useAppStore((s) => s.sidebarCollapsed);
  const [aboutOpen, setAboutOpen] = useState(false);

  return (
    <>
      <header
        className={`fixed top-0 right-0 h-16 bg-slate-900/80 backdrop-blur-sm border-b border-slate-800 flex items-center justify-between px-6 z-20 transition-all duration-300 ${
          sidebarCollapsed ? 'left-16' : 'left-64'
        }`}
      >
        <h1 className="text-xl font-semibold text-slate-100">{title}</h1>
        <div className="flex items-center gap-4">
          {platforms.map((p) => (
            <StatusDot key={p.type} status={p.status} label={platformLabels[p.type]} />
          ))}

          {/* About button */}
          <button
            onClick={() => setAboutOpen(true)}
            className="ml-1 text-slate-400 hover:text-slate-200 transition-colors rounded-lg p-1.5 hover:bg-slate-800"
            title="About"
            aria-label="About"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
            </svg>
          </button>
        </div>
      </header>

      <AboutModal open={aboutOpen} onClose={() => setAboutOpen(false)} />
    </>
  );
}
