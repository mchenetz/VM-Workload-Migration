import { useState } from 'react';
import { useAppStore } from '../../store';
import { connectPlatform, disconnectPlatform, testPlatformConnection } from '../../api/platforms';
import { Card } from '../shared/Card';
import { StatusDot } from '../shared/StatusDot';
import { PermissionsInfo } from '../shared/PermissionsInfo';
import type { PlatformType } from '../../types/platform';

const PERMISSIONS_DATA: Record<string, { platform: string; userLabel: string; permissions: { object: string; privileges: string[] }[]; notes: string[] }> = {
  vmware: {
    platform: 'vCenter',
    userLabel: 'service account',
    permissions: [
      {
        object: 'vCenter (read-only)',
        privileges: [
          'System.Anonymous',
          'System.Read',
          'System.View',
        ],
      },
      {
        object: 'VM Inventory',
        privileges: [
          'VirtualMachine.Config.QueryUnownedFiles',
          'VirtualMachine.Interact.PowerOn',
          'VirtualMachine.Interact.PowerOff',
          'VirtualMachine.Inventory.Register',
        ],
      },
      {
        object: 'Datastores',
        privileges: [
          'Datastore.Browse',
          'Datastore.FileManagement',
        ],
      },
      {
        object: 'Network',
        privileges: [
          'Network.Assign',
        ],
      },
      {
        object: 'Host',
        privileges: [
          'Host.Config.Storage',
          'Host.Local.ReconfigVM',
        ],
      },
    ],
    notes: [
      'A read-only role at the vCenter root with propagation is sufficient for discovery.',
      'Additional privileges are required if migration is triggered directly from vCenter.',
    ],
  },
  openshift: {
    platform: 'OpenShift',
    userLabel: 'service account',
    permissions: [
      {
        object: 'Cluster-level (ClusterRole)',
        privileges: [
          'get, list, watch — nodes',
          'get, list, watch — namespaces',
          'get, list, watch — storageclasses',
          'get, list, watch — persistentvolumes',
          'get, list, watch — clusterversions',
        ],
      },
      {
        object: 'Portworx CRDs (if installed)',
        privileges: [
          'get, list — storageclusters.core.libopenstorage.org',
          'get, list — storagenodes.core.libopenstorage.org',
        ],
      },
      {
        object: 'MTV Namespace (Role)',
        privileges: [
          'get, list, watch — virtualmachines (kubevirt.io)',
          'get, list, watch — plans, migrations (forklift.konveyor.io)',
          'create, update — plans (forklift.konveyor.io)',
        ],
      },
      {
        object: 'Built-in ClusterRole (optional baseline)',
        privileges: [
          'cluster-reader — read-only access to most cluster resources',
        ],
      },
    ],
    notes: [
      'A ServiceAccount with a bound ClusterRole is recommended over a personal user token.',
      'MTV (Migration Toolkit for Virtualization) must be installed for migration plan creation.',
      'Portworx CRD permissions are optional — only needed if Portworx is installed.',
      'Namespace-scoped role is only required if you scope MTV plans to a specific namespace.',
    ],
  },
  flasharray: {
    platform: 'FlashArray',
    userLabel: 'API token',
    permissions: [
      {
        object: 'Array Role (REST API)',
        privileges: [
          'Array Monitor — read-only access to array metrics and status',
          'GET /api/2.x/volumes — list volumes and capacity',
          'GET /api/2.x/arrays/performance — array-level performance metrics',
          'GET /api/2.x/hosts, /host-connections — host connectivity info',
        ],
      },
      {
        object: 'Not Required',
        privileges: [
          'Array Admin role — not needed for discovery',
          'Storage Admin role — not needed for read-only queries',
          'Write/modify permissions — read-only API token is sufficient',
        ],
      },
    ],
    notes: [
      'Create a dedicated read-only API token in the FlashArray GUI under System → Users.',
      'Array Monitor role is the minimum built-in role; do not use Array Admin for discovery.',
      'The API token is passed as the Authorization header (Bearer token) to the REST API.',
    ],
  },
};

interface PlatformConnectionFormProps {
  type: 'vmware' | 'openshift' | 'flasharray';
  title: string;
  description: string;
}

interface TestResult {
  success: boolean;
  message: string;
}

