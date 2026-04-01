export type PlatformType = 'vmware' | 'openshift' | 'flasharray';
export type ConnectionStatus = 'connected' | 'disconnected' | 'connecting' | 'error';

export interface PlatformConnection {
  type: PlatformType;
  endpoint: string;
  status: ConnectionStatus;
  lastChecked: string | null;
  errorMessage: string | null;
  version?: string;
}
