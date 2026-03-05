import { useEffect, useState } from 'react';
import { useGlobal } from 'qapp-core';
import { fetchSubscriptionIndexPrice } from './useSubscriptionIndexPrice';

export type SubscriptionRecord = {
  si: string; // subscriptionIndexIdentifier
  tx: string; // paymentTxSignature
};

export type PaymentStatus = 'paid' | 'grace' | 'unpaid' | 'checking';

export type SubscriberPaymentInfo = {
  address: string;
  status: PaymentStatus;
  lastPaymentTx?: string;
  lastPaymentDate?: number;
  subscriptionRecord?: SubscriptionRecord;
  expiresAt?: number; // When the paid period ends (excludes grace period)
};

export type SubscriptionState = {
  version: number;
  price: number;
  interval: 'HOUR' | 'DAY' | 'WEEK' | 'MONTH' | 'YEAR';
  effectiveFrom: number; // Unix timestamp in milliseconds
};

export type SubscriberItem = {
  address: string;
  primaryName: string | null;
};

/**
 * Get the price that was active at a given timestamp
 */
export function getPriceAtTime(
  states: SubscriptionState[] | undefined,
  timestamp: number,
  currentPrice: number
): number {
  if (!states || states.length === 0) {
    return currentPrice;
  }

  // Sort states by effectiveFrom (oldest to newest)
  const sortedStates = [...states].sort(
    (a, b) => a.effectiveFrom - b.effectiveFrom
  );

  // Find the state that was active at the payment time
  // Start from the end and work backwards to find the first state that was effective before the timestamp
  for (let i = sortedStates.length - 1; i >= 0; i--) {
    if (sortedStates[i].effectiveFrom <= timestamp) {
      return sortedStates[i].price;
    }
  }

  // If no state found (payment before any state), use the earliest price
  return sortedStates[0]?.price ?? currentPrice;
}

/**
 * Get the interval (in days) that was active at a given timestamp
 */
