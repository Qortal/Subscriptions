import { useEffect, useMemo, useRef, useState } from 'react';
import { useGlobal, usePublish } from 'qapp-core';
import { useMemberGroups } from './useMemberGroups';
import { useJoinRequestGroups } from './useJoinRequestGroups';
import {
  buildSubscriptionIdentifiers,
  getSubscriptionIdForGroup,
} from '../lib/subscriptionPublishing';
import type { MySubscription } from '../types/subscription';
import type { SubscriptionFullDetails } from '../types/subscription';

function intervalDaysToBillingInterval(
  intervalDays: number
): 'daily' | 'monthly' | 'yearly' {
  if (intervalDays === 1) return 'daily';
  if (intervalDays >= 365) return 'yearly';
  return 'monthly';
}

function addDaysISO(days: number) {
  const ms = Math.max(0, days) * 24 * 60 * 60 * 1000;
  return new Date(Date.now() + ms).toISOString().slice(0, 10);
}

async function fetchPrimaryNameForAddress(ownerAddress: string) {
  const response = await fetch(`/names/primary/${ownerAddress}`);
  if (!response.ok) return null;
  const data = await response.json();
  const name = data?.name;
  return typeof name === 'string' && name.trim() ? name : null;
}

async function fetchGroupInfo(groupId: number) {
  const response = await fetch(`/groups/${groupId}`);
  if (!response.ok) return null;
  const data = await response.json();
  return data;
}

