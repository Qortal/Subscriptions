import { useEffect, useState } from 'react';
import type { Subscriber } from '../types/subscription';

export function useSubscribers(subscriptionId: string | null) {
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchSubscribers() {
      if (!subscriptionId) {
        setSubscribers([]);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        // In a real app, you would fetch this from QDN or on-chain data
        // For now, return empty array
        if (!cancelled) {
          setSubscribers([]);
        }
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message ?? 'Failed to load subscribers');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchSubscribers();
    return () => {
      cancelled = true;
    };
  }, [subscriptionId]);

  return { subscribers, loading, error };
}

