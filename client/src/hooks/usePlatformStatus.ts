import { useCallback, useEffect } from 'react';
import { useAppStore } from '../store';
import { getPlatformStatus } from '../api/platforms';

export function usePlatformStatus() {
  const setPlatforms = useAppStore((s) => s.setPlatforms);

  const refresh = useCallback(async () => {
    try {
      const platforms = await getPlatformStatus();
      setPlatforms(platforms);
    } catch {
      // Silently fail - platforms will show as disconnected
    }
  }, [setPlatforms]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { refresh };
}
