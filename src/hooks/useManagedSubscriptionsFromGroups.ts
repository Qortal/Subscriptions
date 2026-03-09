import { useEffect, useMemo, useRef, useState } from 'react';
import { useGlobal } from 'qapp-core';
import {
  buildSubscriptionIdentifiers,
  getSubscriptionIdForGroup,
} from '../lib/subscriptionPublishing';
import {
  base64ToUint8Array,
  getGroupAdmins,
  getGroupMembers,
} from './useValidateGroupKeys';

// ─── types ────────────────────────────────────────────────────────────────────

type GroupApiItem = {
  groupId: number;
  owner: string;
  groupName: string;
  memberCount: number;
  [key: string]: unknown;
};

export type ManagedSubscriptionActions = {
  groupId: number;
  pendingJoinRequests: number;
  needsReEncryption: boolean;
  totalActions: number;
};

export type ManagedSubscriptionEntry = {
  group: GroupApiItem;
  groupId: number;
  actions: ManagedSubscriptionActions;
};

// ─── hook ────────────────────────────────────────────────────────────────────

export function useManagedSubscriptionsFromGroups(
  address: string,
  name: string,
  groups: GroupApiItem[]
) {
  const { identifierOperations, lists } = useGlobal();

  const [managedSubscriptions, setManagedSubscriptions] = useState<
    ManagedSubscriptionEntry[]
  >([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const groupIdsKey = useMemo(
    () =>
      groups?.length > 0
        ? groups
            .map((g) => g.groupId)
            .sort((a, b) => a - b)
            .join(',')
        : '',
    [groups]
  );

  const lastRunKeyRef = useRef<string>('');

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!address || !name || !groups || groups.length === 0) return;
      if (!identifierOperations || !lists?.fetchResourcesResultsOnly) return;

      const runKey = `${address}|${groupIdsKey}`;
      if (lastRunKeyRef.current === runKey) return;
      lastRunKeyRef.current = runKey;

      setLoading(true);
      setError(null);

      try {
        const results = await Promise.all(
          groups
            .filter((g) => g.owner === address)
            .map(async (g): Promise<ManagedSubscriptionEntry | null> => {
              const groupId = g.groupId;

              try {
                const subscriptionId = getSubscriptionIdForGroup(groupId);
                const {
                  detailsIdentifier,
                  indexIdentifier: baseIndexIdentifier,
                } = await buildSubscriptionIdentifiers(
                  identifierOperations,
                  subscriptionId
                );

                // Confirm a versioned index exists (subscription is published)
                const baseIdentifierPrefix = baseIndexIdentifier.replace(
                  /-v\d+$/,
                  ''
                );
                const matches = await lists.fetchResourcesResultsOnly({
                  identifier: baseIdentifierPrefix,
                  service: 'DOCUMENT',
                  name,
                  exactMatchNames: true,
                  prefix: true,
                  reverse: true,
                  limit: 1,
                });

                if (!matches || matches.length === 0) return null;
                const latestIdentifier = matches[0]?.identifier;
                if (!latestIdentifier || !/-v\d+$/.test(latestIdentifier)) {
                  return null;
                }

                // ── join requests ─────────────────────────────────────────

                let validJoinRequestCount = 0;

                const joinRes = await fetch(`/groups/joinrequests/${groupId}`);
                if (joinRes.ok) {
                  const joinData = await joinRes.json();
                  const joinRequests: any[] = Array.isArray(joinData)
                    ? joinData
                    : [];

                  const validations = await Promise.all(
                    joinRequests.map(async (request) => {
                      try {
                        const nameRes = await fetch(
                          `/names/primary/${request.joiner}`
                        );
                        if (!nameRes.ok) return false;
                        const nameData = await nameRes.json();
                        const primaryName = nameData?.name;
                        if (!primaryName) return false;

                        const resources =
                          await lists.fetchResourcesResultsOnly({
                            identifier: detailsIdentifier,
                            service: 'PRODUCT',
                            name: primaryName,
                            exactMatchNames: true,
                            limit: 1,
                          });

                        return resources && resources.length > 0;
                      } catch {
                        return false;
                      }
                    })
                  );

                  validJoinRequestCount = validations.filter(Boolean).length;
                }

                // ── re-encryption check ───────────────────────────────────

                let needsReEncryption = false;

                try {
                  const memberData = await getGroupMembers(groupId);
                  const { names: adminNames } = await getGroupAdmins(groupId);

                  if (adminNames.length > 0) {
                    const queryString = adminNames
                      .map((n) => `name=${n}`)
                      .join('&');
                    const url = `/arbitrary/resources/searchsimple?mode=ALL&service=DOCUMENT_PRIVATE&identifier=symmetric-qchat-group-${groupId}&exactmatchnames=true&limit=0&reverse=true&${queryString}&prefix=true`;
                    const pubRes = await fetch(url);

                    if (!pubRes.ok) {
                      needsReEncryption = true;
                    } else {
                      const adminData = await pubRes.json();
                      const filterId = adminData.filter(
                        (d: any) =>
                          d.identifier === `symmetric-qchat-group-${groupId}`
                      );

                      if (!filterId || filterId.length === 0) {
                        needsReEncryption = true;
                      } else {
                        const sorted = filterId.sort((a: any, b: any) => {
                          const dateA = a.updated
                            ? new Date(a.updated)
                            : new Date(a.created);
                          const dateB = b.updated
                            ? new Date(b.updated)
                            : new Date(b.created);
                          return dateB.getTime() - dateA.getTime();
                        });
                        const publish = sorted[0];

                        const encRes = await fetch(
                          `/arbitrary/DOCUMENT_PRIVATE/${publish.name}/${publish.identifier}?encoding=base64`
                        );
                        const encData = await encRes.text();
                        const allCombined = base64ToUint8Array(encData);
                        const countStart = allCombined.length - 4;
                        const countArray = allCombined.slice(
                          countStart,
                          countStart + 4
                        );
                        const count = new Uint32Array(countArray.buffer)[0];

                        if (count !== memberData?.memberCount) {
                          needsReEncryption = true;
                        }
                      }
                    }
                  }
                } catch {
                  // silently fail — don't flag re-encryption on a network error
                }

                const actions: ManagedSubscriptionActions = {
                  groupId,
                  pendingJoinRequests: validJoinRequestCount,
                  needsReEncryption,
                  totalActions:
                    validJoinRequestCount + (needsReEncryption ? 1 : 0),
                };

                return { group: g, groupId, actions };
              } catch {
                return null;
              }
            })
        );

        const entries = results.filter(
          (r): r is ManagedSubscriptionEntry => r !== null
        );

        if (!cancelled) setManagedSubscriptions(entries);
      } catch (e: any) {
        if (!cancelled)
          setError(e?.message ?? 'Failed to load managed subscriptions');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [address, name, groupIdsKey, groups, identifierOperations, lists]);

  return { managedSubscriptions, loading, error };
}
