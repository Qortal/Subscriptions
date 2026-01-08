import { useEffect, useMemo, useState } from 'react';
import { useAtomValue } from 'jotai';
import { useGlobal, usePublish } from 'qapp-core';
import { useGroupJoinRequests } from './useGroupJoinRequests';
import { useGroupMembers } from './useGroupMembers';
import { useValidateGroupKeys } from './useValidateGroupKeys';
import { useValidateJoinRequests } from './useValidateJoinRequests';
import { useSubscriberPaymentStatus } from './useSubscriberPaymentStatus';
import { buildSubscriptionIdentifiers, getSubscriptionIdForGroup } from '../lib/subscriptionPublishing';
import { pendingOwnerActionsAtom } from '../lib/pendingTransactionsCache';

export type SubscriptionActions = {
  groupId: number;
  pendingJoinRequests: number;
  needsReEncryption: boolean;
  unpaidMembersCount: number;
  totalActions: number;
};

/**
 * Hook to check for pending actions on a single managed subscription
 * Only counts VALID join requests (those that have published payment records)
 * Also tracks unpaid members count
 */
export function useManagedSubscriptionActions(groupId: number | null) {
  const { auth, identifierOperations } = useGlobal();
  const { fetchPublish } = usePublish(3, 'JSON');
  const { joinRequests, loading: joinRequestsLoading } = useGroupJoinRequests(groupId);
  const { members, loading: membersLoading } = useGroupMembers(groupId, 100);
  const pendingOwnerActions = useAtomValue(pendingOwnerActionsAtom);
  
  const shouldReEncrypt = useValidateGroupKeys(groupId ?? 0);
  
  const [detailsIdentifier, setDetailsIdentifier] = useState<string | null>(null);
  const [priceQort, setPriceQort] = useState<number>(1);
  const [intervalDays, setIntervalDays] = useState<number>(30);
  const [graceDays, setGraceDays] = useState<number>(3);

  // Get the details identifier and pricing info
  useEffect(() => {
    if (!groupId || !auth?.name || !identifierOperations) {
      setDetailsIdentifier(null);
      return;
    }

    async function fetchDetailsAndPricing() {
      try {
        const subscriptionId = getSubscriptionIdForGroup(groupId!);
        const { detailsIdentifier: identifier } = await buildSubscriptionIdentifiers(
          identifierOperations!,
          subscriptionId
        );
        setDetailsIdentifier(identifier);

        // Fetch subscription details to get pricing
        const detailsRes = await fetchPublish({
          name: auth!.name!,
          service: 'DOCUMENT',
          identifier,
        });

        const details = detailsRes?.resource?.data as any;
        if (details) {
          if (details.states && details.states.length > 0) {
            const currentState = details.states[details.states.length - 1];
            setPriceQort(currentState.price || 1);
            setIntervalDays(currentState.interval === 'MONTHLY' ? 30 : 30);
          } else if (details.amountQort) {
            setPriceQort(Number(details.amountQort));
          }
          if (typeof details.graceDays === 'number') {
            setGraceDays(details.graceDays);
          }
        }
      } catch (error) {
        console.error('Failed to build subscription identifiers:', error);
        setDetailsIdentifier(null);
      }
    }

    fetchDetailsAndPricing();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId, auth?.name, identifierOperations]);

  // Get join request addresses
  const joinRequesterAddresses = useMemo(
    () => joinRequests.map((jr) => jr.joiner),
    [joinRequests]
  );

  // Get member addresses (excluding owner and pending kicks)
  const memberAddresses = useMemo(
    () => members
      .filter((m) => {
        if (m.member === auth?.address) return false;
        
        // Check if there's a pending kick for this member
        const pendingKick = pendingOwnerActions.find(
          (action) =>
            action.type === 'kick' &&
            action.groupId === groupId &&
            action.kickedAddress === m.member &&
            action.expiresAt > Date.now()
        );
        
        return !pendingKick;
      })
      .map((m) => m.member),
    [members, auth?.address, pendingOwnerActions, groupId]
  );

  // Validate join requests
  const { validations, loading: validatingJoinRequests } = useValidateJoinRequests(
    joinRequesterAddresses,
    detailsIdentifier
  );

  // Check payment status for members
  const subscriptionStates = undefined; // We'll rely on the hook to fetch payment records
  const {
    isPaid,
    loading: paymentsLoading,
  } = useSubscriberPaymentStatus(
    memberAddresses,
    detailsIdentifier,
    auth?.address ?? null,
    priceQort,
    subscriptionStates,
    intervalDays,
    graceDays,
    true // excludeOwner
  );
  
  const [actions, setActions] = useState<SubscriptionActions>({
    groupId: groupId ?? 0,
    pendingJoinRequests: 0,
    needsReEncryption: false,
    unpaidMembersCount: 0,
    totalActions: 0,
  });

  useEffect(() => {
    if (groupId === null) {
      setActions({
        groupId: 0,
        pendingJoinRequests: 0,
        needsReEncryption: false,
        unpaidMembersCount: 0,
        totalActions: 0,
      });
      return;
    }

    // Only count VALID join requests (those with payment records)
    const validJoinRequestCount = joinRequests.filter((jr) => {
      const validation = validations.get(jr.joiner);
      return validation?.isValid === true;
    }).length;

    // Count unpaid members (excluding those in grace period)
    const unpaidCount = memberAddresses.filter((address) => !isPaid(address)).length;

    const needsEncryption = shouldReEncrypt;
    const total = validJoinRequestCount + (needsEncryption ? 1 : 0);

    setActions({
      groupId,
      pendingJoinRequests: validJoinRequestCount,
      needsReEncryption: needsEncryption,
      unpaidMembersCount: unpaidCount,
      totalActions: total,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId, joinRequests, validations, shouldReEncrypt, memberAddresses, paymentsLoading]);

  return {
    actions,
    loading: joinRequestsLoading || validatingJoinRequests || membersLoading || paymentsLoading,
  };
}

