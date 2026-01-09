import { useEffect, useState } from 'react';
import { useGlobal } from 'qapp-core';
import { buildSubscriptionIdentifiers } from '../lib/subscriptionPublishing';

export type CurrentSubscriptionActions = {
  totalNeedingPayment: number;
  totalActions: number;
  subscriptionsWithActions: string[];
};

export type SubscriptionState = {
  version: number;
  price: number;
  interval: 'DAY' | 'WEEK' | 'MONTH' | 'YEAR';
  effectiveFrom: number;
};

/**
 * Get the price that was active at a given timestamp
 */
function getPriceAtTime(
  states: SubscriptionState[] | undefined,
  timestamp: number,
  currentPrice: number
): number {
  if (!states || states.length === 0) {
    return currentPrice;
  }

  const sortedStates = [...states].sort(
    (a, b) => a.effectiveFrom - b.effectiveFrom
  );

  for (let i = sortedStates.length - 1; i >= 0; i--) {
    if (sortedStates[i].effectiveFrom <= timestamp) {
      return sortedStates[i].price;
    }
  }

  return sortedStates[0]?.price ?? currentPrice;
}

/**
 * Get the interval (in days) that was active at a given timestamp
 */
function getIntervalDaysAtTime(
  states: SubscriptionState[] | undefined,
  timestamp: number,
  currentIntervalDays: number
): number {
  if (!states || states.length === 0) {
    return currentIntervalDays;
  }

  const sortedStates = [...states].sort(
    (a, b) => a.effectiveFrom - b.effectiveFrom
  );

  for (let i = sortedStates.length - 1; i >= 0; i--) {
    if (sortedStates[i].effectiveFrom <= timestamp) {
      const interval = sortedStates[i].interval;
      switch (interval) {
        case 'DAY':
          return 1;
        case 'WEEK':
          return 7;
        case 'MONTH':
          return 30;
        case 'YEAR':
          return 365;
        default:
          return currentIntervalDays;
      }
    }
  }

  return currentIntervalDays;
}

/**
 * Hook to check if any current subscriptions need payment
 * Does NOT consider grace period as acceptable - users should pay even if in grace
 */
export function useAllCurrentSubscriptionActions(currentSubscriptions: any[]) {
  const { auth, identifierOperations, lists } = useGlobal();
  const [aggregatedActions, setAggregatedActions] =
    useState<CurrentSubscriptionActions>({
      totalNeedingPayment: 0,
      totalActions: 0,
      subscriptionsWithActions: [],
    });

  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (
      !currentSubscriptions ||
      currentSubscriptions.length === 0 ||
      !auth?.name ||
      !identifierOperations ||
      !lists?.fetchResourcesResultsOnly
    ) {
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

              const details = detailsRes[0] as any;
              const states = details?.states || [];
              if (states.length === 0) return null;

              // Get current pricing state (used as fallback)
              const currentState = states[states.length - 1];
              const currentPrice = currentState.price || 0;
              const currentIntervalDays =
                currentState.interval === 'DAY'
                  ? 1
                  : currentState.interval === 'WEEK'
                    ? 7
                    : currentState.interval === 'YEAR'
                      ? 365
                      : 30;

              // Check for payment records (PRODUCT)
              const paymentRecords = await lists!.fetchResourcesResultsOnly({
                identifier: detailsIdentifier,
                service: 'PRODUCT',
                name: auth!.name || undefined,
                exactMatchNames: true,
                limit: 50, // Get recent payments
              });

              // Calculate if payment is needed
              let needsPayment = false;

              if (!paymentRecords || paymentRecords.length === 0) {
                // No payment records at all
                needsPayment = true;
              } else {
                // Check each payment record with historical pricing
                let hasValidPayment = false;

                // Sort by most recent first
                const sortedPayments = [...paymentRecords].sort(
                  (a: any, b: any) => (b.created || 0) - (a.created || 0)
                );

                for (const record of sortedPayments) {
                  const paymentTimestamp = (record as any).created;
                  // Payment records from PRODUCT service contain transaction data
                  // We need to fetch the actual data from the record
                  let recordData: any = null;

                  try {
                    // The record might have data already, or we need to fetch it
                    if ((record as any).data) {
                      recordData = (record as any).data;
                    } else if ((record as any).identifier) {
                      // Fetch the data if not included
                      const dataResponse = await fetch(
                        `/arbitrary/PRODUCT/${auth!.name}/${(record as any).identifier}`
                      );
                      if (dataResponse.ok) {
                        recordData = await dataResponse.json();
                      }
                    }
                  } catch (error) {
                    console.error('Error fetching payment record data:', error);
                    continue;
                  }

                  if (!recordData || !recordData.tx) {
                    continue;
                  }

                  // Fetch the actual transaction to get amount and timestamp
                  try {
                    const txResponse = await fetch(
                      `/transactions/signature/${recordData.tx}`
                    );

                    if (!txResponse.ok) {
                      continue;
                    }

                    const txData = await txResponse.json();
                    const actualPaymentTimestamp =
                      txData?.timestamp || paymentTimestamp;
                    const amountPaid = parseFloat(txData?.amount || '0');

                    if (!actualPaymentTimestamp || amountPaid <= 0) {
                      continue;
                    }

                    // Get the price that was active when they paid
                    const expectedPrice = getPriceAtTime(
                      states,
                      actualPaymentTimestamp,
                      currentPrice
                    );

                    // Check if payment amount matches the historical price
                    if (amountPaid >= expectedPrice - 0.00001) {
                      // Valid payment found - check if it's still current
                      const intervalDaysAtPayment = getIntervalDaysAtTime(
                        states,
                        actualPaymentTimestamp,
                        currentIntervalDays
                      );

                      const now = Date.now();
                      const daysSincePayment =
                        (now - actualPaymentTimestamp) / (1000 * 60 * 60 * 24);

                      // Payment is valid if we're still within the interval
                      // Note: Does NOT consider grace period (per hook design)
                      if (daysSincePayment <= intervalDaysAtPayment) {
                        hasValidPayment = true;
                        break;
                      }
                    }
                  } catch (error) {
                    console.error(
                      'Error validating payment transaction:',
                      error
                    );
                    continue;
                  }
                }

                needsPayment = !hasValidPayment;
              }

              return {
                subscriptionId,
                needsPayment,
              };
            } catch (error) {
              console.error(
                `Error checking payment for subscription ${subscriptionId}:`,
                error
              );
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