export function useInitializeMySubscriptions(refreshKey = 0) {
  const { auth, identifierOperations, lists } = useGlobal();
  const { fetchPublish } = usePublish(3, 'JSON');
  const {
    memberGroups,
    loading: groupsLoading,
    error: groupsError,
  } = useMemberGroups();
  
  const {
    joinRequestGroupIds,
    loading: joinRequestsLoading,
    error: joinRequestsError,
  } = useJoinRequestGroups();

  const [mySubscriptions, setMySubscriptions] = useState<MySubscription[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Cache primary names by owner address during session.
  const primaryNameCacheRef = useRef<Map<string, string | null>>(new Map());

  const groupIdsKey = useMemo(
    () =>
      memberGroups
        .map((g) => g.id)
        .sort((a, b) => a - b)
        .join(','),
    [memberGroups]
  );
  
  const joinRequestIdsKey = useMemo(
    () =>
      joinRequestGroupIds
        .sort((a, b) => a - b)
        .join(','),
    [joinRequestGroupIds]
  );

  const lastRunKeyRef = useRef<string>('');

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!auth?.address) return;
      if (!identifierOperations) return;
      if (!lists) return;
      if (groupsLoading || joinRequestsLoading) return;

      const runKey = `${auth.address}|${groupIdsKey}|${joinRequestIdsKey}|${refreshKey}`;
      if (lastRunKeyRef.current === runKey) return;
      lastRunKeyRef.current = runKey;

      setLoading(true);
      setError(null);

      try {
        // Process member groups (already in the group)
        // Filter out groups where the user is the owner - owners shouldn't see their own groups as subscriptions
        const memberResults = await Promise.all(
          memberGroups
            .filter((g) => g.ownerAddress !== auth.address)
            .map(async (g) => {
            // Resolve group owner primary name
            let ownerPrimaryName = primaryNameCacheRef.current.get(
              g.ownerAddress
            );
            if (ownerPrimaryName === undefined) {
              ownerPrimaryName = await fetchPrimaryNameForAddress(
                g.ownerAddress
              );
              primaryNameCacheRef.current.set(g.ownerAddress, ownerPrimaryName);
            }
            if (!ownerPrimaryName) return null;

            const subscriptionId = getSubscriptionIdForGroup(g.id);
            const { indexIdentifier, detailsIdentifier } =
              await buildSubscriptionIdentifiers(
                identifierOperations,
                subscriptionId
              );

            // Only show subscriptions where the owner has published the index resource.
            const matches = await lists.fetchResourcesResultsOnly({
              identifier: indexIdentifier,
              service: 'DOCUMENT',
              name: ownerPrimaryName,
              exactMatchNames: true,
              limit: 1,
            });
            if (!matches || matches.length === 0) return null;

            const detailsRes = await fetchPublish({
              name: ownerPrimaryName,
              service: 'DOCUMENT',
              identifier: detailsIdentifier,
            });
            const details = detailsRes?.resource?.data as
              | SubscriptionFullDetails
              | undefined;

            const anyDetails = details as any;
            const title =
              details && typeof anyDetails?.title === 'string'
                ? anyDetails.title
                : g.name;
            const amountQort =
              details && anyDetails?.amountQort != null
                ? Number(anyDetails.amountQort)
                : 1;
            const intervalDays =
              details && typeof anyDetails?.intervalDays === 'number'
                ? anyDetails.intervalDays
                : 30;

            const sub: MySubscription = {
              id: subscriptionId,
              title,
              ownerName: ownerPrimaryName,
              groupInfo: g,
              priceQort: Number.isFinite(amountQort) ? amountQort : 1,
              billingInterval: intervalDaysToBillingInterval(intervalDays),
              status: 'active',
              nextPaymentDue: addDaysISO(intervalDays),
            };

            return sub;
          })
        );

        // Process join request groups (pending approval)
        // Also filter out groups where the user is the owner
        const joinRequestResults = await Promise.all(
          joinRequestGroupIds.map(async (groupId) => {
            try {
              const groupInfo = await fetchGroupInfo(groupId);
              if (!groupInfo) return null;

              const ownerAddress = groupInfo.owner || groupInfo.ownerAddress;
              if (!ownerAddress) return null;

              // Skip if user is the owner of this group
              if (ownerAddress === auth.address) return null;

              let ownerPrimaryName = primaryNameCacheRef.current.get(ownerAddress);
              if (ownerPrimaryName === undefined) {
                ownerPrimaryName = await fetchPrimaryNameForAddress(ownerAddress);
                primaryNameCacheRef.current.set(ownerAddress, ownerPrimaryName);
              }
              if (!ownerPrimaryName) return null;

              const subscriptionId = getSubscriptionIdForGroup(groupId);
              const { indexIdentifier, detailsIdentifier } =
                await buildSubscriptionIdentifiers(
                  identifierOperations,
                  subscriptionId
                );

              // Only show subscriptions where the owner has published the index resource.
              const matches = await lists.fetchResourcesResultsOnly({
                identifier: indexIdentifier,
                service: 'DOCUMENT',
                name: ownerPrimaryName,
                exactMatchNames: true,
                limit: 1,
              });
              if (!matches || matches.length === 0) return null;

              const detailsRes = await fetchPublish({
                name: ownerPrimaryName,
                service: 'DOCUMENT',
                identifier: detailsIdentifier,
              });
              const details = detailsRes?.resource?.data as
                | SubscriptionFullDetails
                | undefined;

              const anyDetails = details as any;
              const title =
                details && typeof anyDetails?.title === 'string'
                  ? anyDetails.title
                  : groupInfo.groupName || groupInfo.name || 'Unnamed Group';
              const amountQort =
                details && anyDetails?.amountQort != null
                  ? Number(anyDetails.amountQort)
                  : 1;
              const intervalDays =
                details && typeof anyDetails?.intervalDays === 'number'
                  ? anyDetails.intervalDays
                  : 30;

              const sub: MySubscription = {
                id: subscriptionId,
                title,
                ownerName: ownerPrimaryName,
                groupInfo: { ...groupInfo, id: groupId, isPending: true },
                priceQort: Number.isFinite(amountQort) ? amountQort : 1,
                billingInterval: intervalDaysToBillingInterval(intervalDays),
                status: 'paused', // Use 'paused' status for pending approval
                nextPaymentDue: addDaysISO(intervalDays),
              };

              return sub;
            } catch (e) {
              return null;
            }
          })
        );

        const allResults = [...memberResults, ...joinRequestResults];
        const mySubs = allResults.filter(Boolean) as MySubscription[];

        if (!cancelled) setMySubscriptions(mySubs);
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? 'Failed to load subscriptions');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [
    auth?.address,
    fetchPublish,
    groupIdsKey,
    joinRequestIdsKey,
    groupsLoading,
    joinRequestsLoading,
    identifierOperations,
    lists,
    memberGroups,
    joinRequestGroupIds,
    refreshKey,
  ]);

  return {
    mySubscriptions,
    loading: groupsLoading || joinRequestsLoading || loading,
    error: error ?? groupsError ?? joinRequestsError,
  };
}