function _getIntervalDaysAtTime(
  states: SubscriptionState[] | undefined,
  timestamp: number,
  currentIntervalDays: number
): number {
  if (!states || states.length === 0) {
    return currentIntervalDays;
  }

  // Sort states by effectiveFrom (oldest to newest)
  const sortedStates = [...states].sort(
    (a, b) => a.effectiveFrom - b.effectiveFrom
  );

  // Find the state that was active at the payment time
  // Start from the end and work backwards to find the first state that was effective before the timestamp
  for (let i = sortedStates.length - 1; i >= 0; i--) {
    if (sortedStates[i].effectiveFrom <= timestamp) {
      const interval = sortedStates[i].interval;
      // Convert interval enum to days
      switch (interval) {
        case 'HOUR':
          return 1 / 24;
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

  // If no state found (payment before any state), use current interval
  return currentIntervalDays;
}
void _getIntervalDaysAtTime;

/**
 * Hook to check payment status for subscribers
 * Fetches PRODUCT service records for each subscriber to validate payments
 * Validates: transaction exists, amount matches historical price, recipient is correct, subscription not expired
 */
export function useSubscriberPaymentStatus(
  subscribers: SubscriberItem[],
  detailsIdentifier: string | null,
  subscriptionOwnerAddress: string | null,
  subscriptionOwnerName: string | null,
  subscriptionPrice: number,
  subscriptionStates: SubscriptionState[] | undefined,
  intervalDays: number,
  graceDays: number,
  enabled = true
) {
  const { lists } = useGlobal();
  const [paymentInfo, setPaymentInfo] = useState<
    Map<string, SubscriberPaymentInfo>
  >(new Map());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (
      !enabled ||
      !detailsIdentifier ||
      !subscriptionOwnerAddress ||
      !subscriptionOwnerName ||
      subscribers.length === 0
    ) {
      setPaymentInfo(new Map());
      return;
    }

    let cancelled = false;

    async function checkSubscriberPayments() {
      setLoading(true);
      const newPaymentInfo = new Map<string, SubscriberPaymentInfo>();

      const subscribersExcludingOwner = subscribers.filter(
        (s) => s.address !== subscriptionOwnerAddress
      );

      for (const s of subscribersExcludingOwner) {
        newPaymentInfo.set(s.address, {
          address: s.address,
          status: 'checking',
        });
      }

      if (!cancelled) {
        setPaymentInfo(new Map(newPaymentInfo));
      }

      const results = await Promise.allSettled(
        subscribersExcludingOwner.map(async (s) => {
          const address = s.address;
          const subscriberName = s.primaryName;

          try {
            let intervalDaysAtPayment: number = intervalDays;

            if (!subscriberName) {
              return {
                address,
                status: 'unpaid' as PaymentStatus,
              };
            }

            // Fetch PRODUCT service records
            if (!lists.fetchResourcesResultsOnly) {
              return {
                address,
                status: 'unpaid' as PaymentStatus,
              };
            }

            const resources = await lists.fetchResourcesResultsOnly({
              identifier: detailsIdentifier!,
              service: 'PRODUCT',
              name: subscriberName,
              exactMatchNames: true,
              limit: 1,
              reverse: true, // Get most recent
            });
            console.log('resources', resources);
            if (!resources || resources.length === 0) {
              return {
                address,
                status: 'unpaid' as PaymentStatus,
              };
            }

            // Fetch and parse the subscription record
            let recordData: any = null;
            try {
              const dataResponse = await fetch(
                `/arbitrary/PRODUCT/${subscriberName}/${detailsIdentifier}`
              );
              if (dataResponse.ok) {
                recordData = await dataResponse.json();
              }
            } catch (error) {
              console.error(
                `Failed to fetch subscription record for ${subscriberName}:`,
                error
              );
            }
            console.log('recordData', recordData);
            if (!recordData || !recordData.tx) {
              return {
                address,
                status: 'unpaid' as PaymentStatus,
              };
            }

            // Validate the payment transaction exists, amount, and recipient
            const paymentTxSignature = recordData.tx;
            let paymentValid = false;
            let paymentTimestamp: number | undefined;
            let validationError: string | null = null;

            try {
              const txResponse = await fetch(
                `/transactions/signature/${paymentTxSignature}`
              );
              if (!txResponse.ok) {
                validationError = 'Transaction not found';
              } else {
                const txData = await txResponse.json();
                paymentTimestamp = txData?.timestamp;

                // Validate transaction type is PAYMENT
                if (txData?.type !== 'PAYMENT') {
                  validationError = `Invalid transaction type: ${txData?.type}`;
                }
                // Validate recipient is the subscription owner
                else if (txData?.recipient !== subscriptionOwnerAddress) {
                  validationError = `Payment sent to wrong address: ${txData?.recipient}`;
                }
                // Validate amount matches the price that was active at payment time
                else if (paymentTimestamp) {
                  console.log(
                    'subscriptionOwnerName',
                    subscriptionOwnerName,
                    recordData.si
                  );
                  const indexData = await fetchSubscriptionIndexPrice(
                    subscriptionOwnerName!,
                    recordData.si
                  );
                  const expectedPrice = indexData?.priceQort ?? null;
                  intervalDaysAtPayment =
                    indexData?.intervalDays ?? intervalDays;

                  if (expectedPrice == null) {
                    validationError = 'Could not get price at time of payment';
                  } else if (+txData?.amount >= expectedPrice - 0.00001) {
                    paymentValid = true;
                  } else {
                    validationError = `Payment amount ${txData?.amount} doesn't match expected price ${expectedPrice} (price at time of payment: ${new Date(paymentTimestamp).toLocaleDateString()})`;
                  }
                } else {
                  validationError = 'Payment timestamp missing';
                }
              }
            } catch (error) {
              console.error(
                `Failed to validate payment transaction ${paymentTxSignature}:`,
                error
              );
              validationError = 'Failed to fetch transaction';
            }

            if (validationError) {
              console.warn(
                `Payment validation failed for ${subscriberName}: ${validationError}`
              );
            }

            // If payment is valid, check if subscription has expired
            let finalStatus: PaymentStatus = 'unpaid';
            let expiresAt: number | undefined;

            if (paymentValid && paymentTimestamp) {
              const subscriptionEndsAt =
                paymentTimestamp + intervalDaysAtPayment * 24 * 60 * 60 * 1000;
              const graceEndsAt =
                subscriptionEndsAt + graceDays * 24 * 60 * 60 * 1000;
              expiresAt = subscriptionEndsAt;

              const now = Date.now();

              if (now < subscriptionEndsAt) {
                // Within subscription period
                finalStatus = 'paid';
              } else if (now < graceEndsAt) {
                // In grace period
                finalStatus = 'grace';
              } else {
                // Expired (beyond grace period)
                finalStatus = 'unpaid';
              }
            }

            return {
              address,
              status: finalStatus,
              lastPaymentTx: paymentTxSignature,
              lastPaymentDate: paymentTimestamp,
              subscriptionRecord: recordData,
              expiresAt,
            };
          } catch (error) {
            console.error(
              `Failed to check payment status for ${address}:`,
              error
            );
            return {
              address,
              status: 'unpaid' as PaymentStatus,
            };
          }
        })
      );

      results.forEach((result, index) => {
        const { address } = subscribersExcludingOwner[index];
        if (result.status === 'fulfilled') {
          newPaymentInfo.set(address, result.value);
        } else {
          newPaymentInfo.set(address, {
            address,
            status: 'unpaid',
          });
        }
      });

      if (!cancelled) {
        setPaymentInfo(newPaymentInfo);
        setLoading(false);
      }
    }

    checkSubscriberPayments();

    return () => {
      cancelled = true;
    };
  }, [
    subscribers.map((s) => `${s.address}:${s.primaryName}`).join(','),
    detailsIdentifier,
    subscriptionOwnerAddress,
    subscriptionOwnerName,
    subscriptionPrice,
    subscriptionStates,
    intervalDays,
    graceDays,
    enabled,
    lists,
  ]);

  return {
    paymentInfo,
    loading,
    getStatus: (address: string): PaymentStatus => {
      return paymentInfo.get(address)?.status ?? 'checking';
    },
    isPaid: (address: string): boolean => {
      const status = paymentInfo.get(address)?.status;
      return status === 'paid' || status === 'grace';
    },
    isInGracePeriod: (address: string): boolean => {
      return paymentInfo.get(address)?.status === 'grace';
    },
  };
}
