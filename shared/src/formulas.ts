export const FORMULA_DESCRIPTIONS = {
  network_copy: {
    name: 'Network Copy (VDDK)',
    steps: [
      'effective_size = total_disk_size_GB * (1 - compression_ratio)',
      'effective_bandwidth = network_Gbps * utilization * (1 - vddk_overhead) * 0.95',
      'bandwidth_bytes_per_sec = effective_bandwidth * 125,000,000',
      'per_transfer_bw = bandwidth_bytes_per_sec / concurrent_transfers',
      'transfer_time = (effective_size * 1,073,741,824) / per_transfer_bw',
    ],
    warmMigrationExtra: [
      'incremental_size = total_disk_GB * daily_change_rate * days',
      'incremental_time = (incremental_size * 1,073,741,824) / per_transfer_bw',
      'total_time = transfer_time + incremental_time',
    ],
  },
  xcopy: {
    name: 'XCopy (VAAI)',
    steps: [
      'array_speed_GBps = network_Gbps * xcopy_multiplier / 8',
      'copy_time = total_disk_size_GB / array_speed_GBps',
      'metadata_overhead = vm_count * 2 seconds',
      'total_time = copy_time + metadata_overhead',
    ],
  },
  flasharray_copy: {
    name: 'FlashArray Volume Copy',
    steps: [
      'snapshot_time = 1 second (constant)',
      'promotion_time = vm_count * 0.5 seconds',
      'total_time = snapshot_time + promotion_time',
    ],
    crossArrayExtra: [
      'replication_bw = array_bandwidth_GBps',
      'replication_time = total_disk_size_GB / replication_bw',
      'total_time += replication_time',
    ],
  },
};
