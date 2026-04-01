import axios, { AxiosInstance } from 'axios';
import https from 'node:https';

export class OpenshiftClient {
  private endpoint: string;
  private token: string;
  private api: AxiosInstance;

  constructor(endpoint: string, token: string) {
    this.endpoint = endpoint;
    this.token = token;

    this.api = axios.create({
      baseURL: this.endpoint,
      httpsAgent: new https.Agent({ rejectUnauthorized: false }),
      headers: {
        Authorization: `Bearer ${this.token}`,
      },
    });
  }

  async getNodes(): Promise<K8sNodeList> {
    try {
      const response = await this.api.get('/api/v1/nodes');
      return response.data;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to get nodes: ${message}`);
    }
  }

  async getStorageClasses(): Promise<K8sStorageClassList> {
    try {
      const response = await this.api.get(
        '/apis/storage.k8s.io/v1/storageclasses',
      );
      return response.data;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to get storage classes: ${message}`);
    }
  }

  async getMTVPlans(namespace: string): Promise<MTVPlanList> {
    try {
      const response = await this.api.get(
        `/apis/forklift.konveyor.io/v1beta1/namespaces/${namespace}/plans`,
      );
      return response.data;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to get MTV plans: ${message}`);
    }
  }

  /**
   * GET /version is accessible to any authenticated user regardless of RBAC.
   * Avoids the 403 that results from using /api/v1/namespaces with a token
   * that lacks list-namespaces permission (common in OpenShift 4.x).
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.api.get('/version');
      return true;
    } catch {
      return false;
    }
  }

  async getClusterVersion(): Promise<string> {
    try {
      const response = await this.api.get('/version');
      const v = response.data;
      // OpenShift embeds the OCP version in the openshift-apiservers group;
      // fall back to the Kubernetes version string if not present.
      return (v.openshiftVersion ?? `${v.major}.${v.minor}`) as string;
    } catch {
      return 'unknown';
    }
  }
}

// Kubernetes API response types

export interface K8sNodeList {
  kind: string;
  items: K8sNode[];
}

export interface K8sNode {
  metadata: { name: string; labels?: Record<string, string> };
  status: {
    allocatable: {
      cpu: string;
      memory: string;
      [key: string]: string;
    };
    capacity: {
      cpu: string;
      memory: string;
      [key: string]: string;
    };
  };
}

export interface K8sStorageClassList {
  kind: string;
  items: K8sStorageClass[];
}

export interface K8sStorageClass {
  metadata: {
    name: string;
    annotations?: Record<string, string>;
  };
  provisioner: string;
  volumeBindingMode?: string;
}

export interface MTVPlanList {
  kind: string;
  items: MTVPlan[];
}

export interface MTVPlan {
  metadata: { name: string; namespace: string };
  spec: {
    map?: { network?: unknown; storage?: unknown };
    vms?: Array<{ id: string; name?: string }>;
  };
  status?: { conditions?: Array<{ type: string; status: string }> };
}
