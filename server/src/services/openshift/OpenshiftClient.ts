import axios, { AxiosInstance, AxiosError } from 'axios';
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
   *
   * Throws with a descriptive message on 401 (expired/invalid token) so the
   * caller can surface the exact problem rather than a generic "can't reach"
   * error.
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.api.get('/version');
      return true;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const e = error as AxiosError;
        if (e.response?.status === 401) {
          throw new Error(
            'Bearer token is invalid or expired (HTTP 401). ' +
            'Generate a fresh token with: oc whoami -t',
          );
        }
        if (e.response?.status === 403) {
          throw new Error(
            'Bearer token authenticated but lacks permission to read /version (HTTP 403). ' +
            'Ensure the service account has at least cluster-reader role.',
          );
        }
        if (!e.response) {
          // Network-level failure (DNS, connection refused, timeout)
          throw new Error(
            `Cannot reach OpenShift API at ${this.endpoint}: ${e.message}`,
          );
        }
      }
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

  async getPortworxStorageCluster(): Promise<PxStorageClusterList> {
    try {
      const response = await this.api.get(
        '/apis/core.libopenstorage.org/v1/storageclusters',
      );
      return response.data;
    } catch {
      return { items: [] };
    }
  }

  async getPortworxStorageNodes(): Promise<PxStorageNodeList> {
    try {
      const response = await this.api.get(
        '/apis/core.libopenstorage.org/v1/storagenodes',
      );
      return response.data;
    } catch {
      return { items: [] };
    }
  }

  async getPortworxPersistentVolumes(): Promise<K8sPVList> {
    try {
      const response = await this.api.get('/api/v1/persistentvolumes');
      const pvList = response.data as K8sPVList;
      pvList.items = pvList.items.filter(
        (pv) => pv.spec?.csi?.driver === 'pxd.portworx.com',
      );
      return pvList;
    } catch {
      return { items: [] };
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

export interface PxStorageClusterList {
  items: PxStorageCluster[];
}

export interface PxStorageCluster {
  metadata: { name: string; namespace: string };
  spec?: {
    image?: string;
    storage?: { devices?: string[] };
    cloudStorage?: { deviceSpecs?: string[] };
    env?: Array<{ name: string; value?: string }>;
  };
  status?: {
    phase?: string;
    version?: string;
    storage?: {
      totalCapacityRaw?: string;
      usedRaw?: string;
      backendProviders?: Array<{ providerName?: string }>;
    };
  };
}

export interface PxStorageNodeList {
  items: PxStorageNode[];
}

export interface PxStorageNode {
  metadata: { name: string; namespace: string };
  status?: {
    phase?: string;
    nodeUid?: string;
    network?: { dataIp?: string; mgmtIp?: string };
    storage?: {
      totalCapacityRaw?: string;
      usedRaw?: string;
      pools?: Array<{
        id?: string;
        totalSize?: string;
        usedSize?: string;
      }>;
    };
  };
}

export interface K8sPVList {
  items: K8sPV[];
}

export interface K8sPV {
  metadata: {
    name: string;
    annotations?: Record<string, string>;
    labels?: Record<string, string>;
  };
  spec?: {
    capacity?: { storage?: string };
    csi?: {
      driver?: string;
      volumeHandle?: string;
      volumeAttributes?: Record<string, string>;
    };
    nfs?: { server?: string; path?: string };
    persistentVolumeReclaimPolicy?: string;
  };
}
