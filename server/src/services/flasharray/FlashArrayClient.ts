import axios, { AxiosInstance, AxiosError } from 'axios';
import https from 'node:https';

export class FlashArrayClient {
  private endpoint: string;
  private apiToken: string;
  private authToken: string | null = null;
  private api: AxiosInstance;

  constructor(endpoint: string, apiToken: string) {
    this.endpoint = endpoint;
    this.apiToken = apiToken;

    this.api = axios.create({
      baseURL: this.endpoint,
      httpsAgent: new https.Agent({ rejectUnauthorized: false }),
    });

    // Attach the session token to every outgoing request
    this.api.interceptors.request.use((config) => {
      if (this.authToken) {
        config.headers['x-auth-token'] = this.authToken;
      }
      return config;
    });

    // On 401 (session expired), re-authenticate and retry the original request once
    this.api.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        const originalRequest = error.config as typeof error.config & { _retry?: boolean };
        if (error.response?.status === 401 && !originalRequest._retry) {
          originalRequest._retry = true;
          try {
            await this.connect();
            if (originalRequest.headers && this.authToken) {
              originalRequest.headers['x-auth-token'] = this.authToken;
            }
            return this.api(originalRequest);
          } catch {
            // Re-auth also failed — fall through and reject with original error
          }
        }
        return Promise.reject(error);
      },
    );
  }

  async connect(): Promise<void> {
    try {
      const response = await this.api.post('/api/2.0/login', null, {
        headers: { 'api-token': this.apiToken },
      });

      this.authToken =
        response.headers['x-auth-token'] ??
        response.data?.['x-auth-token'] ??
        null;

      if (!this.authToken) {
        throw new Error('No auth token received from FlashArray');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to connect to FlashArray: ${message}`);
    }
  }

  async getVolumes(): Promise<PureVolumeResponse> {
    try {
      const response = await this.api.get('/api/2.0/volumes');
      // Handle both { items: [...] } and direct array responses
      const data = response.data;
      if (Array.isArray(data)) {
        return { items: data };
      }
      return data as PureVolumeResponse;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to get volumes: ${message}`);
    }
  }

  async getPerformance(): Promise<PurePerformanceResponse> {
    try {
      const response = await this.api.get('/api/2.0/arrays/performance');
      const data = response.data;
      if (Array.isArray(data)) {
        return { items: data };
      }
      return data as PurePerformanceResponse;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to get performance metrics: ${message}`);
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.connect();
      return true;
    } catch {
      return false;
    }
  }
}

// Pure Storage REST API response types

export interface PureVolume {
  id: string;
  name: string;
  provisioned: number;
  space?: {
    data_reduction?: number;
    thin_provisioning?: number;
    total_physical?: number;
  };
  source?: { name?: string };
}

export interface PureVolumeResponse {
  items: PureVolume[];
  total_item_count?: number;
}

export interface PurePerformanceItem {
  reads_per_sec?: number;
  writes_per_sec?: number;
  input_per_sec?: number;
  output_per_sec?: number;
  usec_per_read_op?: number;
  usec_per_write_op?: number;
}

export interface PurePerformanceResponse {
  items: PurePerformanceItem[];
}
