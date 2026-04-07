# VM Workload Migration Time Estimator

A full-stack tool for estimating VM migration times when using **OpenShift Migration Toolkit for Virtualization (MTV/Forklift)** to migrate workloads from VMware vSphere. Compares two transfer methods side-by-side and recommends the optimal approach based on your infrastructure.

## Transfer Methods

### Network Copy (VDDK)
The standard Forklift migration method. VM disks are transferred over the network using VMware's Virtual Disk Development Kit (VDDK). Transfer speed depends on available network bandwidth, compression ratio, number of concurrent transfers, and VDDK protocol overhead.

**Formula:**
```
effective_size = total_disk_size * (1 - compression_ratio)
effective_bandwidth = network_Gbps * utilization * (1 - vddk_overhead) * 0.95
time = effective_size / effective_bandwidth / concurrent_transfers
```

Supports warm migration calculations with incremental sync based on daily change rate.

### XCopy (VAAI)
VMware vStorage APIs for Array Integration (VAAI) primitive that offloads copy operations directly to the storage array. Bypasses the network entirely when source and target storage are on the same or VAAI-connected arrays. Typically 2-10x faster than network copy.

**Formula:**
```
array_speed = network_bandwidth * xcopy_multiplier / 8
time = total_disk_size / array_speed + (vm_count * 2s metadata)
```

Requires VAAI-capable datastores (typically VMFS-backed).

## Features

### Dashboard
Real-time overview of migration estimates with:
- Summary cards showing total VMs, storage, fastest method, and recommended approach
- Side-by-side method comparison bar chart
- Migration timeline visualization
- Platform connection status for all three infrastructure endpoints
- Automatic demo data when no calculations have been run

### Manual Calculator
Estimate migration times without connecting to any infrastructure:
- Input VM count, total disk size, and network bandwidth
- Three preset profiles: Conservative (minimal production impact), Balanced (recommended), and Aggressive (maximum speed)
- Advanced tuning for concurrent transfers, bandwidth utilization, compression ratio, VDDK overhead, XCopy speed multiplier, and storage IOPS
- Warm migration toggle with daily change rate and cutover day settings
- Full formula breakdown showing every calculation step with substituted values
- Bottleneck detection and optimization recommendations

### Auto-Discovery
Connect to live infrastructure to automatically pull VM inventories and calculate estimates:
- **VMware vCenter**: Discovers VMs, disk sizes, guest OS, power state, datastores, and resource pools via the vSphere REST API
- **OpenShift**: Discovers cluster capacity (nodes, CPU, memory), storage classes, and MTV installation status via the Kubernetes API
- **Pure FlashArray**: Discovers volumes, data reduction ratios, and real-time performance metrics (IOPS, bandwidth, latency) via the Pure Storage REST API v2
- Automatic compatibility detection for each method per VM based on datastore capabilities and storage class provisioners

### Configuration
- Platform connection forms with test and connect buttons for each infrastructure endpoint
- Credential management: vCenter (username/password), OpenShift (bearer token), FlashArray (API token)
- Global tuning parameters with range sliders and real-time value display
- Reset to defaults

### PDF Export
Generate professional migration assessment reports including:
- Executive summary with method comparison table
- Per-VM detail tables with individual time estimates
- Formula breakdown for each calculation method
- Bottleneck warnings and optimization recommendations
- Customizable project and company name

## Architecture

