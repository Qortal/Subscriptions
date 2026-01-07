import { useEffect } from 'react';
import { cleanupExpiredCache } from '../lib/pendingTransactionsCache';

/**
 * Hook to automatically clean up expired cache entries
 *
 * This hook runs periodically to remove expired cache entries.
 * Cache entries expire after 2 minutes, which is typically enough
 * time for blockchain transactions to confirm.
 */
export function useCacheCleanup() {
  useEffect(() => {
    // Run cleanup immediately on mount
    cleanupExpiredCache();

    // Set up periodic cleanup every 30 seconds to remove expired entries
    const interval = setInterval(() => {
      cleanupExpiredCache();
    }, 30000);

    return () => {
      clearInterval(interval);
    };
  }, []);
}
