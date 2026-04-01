import { useState } from 'react';
import { useAppStore } from '../../store';
import { connectPlatform, disconnectPlatform, testPlatformConnection } from '../../api/platforms';
import { Card } from '../shared/Card';
import { StatusDot } from '../shared/StatusDot';
import type { PlatformType } from '../../types/platform';

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

  return (
    <Card>
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
