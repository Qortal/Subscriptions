import { useEffect, useState } from 'react';
import { useGlobal } from 'qapp-core';

type AnyGroup = Record<string, unknown>;

export function useOwnedGroups() {
  const { auth } = useGlobal();
  const [loading, setLoading] = useState(false);
  const [rawGroups, setRawGroups] = useState<AnyGroup[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        setError(null);

        // Matches example_app: Qortal UI proxy endpoint returning groups owned by address.
        const address = auth?.address;
        if (address) {
          try {
            const response = await fetch(`/groups/owner/${address}`);
            if (response.ok) {
              const data = await response.json();
              const groupsArray = Array.isArray(data)
                ? data
                : data.groups || [];
              const privateGroups = (groupsArray as AnyGroup[]).filter(
                (g) => !(g as any).isOpen
              );
              if (!cancelled) {
                setRawGroups(privateGroups);
              }
              return;
            }
            if (!cancelled) {
              if (response.status === 404) {
                setRawGroups([]);
                return;
              }
              setError(`Failed to load owned groups (${response.status})`);
              setRawGroups([]);
              return;
            }
          } catch {
            if (!cancelled) {
              setError('Failed to load owned groups');
              setRawGroups([]);
            }
            return;
          }
        }

        if (!cancelled) {
          setRawGroups([]);
          setError('No authenticated address available to load owned groups');
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? 'Failed to load groups');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [auth?.address]);

  // Return raw server payload (private groups only), unchanged.
  return { ownedGroups: rawGroups ?? [], loading, error };
}
