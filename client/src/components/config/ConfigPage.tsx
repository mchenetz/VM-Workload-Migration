import { AppShell } from '../layout/AppShell';
import { PlatformConnectionForm } from './PlatformConnectionForm';
import { TuningParameters } from './TuningParameters';

export function ConfigPage() {
  return (
    <AppShell title="Configuration">
      <div className="space-y-8">
        {/* Platform Connections */}
        <section>
          <h2 className="text-xl font-semibold text-slate-100 mb-4">Platform Connections</h2>
          <div className="space-y-4">
            <PlatformConnectionForm
              type="vmware"
              title="VMware vCenter"
              description="Connect to your VMware vCenter server to discover VMs and datastores."
            />
            <PlatformConnectionForm
              type="openshift"
              title="OpenShift"
              description="Connect to your OpenShift cluster running the Migration Toolkit for Virtualization."
            />
            <PlatformConnectionForm
              type="flasharray"
              title="FlashArray"
              description="Connect to your Pure Storage FlashArray for direct volume copy migrations."
            />
          </div>
        </section>

        {/* Tuning Parameters */}
        <section>
          <h2 className="text-xl font-semibold text-slate-100 mb-4">Tuning Parameters</h2>
          <TuningParameters />
        </section>
      </div>
    </AppShell>
  );
}
