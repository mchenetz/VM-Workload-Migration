import { Link } from 'react-router-dom';
import type { PlatformConnection, PlatformType } from '../../types/platform';
import { Card } from '../shared/Card';
import { StatusDot } from '../shared/StatusDot';

interface PlatformStatusPanelProps {
  platforms: PlatformConnection[];
}

const PLATFORM_LABELS: Record<PlatformType, string> = {
  vmware: 'VMware vCenter',
  openshift: 'OpenShift Cluster',
  flasharray: 'Pure FlashArray',
};

export function PlatformStatusPanel({ platforms }: PlatformStatusPanelProps) {
  return (
    <Card title="Platform Status">
      <div className="flex flex-col gap-4">
        {platforms.map((platform) => (
          <div
            key={platform.type}
            className="flex items-center justify-between rounded-lg border border-slate-700 bg-slate-800/50 px-4 py-3"
          >
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-slate-200">
                {PLATFORM_LABELS[platform.type]}
              </span>
            </div>
            <div className="flex items-center gap-3">
              {platform.status === 'connected' ? (
                <>
                  <span className="truncate text-xs text-slate-400" title={platform.endpoint}>
                    {platform.endpoint}
                  </span>
                  <StatusDot status="connected" label="Connected" />
                </>
              ) : (
                <>
                  <StatusDot status="disconnected" label="Not configured" />
                  <Link
                    to="/config"
                    className="text-xs font-medium text-blue-400 hover:text-blue-300"
                  >
                    Configure
                  </Link>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
