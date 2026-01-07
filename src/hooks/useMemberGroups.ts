import { useEffect, useMemo, useState } from 'react';
import { useGlobal } from 'qapp-core';
import type { GroupAccessType, MemberGroup } from '../types/subscription';

type AnyGroup = Record<string, unknown>;

function coerceAccessType(group: AnyGroup): GroupAccessType | null {
  // We treat any non-open group as "private" for this app.
  const type = group.type;
  if (type === 1) return 'private';
  return null;
}

function getGroupId(group: AnyGroup): number | null {
  const id = group.groupId ?? group.id;
  if (typeof id === 'number') return id;
  if (typeof id === 'string' && /^\d+$/.test(id)) return Number(id);
  return null;
}

function getGroupName(group: AnyGroup): string {
  const name = group.groupName ?? group.name ?? group.group;
  if (typeof name === 'string' && name.trim()) return name;
  return 'Unnamed group';
}

function getGroupOwnerAddress(group: AnyGroup): string | null {
  const owner = group.owner ?? group.ownerAddress;
  if (typeof owner === 'string' && owner.trim()) return owner;
  return null;
}

export function useMemberGroups() {
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
        const privateGroups = (groupsArray as AnyGroup[]).filter(
          (g) => !(g as any).isOpen
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
        const id = getGroupId(g);
        const ownerAddress = getGroupOwnerAddress(g);
        if (id === null || ownerAddress === null) return null;
        const access = coerceAccessType(g) ?? 'private';
        return {
          id,
          name: getGroupName(g),
          access,
          ownerAddress,
          raw: g,
        } satisfies MemberGroup;
      })
      .filter(Boolean) as MemberGroup[];
  }, [rawGroups]);

  return { memberGroups, loading, error };
}
