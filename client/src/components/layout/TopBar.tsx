import { useAppStore } from '../../store';
import { StatusDot } from '../shared/StatusDot';
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

  return (
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
      </div>
    </header>
  );
}
