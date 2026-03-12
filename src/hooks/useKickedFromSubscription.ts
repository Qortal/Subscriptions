import { useEffect, useState } from 'react';

export type KickInfo = {
  kicked: true;
  reason: string | null;
} | { kicked: false };

/**
 * Only when the user is confirmed not in the group, check if they previously
 * participated (have a PRODUCT record) and were kicked. Uses PRODUCT resource
 * search for created/updated timestamp, then /groups/kicks with after= that
 * timestamp; takes the first kick and returns its reason for display.
 * Caller must pass enabled=true only when the user is known not to be in the group.
 */
export function useKickedFromSubscription(
  groupId: number | null,
  detailsIdentifier: string | null,
  userAddress: string | null,
  userName: string | null,
  /** true only when user is confirmed not in the group (do not run while membership is still loading) */
  enabled: boolean
): { kickInfo: KickInfo; loading: boolean } {
  const [kickInfo, setKickInfo] = useState<KickInfo>({ kicked: false });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (
      !enabled ||
      groupId == null ||
      !detailsIdentifier ||
      !userAddress ||
      !userName
    ) {
      setKickInfo({ kicked: false });
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        // 1. Search for PRODUCT resource for this user's subscription
        const searchUrl =
          `/arbitrary/resources/search?` +
          `service=PRODUCT&` +
          `identifier=${encodeURIComponent(detailsIdentifier)}&` +
          `name=${encodeURIComponent(userName)}&` +
          `exactmatchnames=true&` +
          `limit=1`;

        const searchRes = await fetch(searchUrl);
        if (!searchRes.ok || cancelled) {
          if (!cancelled) setKickInfo({ kicked: false });
          return;
        }

        const resources: Array<{ created?: number; updated?: number }> =
          await searchRes.json();
        if (
          !Array.isArray(resources) ||
          resources.length === 0 ||
          cancelled
        ) {
          if (!cancelled) setKickInfo({ kicked: false });
          return;
        }

        const product = resources[0];
        const created = product.created;
        const updated = product.updated;
        const createdMs =
          typeof created === 'number'
            ? created
            : created != null
              ? new Date(created).getTime()
              : 0;
        const updatedMs =
          typeof updated === 'number'
            ? updated
            : updated != null
              ? new Date(updated).getTime()
              : 0;
        const afterTimestamp = Math.max(createdMs, updatedMs) || createdMs || updatedMs;
        if (!afterTimestamp) {
          if (!cancelled) setKickInfo({ kicked: false });
          setLoading(false);
          return;
        }

        // 2. Fetch kicks for this user/group after that timestamp
        const kicksUrl =
          `/groups/kicks?` +
          `address=${encodeURIComponent(userAddress)}&` +
          `groupId=${groupId}&` +
          `limit=20&` +
          `reverse=true&` +
          `after=${afterTimestamp}`;

        const kicksRes = await fetch(kicksUrl);
        if (!kicksRes.ok || cancelled) {
          if (!cancelled) setKickInfo({ kicked: false });
          return;
        }

        const kicks: Array<{ reason?: string | null }> = await kicksRes.json();
        if (!Array.isArray(kicks) || kicks.length === 0 || cancelled) {
          if (!cancelled) setKickInfo({ kicked: false });
          return;
        }

        const first = kicks[0];
        const reason =
          first.reason != null && String(first.reason).trim() !== ''
            ? String(first.reason).trim()
            : null;

        if (!cancelled) {
          setKickInfo({ kicked: true, reason });
        }
      } catch {
        if (!cancelled) setKickInfo({ kicked: false });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    enabled,
    groupId,
    detailsIdentifier,
    userAddress,
    userName,
  ]);

  return { kickInfo, loading };
}