```
vm-migration-estimator/
├── shared/              # Domain types, constants, formula definitions
│   └── src/
│       ├── types.ts     # VM, Platform, Calculation, Export types
│       ├── constants.ts # Method labels, colors, default tuning values
│       └── formulas.ts  # Human-readable formula descriptions
│
├── server/              # Node.js + Express + TypeScript backend
│   └── src/
│       ├── routes/      # REST API endpoints
│       ├── controllers/ # Request handling and business logic
│       ├── services/
│       │   ├── vmware/       # vSphere REST API client
│       │   ├── openshift/    # Kubernetes API client
│       │   ├── flasharray/   # Pure Storage REST API v2 client
│       │   ├── calculation/  # Migration time formulas and engine
│       │   ├── compatibility/# Method compatibility detection
│       │   └── pdf/          # Report generation with pdfmake
│       ├── config/      # Default parameters and preset profiles
│       └── middleware/   # Error handling and Zod validation
│
├── client/              # React + TypeScript + Vite frontend
│   └── src/
│       ├── components/
│       │   ├── dashboard/   # Overview cards, charts, timeline
│       │   ├── calculator/  # Input forms, presets, results, formulas
│       │   ├── discovery/   # VMware/OpenShift/FlashArray panels
│       │   ├── config/      # Platform connections, tuning params
│       │   ├── export/      # PDF report generation
│       │   ├── layout/      # App shell, sidebar, top bar
│       │   └── shared/      # Reusable Card, StatusDot, etc.
│       ├── store/       # Zustand state management
│       ├── api/         # Axios API client layer
│       ├── hooks/       # Auto-refresh, platform status, calculation
│       ├── types/       # Frontend type definitions
│       └── utils/       # Formatters and constants
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, TypeScript, Vite, Tailwind CSS v4, Recharts, Zustand |
| Backend | Node.js, Express, TypeScript, tsx (dev runner) |
| PDF | pdfmake with Roboto fonts |
| Validation | Zod schemas |
| Monorepo | npm workspaces |

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/platforms/status` | Connection status for all platforms |
| POST | `/api/platforms/connect` | Connect to vCenter, OpenShift, or FlashArray |
| POST | `/api/platforms/disconnect` | Disconnect a platform |
| POST | `/api/platforms/test` | Test connection without saving |
| GET | `/api/discovery/vmware/vms` | Discover VMs from vCenter |
| GET | `/api/discovery/openshift/cluster` | Get OpenShift cluster info |
| GET | `/api/discovery/flasharray/volumes` | Get FlashArray volumes and performance |
| GET | `/api/discovery/compatibility` | Check method compatibility per VM |
| POST | `/api/calculate/manual` | Calculate from manual inputs |
| POST | `/api/calculate/auto` | Calculate from discovered VMs |
| POST | `/api/export/pdf` | Generate PDF report |

## Preset Profiles

| Profile | Concurrent | Bandwidth Util. | Compression | VDDK Overhead |
|---------|-----------|-----------------|-------------|---------------|
| Conservative | 2 | 50% | 20% | 15% |
| Balanced | 4 | 70% | 35% | 12% |
| Aggressive | 8 | 85% | 50% | 10% |

## Helm Deployment

Deploy to any Kubernetes cluster or OpenShift with Helm 3.

### Prerequisites

- Helm 3.8+ (`helm version`)
- Access to a Kubernetes cluster or OpenShift 4.x
- `kubectl` / `oc` configured against your target cluster

### Install from OCI Registry (Recommended)

```bash
helm install vm-migration \
  oci://ghcr.io/mchenetz/charts/vm-migration-estimator 
```

### Install from Helm Repository

```bash
helm repo add vm-migration https://mchenetz.github.io/VM-Workload-Migration/
helm repo update
helm install vm-migration vm-migration/vm-migration-estimator
```

### Install from Release Tarball

