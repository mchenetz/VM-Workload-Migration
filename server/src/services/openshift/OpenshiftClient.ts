import axios, { AxiosInstance, AxiosError } from 'axios';
import https from 'node:https';
import crypto from 'node:crypto';
import { URL } from 'node:url';

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

  async getVirtualMachines(): Promise<KubeVirtVMList> {
    try {
      const response = await this.api.get('/apis/kubevirt.io/v1/virtualmachines');
      return response.data;
    } catch {
      return { items: [] };
    }
  }

  async getMTVMigrations(namespace: string): Promise<MTVMigrationList> {
    try {
      const response = await this.api.get(
        `/apis/forklift.konveyor.io/v1beta1/namespaces/${namespace}/migrations`,
      );
      return response.data;
    } catch {
      return { items: [] };
    }
  }

  async secretExists(namespace: string, name: string): Promise<boolean> {
    try {
      await this.api.get(`/api/v1/namespaces/${namespace}/secrets/${name}`);
      return true;
    } catch {
      return false;
    }
  }

  /** Find the name of a running Portworx pod in the given namespace. */
  async findPortworxPod(namespace: string): Promise<string | null> {
    try {
      // Try label selectors first
      const selectors = [
        'name=portworx',
        'app=portworx',
        'app.kubernetes.io/name=portworx',
        'name=portworx-api',
        'app=portworx-api',
      ];
      for (const selector of selectors) {
        const res = await this.api.get(
          `/api/v1/namespaces/${namespace}/pods?labelSelector=${encodeURIComponent(selector)}&fieldSelector=status.phase%3DRunning`,
        );
        const items: Array<{ metadata: { name: string } }> = res.data?.items ?? [];
        if (items.length > 0) return items[0].metadata.name;
      }
      // Fallback: list all pods in namespace and find one with portworx in the name
      const allRes = await this.api.get(
        `/api/v1/namespaces/${namespace}/pods?fieldSelector=status.phase%3DRunning`,
      );
      const allItems: Array<{ metadata: { name: string }; spec?: { containers?: Array<{ name: string }> } }> =
        allRes.data?.items ?? [];
      const pxPod = allItems.find((p) => {
        const podName = p.metadata.name.toLowerCase();
        return podName.includes('portworx') && !podName.includes('operator') && !podName.includes('prometheus');
      });
      return pxPod?.metadata.name ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Execute a command in a pod via the Kubernetes WebSocket exec API.
   * Returns { stdout, stderr } as strings.
   */
  execInPod(
    namespace: string,
    pod: string,
    command: string[],
    container?: string,
  ): Promise<{ stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
      const base = new URL(this.endpoint);
      const params = new URLSearchParams();
      for (const c of command) params.append('command', c);
      params.append('stdout', 'true');
      params.append('stderr', 'true');
      params.append('stdin', 'false');
      params.append('tty', 'false');
      if (container) params.append('container', container);

      const path = `/api/v1/namespaces/${namespace}/pods/${pod}/exec?${params.toString()}`;
      const wsKey = crypto.randomBytes(16).toString('base64');

      const req = https.request({
        hostname: base.hostname,
        port: Number(base.port) || 443,
        path,
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.token}`,
          Upgrade: 'websocket',
          Connection: 'Upgrade',
          'Sec-WebSocket-Key': wsKey,
          'Sec-WebSocket-Version': '13',
          'Sec-WebSocket-Protocol': 'channel.k8s.io',
        },
        rejectUnauthorized: false,
        timeout: 30000,
      });

      req.on('upgrade', (_res, socket) => {
        let stdout = '';
        let stderr = '';
        let buf = Buffer.alloc(0);

        const timeout = setTimeout(() => {
          socket.destroy();
          resolve({ stdout, stderr });
        }, 25000);

        socket.on('data', (chunk: Buffer) => {
          buf = Buffer.concat([buf, chunk]);
          // Parse WebSocket frames
          while (buf.length >= 2) {
            const opcode = buf[0] & 0x0f;
            const masked = (buf[1] & 0x80) !== 0;
            let payloadLen = buf[1] & 0x7f;
            let offset = 2;

            if (payloadLen === 126) {
              if (buf.length < 4) break;
              payloadLen = buf.readUInt16BE(2);
              offset = 4;
            } else if (payloadLen === 127) {
              if (buf.length < 10) break;
              // Safe for realistic exec output sizes
              payloadLen = Number(buf.readBigUInt64BE(2));
              offset = 10;
            }
            if (masked) offset += 4;
            if (buf.length < offset + payloadLen) break;

            const payload = buf.subarray(offset, offset + payloadLen);
            buf = buf.subarray(offset + payloadLen);

            if (opcode === 0x8) { // connection close
              clearTimeout(timeout);
              socket.end();
              resolve({ stdout, stderr });
              return;
            }
            if ((opcode === 0x1 || opcode === 0x2) && payload.length > 0) {
              const channel = payload[0];
              const data = payload.subarray(1).toString('utf8');
              if (channel === 1) stdout += data;
              else if (channel === 2) stderr += data;
              else if (channel === 3) {
                // K8s status/error JSON
                try {
                  const s = JSON.parse(data) as { status?: string; message?: string };
                  if (s.status === 'Failure') {
                    clearTimeout(timeout);
                    reject(new Error(s.message ?? 'exec failed'));
                    return;
                  }
                } catch { /* non-JSON status — ignore */ }
              }
            }
          }
        });

        socket.on('end', () => { clearTimeout(timeout); resolve({ stdout, stderr }); });
        socket.on('error', (e) => { clearTimeout(timeout); reject(e); });
      });

      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('exec request timed out')); });
      req.end();
    });
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
  parameters?: Record<string, string>;
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
    volumes?: Array<{ name?: string; secret?: { secretName?: string } }>;
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
    network?: { dataIP?: string; mgmtIP?: string };
    storage?: {
      totalSize?: string;
      usedSize?: string;
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

export interface KubeVirtVMList {
  items: KubeVirtVM[];
}

export interface KubeVirtVM {
  metadata: {
    name: string;
    namespace: string;
    labels?: Record<string, string>;
    annotations?: Record<string, string>;
  };
  spec?: {
    template?: {
      spec?: {
        domain?: {
          cpu?: { cores?: number; sockets?: number; threads?: number };
          memory?: { guest?: string };
        };
      };
    };
  };
  status?: {
    /** e.g. "Running", "Stopped", "Paused", "Migrating" */
    printableStatus?: string;
    ready?: boolean;
  };
}

export interface MTVMigrationList {
  items: MTVMigration[];
}

export interface MTVMigration {
  metadata: { name: string; namespace: string };
  spec?: {
    plan?: { name?: string; namespace?: string };
  };
  status?: {
    conditions?: Array<{ type: string; status: string }>;
  };
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
