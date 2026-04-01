export interface Disk {
  id: string;
  name: string;
  capacityGB: number;
  thinProvisioned: boolean;
  datastore: string;
}

export interface VM {
  id: string;
  name: string;
  guestOS: string;
  powerState: 'poweredOn' | 'poweredOff' | 'suspended';
  vCPUs: number;
  memoryGB: number;
  disks: Disk[];
  totalDiskSizeGB: number;
  datastoreName: string;
  resourcePool: string;
  network: string;
}

export interface Datastore {
  id: string;
  name: string;
  type: string;
  capacityGB: number;
  freeGB: number;
  isVAAICapable: boolean;
  isFlashArrayBacked: boolean;
}
