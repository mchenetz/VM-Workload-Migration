import type {
  PlatformType,
  PlatformConnection,
  VMwareCredentials,
  OpenShiftCredentials,
  FlashArrayCredentials,
} from '@vm-migration/shared';
import { VmwareClient } from '../services/vmware/VmwareClient.js';
import { OpenshiftClient } from '../services/openshift/OpenshiftClient.js';
import { FlashArrayClient } from '../services/flasharray/FlashArrayClient.js';

type PlatformClient = VmwareClient | OpenshiftClient | FlashArrayClient;

interface PlatformEntry {
  client: PlatformClient;
  connection: PlatformConnection;
}

const store = new Map<PlatformType, PlatformEntry>();

function defaultConnection(type: PlatformType): PlatformConnection {
  return {
    type,
    endpoint: '',
    status: 'disconnected',
    lastChecked: null,
    errorMessage: null,
  };
}

export function getStatus(): PlatformConnection[] {
  const types: PlatformType[] = ['vmware', 'openshift', 'flasharray'];
  return types.map((type) => {
    const entry = store.get(type);
    return entry ? entry.connection : defaultConnection(type);
  });
}

export async function connect(
  type: PlatformType,
  endpoint: string,
  credentials: VMwareCredentials | OpenShiftCredentials | FlashArrayCredentials,
): Promise<PlatformConnection> {
  const connection: PlatformConnection = {
    type,
    endpoint,
    status: 'connecting',
    lastChecked: null,
    errorMessage: null,
  };

  try {
    let client: PlatformClient;

    switch (type) {
      case 'vmware': {
        const creds = credentials as VMwareCredentials;
        client = new VmwareClient(endpoint, creds.username, creds.password);
        await (client as VmwareClient).connect();
        break;
      }
      case 'openshift': {
        const creds = credentials as OpenShiftCredentials;
        client = new OpenshiftClient(endpoint, creds.token);
        const ok = await (client as OpenshiftClient).testConnection();
        if (!ok) {
          throw new Error(
            'Could not reach the OpenShift API. ' +
            'Verify the endpoint URL and that the bearer token is valid.',
          );
        }
        // Store the cluster version on the connection object
        connection.version = await (client as OpenshiftClient).getClusterVersion();
        break;
      }
      case 'flasharray': {
        const creds = credentials as FlashArrayCredentials;
        client = new FlashArrayClient(endpoint, creds.apiToken);
        await (client as FlashArrayClient).connect();
        break;
      }
    }

    connection.status = 'connected';
    connection.lastChecked = new Date().toISOString();

    store.set(type, { client, connection });
    return connection;
  } catch (error) {
    connection.status = 'error';
    connection.errorMessage = error instanceof Error ? error.message : 'Unknown connection error';
    connection.lastChecked = new Date().toISOString();

    store.set(type, { client: null as unknown as PlatformClient, connection });
    return connection;
  }
}

export function disconnect(type: PlatformType): PlatformConnection {
  const entry = store.get(type);
  if (entry?.client) {
    // Fire-and-forget disconnect for clients that support it
    if ('disconnect' in entry.client && typeof entry.client.disconnect === 'function') {
      (entry.client as VmwareClient).disconnect().catch(() => {});
    }
  }
  store.delete(type);
  return defaultConnection(type);
}

export async function testConnection(
  type: PlatformType,
  endpoint: string,
  credentials: VMwareCredentials | OpenShiftCredentials | FlashArrayCredentials,
): Promise<{ success: boolean; message: string }> {
  try {
    switch (type) {
      case 'vmware': {
        const creds = credentials as VMwareCredentials;
        const client = new VmwareClient(endpoint, creds.username, creds.password);
        const ok = await client.testConnection();
        return { success: ok, message: ok ? 'Connection successful' : 'Connection failed' };
      }
      case 'openshift': {
        const creds = credentials as OpenShiftCredentials;
        const client = new OpenshiftClient(endpoint, creds.token);
        const ok = await client.testConnection();
        return { success: ok, message: ok ? 'Connection successful' : 'Connection failed' };
      }
      case 'flasharray': {
        const creds = credentials as FlashArrayCredentials;
        const client = new FlashArrayClient(endpoint, creds.apiToken);
        const ok = await client.testConnection();
        return { success: ok, message: ok ? 'Connection successful' : 'Connection failed' };
      }
    }
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Connection test failed',
    };
  }
}

export function getClient(type: PlatformType): PlatformClient | null {
  const entry = store.get(type);
  return entry?.client ?? null;
}
