import { useEffect, useState } from 'react';

export type BanInfo = {
  reason: string | null;
  expiry: number;
};

/**
 * When the user is not in the group, check if they are banned from it.
 * Fetches /groups/bans/{groupId} and returns whether the current user's address
 * appears as offender in the list.
 */
export function useBannedFromGroup(
  groupId: number | null,
  userAddress: string | null,
  /** true only when user is confirmed not in the group */
  enabled: boolean
): { isBanned: boolean; banInfo: BanInfo | null; loading: boolean } {
  const [isBanned, setIsBanned] = useState(false);
  const [banInfo, setBanInfo] = useState<BanInfo | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled || groupId == null || !userAddress) {
      setIsBanned(false);
      setBanInfo(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        const res = await fetch(`/groups/bans/${groupId}`);
        if (!res.ok || cancelled) {
          if (!cancelled) {
            setIsBanned(false);
            setBanInfo(null);
          }
          return;
        }

        const list: Array<{
          groupId?: number;
          offender?: string;
          admin?: string;
          banned?: number;
          reason?: string | null;
          expiry?: number;
        }> = await res.json();

        if (!Array.isArray(list) || cancelled) {
          if (!cancelled) {
            setIsBanned(false);
            setBanInfo(null);
          }
          return;
        }

        const entry = list.find(
          (item) =>
            String(item.offender).toLowerCase() ===
            String(userAddress).toLowerCase()
        );

        if (!entry || cancelled) {
          if (!cancelled) {
            setIsBanned(false);
            setBanInfo(null);
          }
          return;
        }

        const reason =
          entry.reason != null && String(entry.reason).trim() !== ''
            ? String(entry.reason).trim()
            : null;
        const expiry = typeof entry.expiry === 'number' ? entry.expiry : 0;

        if (!cancelled) {
          setIsBanned(true);
          setBanInfo({ reason, expiry });
        }
      } catch {
        if (!cancelled) {
          setIsBanned(false);
          setBanInfo(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, groupId, userAddress]);

  return { isBanned, banInfo, loading };
}
