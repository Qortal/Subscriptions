import { useEffect, useState } from 'react';
import { useGlobal } from 'qapp-core';
import { getPendingSubscribeActionByGroup } from '../lib/pendingTransactionsCache';
import { fetchSubscriptionIndexPrice } from './useSubscriptionIndexPrice';

export type SubscriptionStatus =
  | 'not-subscribed'
  | 'subscribed-paid'
  | 'subscribed-unpaid';

/**
 * Hook to check if the current user is already subscribed to a subscription
 * and whether they've made payment
 *
 * Subscription flow:
 * 1. User sends payment
 * 2. User requests to join group
 * 3. Group owner approves join request (user becomes member)
 * 4. User publishes subscription record
 *
 * This hook checks:
 * - Group membership (indicates join request was approved)
 * - Payment record (PRODUCT resource with payment signature)
 */
export function useCheckSubscriptionStatus(
  groupId: number | null,
  detailsIdentifier: string | null,
  enabled = true,
  refreshKey = 0,
  /** Grace period in days after subscription ends; used for expiry when validating payment (default 0) */
  graceDays = 0
) {
  const { auth, lists } = useGlobal();
  const [status, setStatus] = useState<SubscriptionStatus>('not-subscribed');
  const [loading, setLoading] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  /** When user has a payment record, their locked-in subscription index (si from PRODUCT) for renewals */
  const [
    existingSubscriptionIndexIdentifier,
    setExistingSubscriptionIndexIdentifier,
  ] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || groupId === null || !auth?.address) {
      setStatus('not-subscribed');
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function checkSubscriptionStatus() {
      setLoading(true);
      setExistingSubscriptionIndexIdentifier(null);

      try {
        // First, check if there's a pending subscribe action in cache
        const pendingAction =
          auth?.address && groupId !== null
            ? getPendingSubscribeActionByGroup(auth.address, groupId)
            : null;

        // If user has just completed a subscription (all steps done), treat as subscribed
        if (
          pendingAction &&
          pendingAction.paymentTxSignature &&
          pendingAction.recordPublished
        ) {
          if (!cancelled) {
            setIsOwner(false);
            setStatus('subscribed-paid');
            setLoading(false);
          }
          return;
        }

        // First, fetch group info to check if user is the owner (and for payment validation later)
        let groupData: {
          owner?: string;
          ownerAddress?: string;
          ownerPrimaryName?: string;
        } | null = null;
        let groupOwner: string | undefined;
        const groupResponse = await fetch(`/groups/${groupId}`);
        if (groupResponse.ok) {
          groupData = await groupResponse.json();
          groupOwner = groupData?.owner || groupData?.ownerAddress;

          // If user is the owner, they shouldn't be treated as a subscriber
          if (groupOwner === auth.address) {
            if (!cancelled) {
              setIsOwner(true);
              setStatus('not-subscribed');
              setLoading(false);
            }
            return;
          }
        }

        // User is not the owner, proceed with normal subscription check
        // First, check if user is a member of the group
        // Note: User becomes a member only after the join request is approved by group owner
        const response = await fetch(`/groups/member/${auth.address}`);

        if (!response.ok) {
          if (!cancelled) {
            setStatus('not-subscribed');
            setLoading(false);
          }
          return;
        }

        const groups = await response.json();

        // Check if the target groupId is in the user's groups
        // If user sent a join request but it hasn't been approved yet, they won't be a member
        const isMember =
          Array.isArray(groups) &&
          groups.some((group: any) => group.groupId === groupId);

        if (!isMember) {
          if (!cancelled) {
            setStatus('not-subscribed');
            setLoading(false);
          }
          return;
        }

        // User is a member (join request was approved), now check if they have a payment record
        if (
          !detailsIdentifier ||
          !auth.name ||
          !lists.fetchResourcesResultsOnly
        ) {
          if (!cancelled) {
            setStatus('subscribed-unpaid');
            setLoading(false);
          }
          return;
        }

        // Check for PRODUCT record (payment proof) – get most recent
        const resources = await lists.fetchResourcesResultsOnly({
          identifier: detailsIdentifier,
          service: 'PRODUCT',
          name: auth.name,
          exactMatchNames: true,
          limit: 1,
          prefix: true,
          reverse: true,
        });

        const hasPaymentRecord = resources && resources.length > 0;

        // If they have a payment record, fetch PRODUCT data and validate like useSubscriberPaymentStatus
        let existingIndex: string | null = null;
        let paymentValid = false;
        let intervalDaysAtPayment: number = 30; // fallback
        let paymentTimestamp: number | undefined;

        if (hasPaymentRecord && detailsIdentifier && auth.name) {
          try {
            const dataResponse = await fetch(
              `/arbitrary/PRODUCT/${encodeURIComponent(auth.name)}/${encodeURIComponent(detailsIdentifier)}`
            );
            if (dataResponse.ok) {
              const recordData = await dataResponse.json();
              console.log('recordData', recordData);
              if (recordData && typeof recordData.si === 'string') {
                existingIndex = recordData.si;
              }
              // Validate payment tx and amount/expiry same as useSubscriberPaymentStatus
              const subscriptionOwnerAddress = groupOwner;
              const subscriptionOwnerName = groupData?.ownerPrimaryName;
              const paymentTxSignature =
                recordData && typeof recordData.tx === 'string'
                  ? recordData.tx
                  : undefined;

              if (
                paymentTxSignature &&
                subscriptionOwnerAddress &&
                subscriptionOwnerName
              ) {
                try {
                  const txResponse = await fetch(
                    `/transactions/signature/${paymentTxSignature}`
                  );
                  if (txResponse.ok) {
                    const txData = await txResponse.json();
                    console.log('txData', txData);
                    paymentTimestamp = txData?.timestamp;

                    const typeOk =
                      txData?.type === 'PAYMENT' || txData?.type === 2;
                    const recipientOk =
                      txData?.recipient === subscriptionOwnerAddress;

                    if (typeOk && recipientOk && paymentTimestamp != null) {
                      const indexData = await fetchSubscriptionIndexPrice(
                        subscriptionOwnerName,
                        recordData.si
                      );
                      const expectedPrice = indexData?.priceQort ?? null;
                      intervalDaysAtPayment =
                        indexData?.intervalDays ?? intervalDaysAtPayment;
                      console.log(
                        'expectedPrice',
                        expectedPrice,
                        txData?.amount
                      );
                      if (
                        expectedPrice != null &&
                        +(txData?.amount ?? 0) >= expectedPrice - 0.00001
                      ) {
                        paymentValid = true;
                      }
                    }
                  }
                } catch {
                  // validation failed, paymentValid stays false
                }
              }
            }
          } catch {
            // Non-fatal: we still have hasPaymentRecord, just no locked-in index for renewal
          }
        }
        console.log('paymentValid', paymentValid);
        if (!cancelled) {
          setExistingSubscriptionIndexIdentifier(existingIndex);

          // If no payment record on blockchain but we have a pending action with payment, treat as paid
          if (
            !hasPaymentRecord &&
            pendingAction &&
            pendingAction.paymentTxSignature
          ) {
            setStatus('subscribed-paid');
          } else if (
            hasPaymentRecord &&
            paymentValid &&
            paymentTimestamp != null
          ) {
            // Same expiry/grace logic as useSubscriberPaymentStatus
            const subscriptionEndsAt =
              paymentTimestamp + intervalDaysAtPayment * 24 * 60 * 60 * 1000;
            console.log('subscriptionEndsAt', subscriptionEndsAt);
            const now = Date.now();
            if (now < subscriptionEndsAt) {
              setStatus('subscribed-paid');
            } else {
              setStatus('subscribed-unpaid'); // expired beyond grace
            }
          } else {
            setStatus('subscribed-unpaid');
          }
          setLoading(false);
        }
      } catch (error) {
        console.error('Failed to check subscription status:', error);
        if (!cancelled) {
          setStatus('not-subscribed');
          setLoading(false);
        }
      }
    }

    checkSubscriptionStatus();

    return () => {
      cancelled = true;
    };
  }, [
    groupId,
    detailsIdentifier,
    auth?.address,
    auth?.name,
    enabled,
    lists,
    refreshKey,
    graceDays,
  ]);

  return {
    status,
    loading,
    isSubscribed: status !== 'not-subscribed',
    needsPayment: status === 'subscribed-unpaid',
    isOwner, // Expose whether the current user is the group owner
    /** When set, use this for publish (renewal); otherwise use latest index (new subscriber) */
    existingSubscriptionIndexIdentifier,
  };
}
