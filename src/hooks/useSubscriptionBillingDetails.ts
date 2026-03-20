import { useEffect, useState } from 'react';
import { usePublish } from 'qapp-core';
import type { SubscriptionFullDetails, SubscriptionState } from '../types/subscription';

export type SubscriptionBillingDetails = {
  intervalDays: number;
  graceDays: number;
  states?: SubscriptionState[];
  status?: 'active' | 'disabled';
};

/**
 * Fetches subscription billing details (intervalDays, graceDays, states)
 * for use with payment status / expiry calculations.
 */
export function useSubscriptionBillingDetails(
  ownerName: string | null,
  detailsIdentifier: string | null,
  enabled = true
) {
  const { fetchPublish } = usePublish(3, 'JSON');
  const [details, setDetails] = useState<SubscriptionBillingDetails | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled || !ownerName || !detailsIdentifier) {
      setDetails(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    fetchPublish({
      name: ownerName,
      service: 'DOCUMENT',
      identifier: detailsIdentifier,
    })
      .then((res) => {
        if (cancelled) return null;
        const data = res?.resource?.data as SubscriptionFullDetails | undefined;
        if (!data) return null;
        const anyDetails = data as any;
        return {
          intervalDays: 30,
          graceDays: typeof anyDetails.graceDays === 'number' ? anyDetails.graceDays : 3,
          states: Array.isArray(anyDetails.states) ? anyDetails.states : undefined,
          status: (anyDetails.status === 'disabled' ? 'disabled' : 'active') as 'active' | 'disabled',
        };
      })
      .then((d) => {
        if (!cancelled && d) setDetails(d);
      })
      .catch(() => {
        if (!cancelled) setDetails(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, ownerName, detailsIdentifier, fetchPublish]);

  return { details, loading };
}
