import type {
  VM,
  Datastore,
  StorageClass,
  CompatibilityResult,
} from '@vm-migration/shared';

export function detectCompatibility(
  vms: VM[],
  datastores: Datastore[],
  storageClasses: StorageClass[],
): CompatibilityResult[] {
  const datastoreMap = new Map(datastores.map((ds) => [ds.name, ds]));

  const hasPureProvisioner = storageClasses.some((sc) =>
    sc.provisioner.toLowerCase().includes('pure'),
  );

  return vms.map((vm) => {
    const datastore = datastoreMap.get(vm.datastoreName);

    // Network copy (VDDK) is always available
    const networkCopy = true;

    // XCOPY requires VAAI-capable datastore
    let xcopy = false;
    let xcopyReason: string | undefined;

    if (!datastore) {
      xcopyReason = `Datastore "${vm.datastoreName}" not found; cannot determine VAAI capability`;
    } else if (!datastore.isVAAICapable) {
      xcopyReason = `Datastore "${datastore.name}" is not VAAI-capable (type: ${datastore.type})`;
    } else {
      xcopy = true;
    }

    // FlashArray copy requires FlashArray-backed datastore AND a Pure storage class in OpenShift
    let flasharrayCopy = false;
    let flasharrayReason: string | undefined;

    if (!datastore) {
      flasharrayReason = `Datastore "${vm.datastoreName}" not found; cannot determine FlashArray backing`;
    } else if (!datastore.isFlashArrayBacked) {
      flasharrayReason = `Datastore "${datastore.name}" is not backed by a FlashArray`;
    } else if (!hasPureProvisioner) {
      flasharrayReason = 'No storage class with a Pure Storage provisioner found in the OpenShift cluster';
    } else {
      flasharrayCopy = true;
    }

    return {
      vmId: vm.id,
      vmName: vm.name,
      networkCopy,
      xcopy,
      ...(xcopyReason ? { xcopyReason } : {}),
      flasharrayCopy,
      ...(flasharrayReason ? { flasharrayReason } : {}),
    };
  });
}
