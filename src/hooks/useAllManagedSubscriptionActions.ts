import { useEffect, useState } from 'react';
import { useAtomValue } from 'jotai';
import { useGlobal } from 'qapp-core';
import { buildSubscriptionIdentifiers, getSubscriptionIdForGroup } from '../lib/subscriptionPublishing';
import { pendingOwnerActionsAtom } from '../lib/pendingTransactionsCache';
import { base64ToUint8Array, getGroupAdmins, getGroupMembers } from './useValidateGroupKeys';

type AnyGroup = Record<string, unknown>;

function getGroupId(group: AnyGroup): number | null {
  const id = group?.groupId;
  if (typeof id === 'number') return id;
  if (typeof id === 'string') return Number(id);
  return null;
}

export type AllSubscriptionActions = {
  totalPendingJoinRequests: number;
  totalNeedingReEncryption: number;
  totalActions: number;
  groupsWithActions: number[];
};

/**
 * Hook to aggregate pending actions across all managed subscriptions
 * Only counts VALID join requests (those with payment records)
 * Filters out join requests that have pending invites in the cache
 */
export function useAllManagedSubscriptionActions(managedSubscriptions: AnyGroup[]) {
  const { auth, identifierOperations, lists } = useGlobal();
  const pendingOwnerActions = useAtomValue(pendingOwnerActionsAtom);
  
  const [aggregatedActions, setAggregatedActions] = useState<AllSubscriptionActions>({
    totalPendingJoinRequests: 0,
    totalNeedingReEncryption: 0,
    totalActions: 0,
    groupsWithActions: [],
  });

  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!managedSubscriptions || managedSubscriptions.length === 0 || !auth?.name || !identifierOperations || !lists?.fetchResourcesResultsOnly) {
      setAggregatedActions({
        totalPendingJoinRequests: 0,
        totalNeedingReEncryption: 0,
        totalActions: 0,
        groupsWithActions: [],
      });
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    async function aggregateActions() {
      try {
        let totalJoinRequests = 0;
        let totalReEncryption = 0;
        const groupsNeedingAttention: number[] = [];

        const results = await Promise.all(
          managedSubscriptions.map(async (group) => {
            const groupId = getGroupId(group);
            if (groupId === null) return null;

            try {
              // Get the details identifier for this subscription
              const subscriptionId = getSubscriptionIdForGroup(groupId);
              const { detailsIdentifier } = await buildSubscriptionIdentifiers(
                identifierOperations!,
                subscriptionId
              );

              // Fetch join requests
              const joinRes = await fetch(`/groups/joinrequests/${groupId}`);
              let validJoinRequestCount = 0;
              
              if (joinRes.ok) {
                const joinData = await joinRes.json();
                const joinRequests = Array.isArray(joinData) ? joinData : [];

                // Filter out join requests with pending invites
                const filteredJoinRequests = joinRequests.filter((request: any) => {
                  const pendingInvite = pendingOwnerActions.find(
                    (action) =>
                      action.type === 'invite' &&
                      action.groupId === groupId &&
                      action.inviteeAddress === request.joiner &&
                      action.expiresAt > Date.now()
                  );
                  return !pendingInvite;
                });

                // Validate each remaining join request
                const validations = await Promise.all(
                  filteredJoinRequests.map(async (request: any) => {
                    try {
                      const address = request.joiner;
                      
                      // Get primary name for the address
                      const nameRes = await fetch(`/names/primary/${address}`);
                      if (!nameRes.ok) return false;
                      
                      const nameData = await nameRes.json();
                      const primaryName = nameData?.name;
                      if (!primaryName) return false;

                      // Check for PRODUCT record (payment proof)
                      const resources = await lists!.fetchResourcesResultsOnly({
                        identifier: detailsIdentifier,
                        service: 'PRODUCT',
                        name: primaryName,
                        exactMatchNames: true,
                        limit: 1,
                      });

                      return resources && resources.length > 0;
                    } catch (error) {
                      console.error('Error validating join request:', error);
                      return false;
                    }
                  })
                );

                // Count only valid join requests
                validJoinRequestCount = validations.filter(Boolean).length;
              }

              // Check if group needs re-encryption
              let needsReEncryption = false;
              
              // First check if there's a valid pending re-encrypt action
              const pendingReEncrypt = pendingOwnerActions.find(
                (action) =>
                  action.type === 're-encrypt' &&
                  action.groupId === groupId &&
                  action.expiresAt > Date.now()
              );

              if (!pendingReEncrypt) {
                // No pending re-encrypt, so check if group actually needs it
                try {
                  const memberData = await getGroupMembers(groupId);
                  const { names } = await getGroupAdmins(groupId);

                  if (names.length > 0) {
                    const getPublishesFromAdmins = async (admins: string[], gId: number) => {
                      const queryString = admins.map((name) => `name=${name}`).join('&');
                      const url = `/arbitrary/resources/searchsimple?mode=ALL&service=DOCUMENT_PRIVATE&identifier=symmetric-qchat-group-${gId}&exactmatchnames=true&limit=0&reverse=true&${queryString}&prefix=true`;
                      const response = await fetch(url);
                      if (!response.ok) return false;
                      const adminData = await response.json();
                      const filterId = adminData.filter(
                        (data: any) => data.identifier === `symmetric-qchat-group-${gId}`
                      );
                      if (filterId?.length === 0) return false;
                      const sortedData = filterId.sort((a: any, b: any) => {
                        const dateA = a.updated ? new Date(a.updated) : new Date(a.created);
                        const dateB = b.updated ? new Date(b.updated) : new Date(b.created);
                        return dateB.getTime() - dateA.getTime();
                      });
                      return sortedData[0];
                    };

                    const publish = await getPublishesFromAdmins(names, groupId);
                    
                    if (publish === false) {
                      // No encryption keys found, needs re-encryption
                      needsReEncryption = true;
                    } else {
                      // Check if member count matches
                      const res = await fetch(
                        `/arbitrary/DOCUMENT_PRIVATE/${publish.name}/${publish.identifier}?encoding=base64`
                      );
                      const data = await res.text();
                      const allCombined = base64ToUint8Array(data);
                      const countStartPosition = allCombined.length - 4;
                      const countArray = allCombined.slice(countStartPosition, countStartPosition + 4);
                      const count = new Uint32Array(countArray.buffer)[0];

                      if (count !== memberData?.memberCount) {
                        needsReEncryption = true;
                      }
                    }
                  }
                } catch (error) {
                  // Silently fail - don't count as needing re-encryption if we can't check
                  console.error('Error checking re-encryption status:', error);
                }
              }
              // If pendingReEncrypt exists and is valid, needsReEncryption stays false

              return {
                groupId,
                joinRequests: validJoinRequestCount,
                needsReEncryption,
                hasActions: validJoinRequestCount > 0 || needsReEncryption,
              };
            } catch (error) {
              console.error(`Error checking actions for group ${groupId}:`, error);
              return null;
            }
          })
        );

        if (!cancelled) {
          results.forEach((result) => {
            if (result) {
              totalJoinRequests += result.joinRequests;
              if (result.needsReEncryption) {
                totalReEncryption += 1;
              }
              if (result.hasActions) {
                groupsNeedingAttention.push(result.groupId);
              }
            }
          });

          setAggregatedActions({
            totalPendingJoinRequests: totalJoinRequests,
            totalNeedingReEncryption: totalReEncryption,
            totalActions: totalJoinRequests + totalReEncryption,
            groupsWithActions: groupsNeedingAttention,
          });
          setLoading(false);
        }
      } catch (error) {
        console.error('Error aggregating subscription actions:', error);
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    aggregateActions();

    return () => {
      cancelled = true;
    };
  }, [managedSubscriptions, auth?.name, identifierOperations, lists, pendingOwnerActions]);

  return {
    actions: aggregatedActions,
    loading,
  };
}

