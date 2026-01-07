import { useEffect, useState } from 'react';
import { useGlobal } from 'qapp-core';
import { buildSubscriptionIdentifiers } from '../lib/subscriptionPublishing';

export type CurrentSubscriptionActions = {
  totalNeedingPayment: number;
  totalActions: number;
  subscriptionsWithActions: string[];
};

/**
 * Hook to check if any current subscriptions need payment
 * Does NOT consider grace period as acceptable - users should pay even if in grace
 */
export function useAllCurrentSubscriptionActions(currentSubscriptions: any[]) {
  const { auth, identifierOperations, lists } = useGlobal();
  const [aggregatedActions, setAggregatedActions] = useState<CurrentSubscriptionActions>({
    totalNeedingPayment: 0,
    totalActions: 0,
    subscriptionsWithActions: [],
  });

  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!currentSubscriptions || currentSubscriptions.length === 0 || !auth?.name || !identifierOperations || !lists?.fetchResourcesResultsOnly) {
      setAggregatedActions({
        totalNeedingPayment: 0,
        totalActions: 0,
        subscriptionsWithActions: [],
      });
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    async function checkPaymentStatus() {
      try {
        const results = await Promise.all(
          currentSubscriptions.map(async (subscription) => {
            const subscriptionId = subscription.id;
            if (!subscriptionId) return null;

            try {
              // Get the details identifier for payment checking
              const { detailsIdentifier } = await buildSubscriptionIdentifiers(
                identifierOperations!,
                subscriptionId
              );

              // Fetch the subscription details to get pricing info
              const detailsRes = await lists!.fetchResourcesResultsOnly({
                identifier: detailsIdentifier,
                service: 'DOCUMENT',
                name: subscription.ownerName,
                exactMatchNames: true,
                limit: 1,
              });

              if (!detailsRes || detailsRes.length === 0) return null;

              const details = detailsRes[0];
              const states = details?.states || [];
              if (states.length === 0) return null;

              // Get current pricing state
              const currentState = states[states.length - 1];
              const priceQort = currentState.price || 0;
              const intervalDays = currentState.interval === 'MONTHLY' ? 30 : 30;
              const graceDays = details.graceDays || 0;

              // Check for payment records (PRODUCT)
              const paymentRecords = await lists!.fetchResourcesResultsOnly({
                identifier: detailsIdentifier,
                service: 'PRODUCT',
                name: auth!.name,
                exactMatchNames: true,
                limit: 50, // Get recent payments
              });

              // Calculate if payment is needed
              let needsPayment = false;

              if (!paymentRecords || paymentRecords.length === 0) {
                // No payment records at all
                needsPayment = true;
              } else {
                // Find most recent valid payment
                const validPayments = paymentRecords
                  .filter((record: any) => {
                    // Check if payment amount matches price
                    const amountPaid = parseFloat(record.amount || '0');
                    return amountPaid >= priceQort;
                  })
                  .sort((a: any, b: any) => b.created - a.created);

                if (validPayments.length === 0) {
                  needsPayment = true;
                } else {
                  const lastPayment = validPayments[0];
                  const lastPaymentDate = lastPayment.created;
                  const now = Date.now();
                  const daysSincePayment = (now - lastPaymentDate) / (1000 * 60 * 60 * 24);

                  // Payment is needed if we're past the interval (not considering grace period)
                  if (daysSincePayment > intervalDays) {
                    needsPayment = true;
                  }
                }
              }

              return {
                subscriptionId,
                needsPayment,
              };
            } catch (error) {
              console.error(`Error checking payment for subscription ${subscriptionId}:`, error);
              return null;
            }
          })
        );

        if (!cancelled) {
          let totalNeedingPayment = 0;
          const subscriptionsNeedingPayment: string[] = [];

          results.forEach((result) => {
            if (result && result.needsPayment) {
              totalNeedingPayment += 1;
              subscriptionsNeedingPayment.push(result.subscriptionId);
            }
          });

          setAggregatedActions({
            totalNeedingPayment,
            totalActions: totalNeedingPayment,
            subscriptionsWithActions: subscriptionsNeedingPayment,
          });
          setLoading(false);
        }
      } catch (error) {
        console.error('Error checking current subscription payments:', error);
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    checkPaymentStatus();

    return () => {
      cancelled = true;
    };
  }, [currentSubscriptions, auth?.name, identifierOperations, lists]);

  return {
    actions: aggregatedActions,
    loading,
  };
}

