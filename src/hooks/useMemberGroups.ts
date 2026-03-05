import { useEffect, useMemo, useState } from 'react';
import { useGlobal } from 'qapp-core';
import type { GroupAccessType, GroupApiItem, MemberGroup } from '../types/subscription';

function coerceAccessType(group: GroupApiItem): GroupAccessType | null {
  // We treat any non-open group as "private" for this app.
  const type = group.type;
  if (type === 1) return 'private';
  return null;
}

export function useMemberGroups() {
  const { auth } = useGlobal();
  const [loading, setLoading] = useState(false);
  const [rawGroups, setRawGroups] = useState<GroupApiItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        setError(null);

        const address = auth?.address;
        if (!address) {
          if (!cancelled) {
            setRawGroups([]);
            setError('No authenticated address available to load groups');
          }
          return;
        }

        const response = await fetch(`/groups/member/${address}`);
        if (!response.ok) {
          if (!cancelled) {
            if (response.status === 404) {
              setRawGroups([]);
              return;
            }
            setError(`Failed to load groups (${response.status})`);
            setRawGroups([]);
          }
          return;
        }

        const data = await response.json();
        const groupsArray = Array.isArray(data) ? data : data.groups || [];
        const privateGroups = (groupsArray as GroupApiItem[]).filter(
          (g) => !g.isOpen
        );
        if (!cancelled) setRawGroups(privateGroups);
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message ?? 'Failed to load groups');
          setRawGroups([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [auth?.address]);

  const memberGroups = useMemo<MemberGroup[]>(() => {
    if (!rawGroups) return [];

    return rawGroups
      .map((g) => {
        const access = coerceAccessType(g) ?? 'private';
        return {
          id: g.groupId,
          name: g.groupName,
          access,
          ownerAddress: g.owner,
          ownerPrimaryName: g.ownerPrimaryName ?? null,
          raw: g as MemberGroup['raw'],
        } satisfies MemberGroup;
      })
      .filter(Boolean) as MemberGroup[];
  }, [rawGroups]);

  return { memberGroups, loading, error };
}
