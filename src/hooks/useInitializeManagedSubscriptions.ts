import { useEffect, useMemo, useRef, useState } from 'react';
import { useGlobal } from 'qapp-core';
import { useOwnedGroups } from './useOwnedGroups';
import {
  buildSubscriptionIdentifiers,
  getSubscriptionIdForGroup,
} from '../lib/subscriptionPublishing';
import { getPendingSubscription } from '../lib/pendingTransactionsCache';

function getGroupId(group: any): number | null {
  const id = group?.groupId;
  if (typeof id === 'number') return id;
  if (typeof id === 'string') return Number(id);
  return null;
}

export function useInitializeManagedSubscriptions(refreshKey = 0) {
  const { auth, identifierOperations, lists } = useGlobal();
  const {
    ownedGroups,
    loading: groupsLoading,
    error: groupsError,
  } = useOwnedGroups();

  const [managedSubscriptions, setManagedSubscriptions] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ownedGroupIdsKey = useMemo(
    () =>
      ownedGroups
        .map((g: any) => getGroupId(g))
        .filter((id): id is number => typeof id === 'number')
        .sort((a, b) => a - b)
        .join(','),
    [ownedGroups]
  );

  const lastRunKeyRef = useRef<string>('');

  useEffect(() => {
    let cancelled = false;

    async function run() {
      const ownerName = auth?.name;
      if (!ownerName) return;
      if (!identifierOperations) return;
      if (!lists) return;
      if (groupsLoading) return;

      // Only rerun when the inputs that affect membership change.
      const runKey = `${ownerName}|${ownedGroupIdsKey}|${refreshKey}`;
      if (lastRunKeyRef.current === runKey) return;
      lastRunKeyRef.current = runKey;

      setLoading(true);
      setError(null);

      try {
        const results = await Promise.all(
          ownedGroups.map(async (g) => {
            const groupId = getGroupId(g);
            if (groupId === null) return null;
            const subscriptionId = getSubscriptionIdForGroup(groupId);

            // Get the base identifier (without version) to use as prefix
            const { indexIdentifier: baseIndexIdentifier } =
              await buildSubscriptionIdentifiers(
                identifierOperations,
                subscriptionId
              );

            // Remove the 'v1' suffix to get the base for prefix search
            const baseIdentifierPrefix = baseIndexIdentifier.replace(
              /-v\d+$/,
              ''
            );

            // Fetch all versions, sorted by newest first
            const matches = await lists.fetchResourcesResultsOnly({
              identifier: baseIdentifierPrefix,
              service: 'DOCUMENT',
              name: ownerName,
              exactMatchNames: true,
              prefix: true,
              reverse: true,
              limit: 1,
            });

            // Check if we have a match and it has a version suffix
            if (!matches || matches.length === 0) {
              // Check pending cache for newly created subscriptions
              const pendingSubscription = getPendingSubscription(subscriptionId, ownerName);
              if (pendingSubscription) {
                // Return the group info for pending subscription
                let groupInfo;
                try {
                  const res = await fetch(`/groups/${groupId}`);
                  if (res.ok) {
                    const data = await res.json();
                    groupInfo = data;
                  }
                } catch {
                  console.error('Error fetching group', groupId);
                  return null;
                }
                return groupInfo;
              }
              return null;
            }

            const latestResource = matches[0];
            const latestIdentifier = latestResource?.identifier;

            // Validate that the identifier has a version suffix (-v1, -v2, -v3, etc.)
            if (!latestIdentifier || !/-v\d+$/.test(latestIdentifier)) {
              console.log(
                `No versioned subscription found for group ${groupId}`
              );
              return null;
            }

            let groupInfo;
            try {
              // Qortal UI proxy endpoint: returns group object including memberCount
              const res = await fetch(`/groups/${groupId}`);
              if (res.ok) {
                const data = await res.json();
                groupInfo = data;
              }
            } catch {
              console.error('Error fetching group', groupId);
              return null;
            }

            return groupInfo;
          })
        );

        const managed = results.filter(
          (g): g is NonNullable<typeof g> => g !== null
        );

        if (!cancelled) {
          setManagedSubscriptions(managed);
        }
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message ?? 'Failed to load managed subscriptions');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [
    auth?.name,
    groupsLoading,
    identifierOperations,
    lists,
    ownedGroupIdsKey,
    ownedGroups,
    refreshKey,
  ]);

  return {
    managedSubscriptions,
    loading: groupsLoading || loading,
    error: error ?? groupsError,
  };
}
