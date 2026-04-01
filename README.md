# VM Workload Migration Time Estimator

A full-stack tool for estimating VM migration times when using **OpenShift Migration Toolkit for Virtualization (MTV/Forklift)** to migrate workloads from VMware vSphere. Compares three transfer methods side-by-side and recommends the optimal approach based on your infrastructure.

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

### FlashArray Volume Copy
Pure Storage FlashArray volume-level clone using array-native snapshots. Creates near-instantaneous copies regardless of data size by leveraging copy-on-write metadata operations rather than moving actual data blocks.

**Formula:**
```
time = 1s snapshot + (vm_count * 0.5s promotion)
```

Requires source VMs on FlashArray-backed datastores and Pure CSI driver on the target OpenShift cluster.

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

## Getting Started

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
