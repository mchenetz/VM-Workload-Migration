import axios, { AxiosInstance } from 'axios';
import https from 'node:https';

export class VmwareClient {
  private endpoint: string;
  private username: string;
  private password: string;
  private sessionToken: string | null = null;
  private api: AxiosInstance;

  constructor(endpoint: string, username: string, password: string) {
    this.endpoint = endpoint;
    this.username = username;
    this.password = password;

    this.api = axios.create({
      baseURL: this.endpoint,
      httpsAgent: new https.Agent({ rejectUnauthorized: false }),
    });

    this.api.interceptors.request.use((config) => {
      if (this.sessionToken) {
        config.headers['vmware-api-session-id'] = this.sessionToken;
      }
      return config;
    });
  }

  async connect(): Promise<void> {
    try {
      const credentials = Buffer.from(
        `${this.username}:${this.password}`,
      ).toString('base64');

      const response = await this.api.post('/api/session', null, {
        headers: {
          Authorization: `Basic ${credentials}`,
        },
      });

      this.sessionToken = response.data;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to connect to vSphere: ${message}`);
    }
  }

  async disconnect(): Promise<void> {
    try {
      if (this.sessionToken) {
        await this.api.delete('/api/session');
        this.sessionToken = null;
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to disconnect from vSphere: ${message}`);
    }
  }

  async getVMs(): Promise<VsphereVMSummary[]> {
    try {
      const response = await this.api.get('/api/vcenter/vm');
      return response.data;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to get VMs: ${message}`);
    }
  }

  async getVM(vmId: string): Promise<VsphereVMDetail> {
    try {
      const response = await this.api.get(`/api/vcenter/vm/${vmId}`);
      return response.data;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to get VM ${vmId}: ${message}`);
    }
  }

  async getVMDisks(vmId: string): Promise<VsphereDisk[]> {
    try {
      const response = await this.api.get(
        `/api/vcenter/vm/${vmId}/hardware/disk`,
      );
      return response.data;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to get disks for VM ${vmId}: ${message}`);
    }
  }

  async getDatastores(): Promise<VsphereDatastore[]> {
    try {
      const response = await this.api.get('/api/vcenter/datastore');
      return response.data;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to get datastores: ${message}`);
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.connect();
      await this.disconnect();
      return true;
    } catch {
      return false;
    }
  }
}

// vSphere REST API response types

export interface VsphereVMSummary {
  vm: string;
  name: string;
  power_state: string;
  cpu_count?: number;
  memory_size_MiB?: number;
}

export interface VsphereVMDetail {
  guest_OS: string;
  name: string;
  power_state: string;
  cpu: { count: number };
  memory: { size_MiB: number };
  disks: Record<
    string,
    {
      label: string;
      capacity: number;
      backing: {
        type: string;
        vmdk_file?: string;
        thin_provisioned?: boolean;
      };
    }
  >;
  nics?: Record<string, { label: string; backing: { network: string } }>;
}

export interface VsphereDisk {
  disk: string;
  label?: string;
  capacity?: number;
  backing?: {
    type?: string;
    vmdk_file?: string;
    thin_provisioned?: boolean;
  };
}

export interface VsphereDatastore {
  datastore: string;
  name: string;
  type: string;
  capacity: number;
  free_space: number;
}