export function PlatformConnectionForm({ type, title, description }: PlatformConnectionFormProps) {
  const platform = useAppStore((s) => s.platforms.find((p) => p.type === type));
  const updatePlatform = useAppStore((s) => s.updatePlatform);

  const [endpoint, setEndpoint] = useState(platform?.endpoint ?? '');
  const [credentials, setCredentials] = useState<Record<string, string>>(() =>
    getDefaultCredentials(type)
  );
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [testing, setTesting] = useState(false);
  const [connecting, setConnecting] = useState(false);

  const isConnected = platform?.status === 'connected';

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await testPlatformConnection(type, endpoint, credentials);
      setTestResult(result);
    } catch (err) {
      setTestResult({ success: false, message: err instanceof Error ? err.message : 'Connection test failed' });
    } finally {
      setTesting(false);
    }
  }

  async function handleConnect() {
    setConnecting(true);
    try {
      updatePlatform(type, { status: 'connecting' });
      const result = await connectPlatform(type, endpoint, credentials);
      updatePlatform(type, { ...result });
    } catch (err) {
      updatePlatform(type, {
        status: 'error',
        errorMessage: err instanceof Error ? err.message : 'Connection failed',
      });
    } finally {
      setConnecting(false);
    }
  }

  async function handleDisconnect() {
    setConnecting(true);
    try {
      await disconnectPlatform(type);
      updatePlatform(type, { status: 'disconnected', endpoint: '', errorMessage: null });
      setTestResult(null);
    } catch (err) {
      updatePlatform(type, {
        status: 'error',
        errorMessage: err instanceof Error ? err.message : 'Disconnect failed',
      });
    } finally {
      setConnecting(false);
    }
  }

  function updateCredential(key: string, value: string) {
    setCredentials((prev) => ({ ...prev, [key]: value }));
  }

  const perms = PERMISSIONS_DATA[type];

  return (
    <Card>
      {perms && (
        <div className="mb-4">
          <PermissionsInfo
            platform={perms.platform}
            userLabel={perms.userLabel}
            permissions={perms.permissions}
            notes={perms.notes}
          />
        </div>
      )}
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-slate-100">{title}</h3>
          <p className="text-sm text-slate-400 mt-1">{description}</p>
        </div>
        <StatusDot status={platform?.status ?? 'disconnected'} label={platform?.status ?? 'disconnected'} />
      </div>

      <div className="space-y-4">
        {renderFields(type, endpoint, setEndpoint, credentials, updateCredential)}

        {testResult && (
          <p className={`text-sm ${testResult.success ? 'text-green-400' : 'text-red-400'}`}>
            {testResult.message}
          </p>
        )}

        <div className="flex gap-3 pt-2">
          {isConnected ? (
            <button
              onClick={handleDisconnect}
              disabled={connecting}
              className="rounded-lg bg-red-500 px-4 py-2 text-sm font-medium text-white hover:bg-red-600 disabled:opacity-50 transition-colors"
            >
              {connecting ? 'Disconnecting...' : 'Disconnect'}
            </button>
          ) : (
            <>
              <button
                onClick={handleTest}
                disabled={testing || !endpoint}
                className="rounded-lg border border-slate-600 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-700 disabled:opacity-50 transition-colors"
              >
                {testing ? 'Testing...' : 'Test Connection'}
              </button>
              <button
                onClick={handleConnect}
                disabled={connecting || !endpoint}
                className="rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600 disabled:opacity-50 transition-colors"
              >
                {connecting ? 'Connecting...' : 'Connect'}
              </button>
            </>
          )}
        </div>
      </div>
    </Card>
  );
}

function getDefaultCredentials(type: PlatformType): Record<string, string> {
  switch (type) {
    case 'vmware':
      return { username: '', password: '', datacenter: '' };
    case 'openshift':
      return { token: '', namespace: 'openshift-mtv' };
    case 'flasharray':
      return { apiToken: '' };
  }
}

function renderFields(
  type: PlatformType,
  endpoint: string,
  setEndpoint: (v: string) => void,
  credentials: Record<string, string>,
  updateCredential: (key: string, value: string) => void
) {
  const inputClass = 'bg-slate-700 border border-slate-600 text-white rounded-lg px-4 py-2 w-full focus:outline-none focus:ring-2 focus:ring-blue-500';
  const labelClass = 'text-sm text-slate-400 mb-1 block';

  const endpointLabel =
    type === 'vmware' ? 'Endpoint URL' : type === 'openshift' ? 'API Endpoint URL' : 'Management Endpoint';

  return (
    <>
      <div>
        <label className={labelClass}>{endpointLabel}</label>
        <input
          type="text"
          value={endpoint}
          onChange={(e) => setEndpoint(e.target.value)}
          placeholder={type === 'vmware' ? 'https://vcenter.example.com' : type === 'openshift' ? 'https://api.cluster.example.com:6443' : 'https://flasharray.example.com'}
          className={inputClass}
        />
      </div>

      {type === 'vmware' && (
        <>
          <div>
            <label className={labelClass}>Username</label>
            <input
              type="text"
              value={credentials.username}
              onChange={(e) => updateCredential('username', e.target.value)}
              placeholder="administrator@vsphere.local"
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Password</label>
            <input
              type="password"
              value={credentials.password}
              onChange={(e) => updateCredential('password', e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Datacenter (optional)</label>
            <input
              type="text"
              value={credentials.datacenter}
              onChange={(e) => updateCredential('datacenter', e.target.value)}
              placeholder="DC-01"
              className={inputClass}
            />
          </div>
        </>
      )}

      {type === 'openshift' && (
        <>
          <div>
            <label className={labelClass}>Bearer Token</label>
            <input
              type="password"
              value={credentials.token}
              onChange={(e) => updateCredential('token', e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Namespace</label>
            <input
              type="text"
              value={credentials.namespace}
              onChange={(e) => updateCredential('namespace', e.target.value)}
              placeholder="openshift-mtv"
              className={inputClass}
            />
          </div>
        </>
      )}

      {type === 'flasharray' && (
        <div>
          <label className={labelClass}>API Token</label>
          <input
            type="password"
            value={credentials.apiToken}
            onChange={(e) => updateCredential('apiToken', e.target.value)}
            className={inputClass}
          />
        </div>
      )}
    </>
  );
}
