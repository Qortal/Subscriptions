import { useEffect, useState } from 'react';
import { parseOnChainIndexData } from '../lib/subscriptionPublishing';

export type SubscriptionIndexPrice = {
  priceQort: number;
  intervalDays: number;
};

/**
 * Fetches the subscription index DOCUMENT and returns parsed price/interval.
 * Use when validating payment (expected price from si) or for display.
 */
export async function fetchSubscriptionIndexPrice(
  ownerName: string,
  indexIdentifier: string
): Promise<{ priceQort: number; intervalDays: number } | null> {
  const res = await fetch(
    `/arbitrary/DOCUMENT/${encodeURIComponent(ownerName)}/${encodeURIComponent(indexIdentifier)}`
  );
  if (!res.ok) return null;
  let dataStr = await res.text();
  try {
    const parsed = JSON.parse(dataStr);
    if (parsed && typeof parsed === 'object') {
      const raw = parsed.resource?.data ?? parsed.data;
      if (raw != null) dataStr = typeof raw === 'string' ? raw : String(raw);
    }
  } catch {
    // not JSON
  }
  if (!dataStr.includes('|')) {
    try {
      dataStr = atob(dataStr);
    } catch {
      return null;
    }
  }
  return parseOnChainIndexData(dataStr);
}

/**
 * Fetches the subscription index (DOCUMENT) by identifier (si) and parses
 * price/interval. Use this to show locked-in price when the subscriber has
 * an existing PRODUCT record with si.
 */
export function useSubscriptionIndexPrice(
  ownerName: string | null,
  indexIdentifier: string | null,
  enabled = true
) {
  const [result, setResult] = useState<SubscriptionIndexPrice | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled || !ownerName || !indexIdentifier) {
      setResult(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    fetch(
      `/arbitrary/DOCUMENT/${encodeURIComponent(ownerName)}/${encodeURIComponent(indexIdentifier)}`
    )
      .then((res) => (res.ok ? res.text() : Promise.reject(new Error('Not found'))))
      .then((text) => {
        if (cancelled) return null;
        let dataStr = text;
        try {
          const parsed = JSON.parse(text);
          if (parsed && typeof parsed === 'object') {
            const raw =
              parsed.resource?.data ?? parsed.data;
            if (raw != null) dataStr = typeof raw === 'string' ? raw : String(raw);
          }
        } catch {
          // not JSON, use as-is
        }
        if (!dataStr.includes('|')) {
          try {
            dataStr = atob(dataStr);
          } catch {
            return null;
          }
        }
        return parseOnChainIndexData(dataStr);
      })
      .then((parsed) => {
        if (!cancelled && parsed) setResult(parsed);
      })
      .catch(() => {
        if (!cancelled) setResult(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, ownerName, indexIdentifier]);

  return { priceQort: result?.priceQort ?? null, intervalDays: result?.intervalDays ?? null, loading };
}