Download the `.tgz` from the [GitHub Releases](https://github.com/mchenetz/VM-Workload-Migration/releases) page:

```bash
helm install vm-migration vm-migration-estimator-1.0.0.tgz
```

### Verify the Installation

```bash
# Wait for pod to be ready
kubectl rollout status deployment/vm-migration-vm-migration-estimator

# Check the service
kubectl get svc vm-migration-vm-migration-estimator

# Port-forward for local access
kubectl port-forward svc/vm-migration-vm-migration-estimator 3001:3001
# Visit http://localhost:3001
```

---

### Expose the Application

#### Standard Kubernetes Ingress

```bash
helm install vm-migration oci://ghcr.io/mchenetz/charts/vm-migration-estimator \
  --set ingress.enabled=true \
  --set ingress.className=nginx \
  --set ingress.host=vm-migration.example.com
```

With TLS via cert-manager:

```bash
helm install vm-migration oci://ghcr.io/mchenetz/charts/vm-migration-estimator \
  --set ingress.enabled=true \
  --set ingress.className=nginx \
  --set ingress.host=vm-migration.example.com \
  --set ingress.annotations."cert-manager\.io/cluster-issuer"=letsencrypt \
  --set "ingress.tls[0].secretName=vm-migration-tls" \
  --set "ingress.tls[0].hosts[0]=vm-migration.example.com"
```

#### OpenShift Route

```bash
helm install vm-migration oci://ghcr.io/mchenetz/charts/vm-migration-estimator \
  --set route.enabled=true
```

Custom hostname with re-encrypt termination:

```bash
helm install vm-migration oci://ghcr.io/mchenetz/charts/vm-migration-estimator \
  --set route.enabled=true \
  --set route.host=vm-migration.apps.cluster.example.com \
  --set route.termination=reencrypt
```

> **OpenShift SCC note**: The chart defaults omit `runAsUser` and `fsGroup` so that OpenShift's `restricted-v2` SCC automatically injects the namespace-allocated UID/GID. Do **not** set `podSecurityContext.runAsUser` or `podSecurityContext.fsGroup` when deploying on OpenShift unless you have bound an `anyuid` SCC to the service account.

---

### Connect to Infrastructure Platforms

Platform credentials are stored in a Kubernetes Secret. Pass them at install time:

#### VMware vCenter

```bash
helm install vm-migration oci://ghcr.io/mchenetz/charts/vm-migration-estimator \
  --set platforms.vmware.enabled=true \
  --set platforms.vmware.endpoint=https://vcenter.example.com \
  --set secrets.vmware.username=admin@vsphere.local \
  --set secrets.vmware.password=changeme
```

#### OpenShift (for MTV status discovery)

```bash
helm install vm-migration oci://ghcr.io/mchenetz/charts/vm-migration-estimator \
  --set platforms.openshift.enabled=true \
  --set platforms.openshift.endpoint=https://api.cluster.example.com:6443 \
  --set platforms.openshift.namespace=openshift-mtv \
  --set secrets.openshift.token=<bearer-token>
```

#### Pure Storage FlashArray

```bash
helm install vm-migration oci://ghcr.io/mchenetz/charts/vm-migration-estimator \
  --set platforms.flasharray.enabled=true \
  --set platforms.flasharray.endpoint=https://flasharray.example.com \
  --set secrets.flasharray.apiToken=<api-token>
```

#### All Platforms

```bash
helm install vm-migration oci://ghcr.io/mchenetz/charts/vm-migration-estimator \
  --set route.enabled=true \
  --set platforms.vmware.enabled=true \
  --set platforms.vmware.endpoint=https://vcenter.example.com \
  --set secrets.vmware.username=admin@vsphere.local \
  --set secrets.vmware.password=changeme \
  --set platforms.openshift.enabled=true \
  --set platforms.openshift.endpoint=https://api.cluster.example.com:6443 \
  --set secrets.openshift.token=<bearer-token> \
  --set platforms.flasharray.enabled=true \
  --set platforms.flasharray.endpoint=https://flasharray.example.com \
  --set secrets.flasharray.apiToken=<api-token>
```

#### Use an Existing Secret

If you manage secrets externally (Vault, SealedSecrets, ESO), create the secret yourself and reference it:

```bash
kubectl create secret generic my-migration-creds \
  --from-literal=VMWARE_USERNAME=admin@vsphere.local \
  --from-literal=VMWARE_PASSWORD=changeme \
  --from-literal=OPENSHIFT_TOKEN=<token> \
  --from-literal=FLASHARRAY_API_TOKEN=<token>

helm install vm-migration oci://ghcr.io/mchenetz/charts/vm-migration-estimator \
  --set secrets.create=false \
  --set secrets.existingSecret=my-migration-creds
```

---

### values.yaml Reference

| Key | Default | Description |
|-----|---------|-------------|
| `replicaCount` | `1` | Number of pod replicas |
| `image.repository` | `vm-migration-estimator` | Container image repository |
| `image.tag` | `""` | Image tag (defaults to chart appVersion) |
| `image.pullPolicy` | `IfNotPresent` | Image pull policy |
| `imagePullSecrets` | `[]` | Pull secrets for private registries |
| `service.type` | `ClusterIP` | Service type |
| `service.port` | `3001` | Service port |
| `ingress.enabled` | `false` | Enable Ingress |
| `ingress.className` | `""` | Ingress class name |
| `ingress.host` | `vm-migration.example.com` | Ingress hostname |
| `ingress.tls` | `[]` | TLS configuration |
| `route.enabled` | `false` | Enable OpenShift Route |
| `route.host` | `""` | Route hostname (auto-generated if empty) |
| `route.termination` | `edge` | TLS termination (`edge`, `passthrough`, `reencrypt`) |
| `route.insecureEdgeTerminationPolicy` | `Redirect` | Redirect HTTP to HTTPS |
| `resources.limits.cpu` | `500m` | CPU limit |
| `resources.limits.memory` | `512Mi` | Memory limit |
| `resources.requests.cpu` | `100m` | CPU request |
| `resources.requests.memory` | `128Mi` | Memory request |
| `autoscaling.enabled` | `false` | Enable HPA |
| `autoscaling.minReplicas` | `1` | Minimum replicas |
| `autoscaling.maxReplicas` | `5` | Maximum replicas |
| `autoscaling.targetCPUUtilization` | `80` | Target CPU % for scaling |
| `config.port` | `3001` | Application port |
| `config.nodeEnv` | `production` | Node environment |
| `config.logLevel` | `info` | Log level |
| `platforms.vmware.enabled` | `false` | Auto-connect to vCenter on startup |
| `platforms.vmware.endpoint` | `""` | vCenter URL |
| `platforms.openshift.enabled` | `false` | Auto-connect to OpenShift on startup |
| `platforms.openshift.endpoint` | `""` | OpenShift API URL |
| `platforms.openshift.namespace` | `openshift-mtv` | MTV namespace |
| `platforms.flasharray.enabled` | `false` | Auto-connect to FlashArray on startup |
| `platforms.flasharray.endpoint` | `""` | FlashArray management URL |
| `secrets.create` | `true` | Create credentials Secret |
| `secrets.existingSecret` | `""` | Use an existing Secret instead |
| `secrets.vmware.username` | `""` | vCenter username |
| `secrets.vmware.password` | `""` | vCenter password |
| `secrets.openshift.token` | `""` | OpenShift bearer token |
| `secrets.flasharray.apiToken` | `""` | FlashArray API token |
| `serviceAccount.create` | `true` | Create ServiceAccount |
| `podSecurityContext.runAsNonRoot` | `true` | Run as non-root |
| `nodeSelector` | `{}` | Node selector labels |
| `tolerations` | `[]` | Pod tolerations |
| `affinity` | `{}` | Pod affinity rules |

---

### Autoscaling

```bash
helm upgrade vm-migration oci://ghcr.io/mchenetz/charts/vm-migration-estimator \
  --set autoscaling.enabled=true \
  --set autoscaling.minReplicas=2 \
  --set autoscaling.maxReplicas=10 \
  --set autoscaling.targetCPUUtilization=70
```

### Upgrade

```bash
helm upgrade vm-migration oci://ghcr.io/mchenetz/charts/vm-migration-estimator \
  --version 1.1.0 \
  --reuse-values
```

To change a specific value during upgrade:

```bash
helm upgrade vm-migration oci://ghcr.io/mchenetz/charts/vm-migration-estimator \
  --reuse-values \
  --set replicaCount=3
```

### Uninstall

```bash
helm uninstall vm-migration
```

This removes all Kubernetes resources created by the chart. Persistent data is not created by this chart (stateless application).

---

## Getting Started (Development)

### Prerequisites
- Node.js 18+
- npm 9+

### Installation
```bash
git clone https://github.com/mchenetz/VM-Workload-Migration.git
cd VM-Workload-Migration
npm install
```

### Development
```bash
npm run dev
```
This starts both servers concurrently:
- **Frontend**: http://localhost:5173
- **API Server**: http://localhost:3001

### Production Build
```bash
npm run build
npm start
```

## Usage

1. **Quick Estimate**: Go to the Calculator page, enter VM count and total disk size, select a preset, and click "Estimate Migration Time"
2. **Connected Estimate**: Go to Configuration, connect your vCenter/OpenShift/FlashArray endpoints, then use the Discovery page to scan your environment and calculate real estimates
3. **Export**: After running a calculation, go to the Export page to generate a PDF report

The dashboard automatically updates to reflect your most recent calculation results.
