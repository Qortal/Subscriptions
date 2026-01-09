import { useEffect, useState } from 'react';
import { useGlobal } from 'qapp-core';

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
  expiresAt?: number; // When the subscription expires (including grace period)
};

export type SubscriptionState = {
  version: number;
  price: number;
  interval: 'DAY' | 'WEEK' | 'MONTH' | 'YEAR';
  effectiveFrom: number; // Unix timestamp in milliseconds
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
function getIntervalDaysAtTime(
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

/**
 * Hook to check payment status for subscribers
 * Fetches PRODUCT service records for each subscriber to validate payments
 * Validates: transaction exists, amount matches historical price, recipient is correct, subscription not expired
 */
export function useSubscriberPaymentStatus(
  subscribers: string[], // Array of subscriber addresses
  detailsIdentifier: string | null, // The subscription details identifier
  subscriptionOwnerAddress: string | null, // The subscription owner's address
  subscriptionPrice: number, // The current subscription price in QORT
  subscriptionStates: SubscriptionState[] | undefined, // Historical pricing states
  intervalDays: number, // Subscription interval in days
  graceDays: number, // Grace period in days
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
      subscribers.length === 0
    ) {
      setPaymentInfo(new Map());
      return;
    }

    let cancelled = false;

    async function checkSubscriberPayments() {
      setLoading(true);
      const newPaymentInfo = new Map<string, SubscriberPaymentInfo>();

      // Filter out the owner from subscribers - owner doesn't need to pay
      const subscribersExcludingOwner = subscribers.filter(
        (address) => address !== subscriptionOwnerAddress
      );

      // Initialize all subscribers (excluding owner) as checking
      for (const address of subscribersExcludingOwner) {
        newPaymentInfo.set(address, {
          address,
          status: 'checking',
        });
      }

      if (!cancelled) {
        setPaymentInfo(new Map(newPaymentInfo));
      }

      // Fetch payment records for each subscriber (excluding owner)
      const results = await Promise.allSettled(
        subscribersExcludingOwner.map(async (address) => {
          try {
            // Fetch the subscriber's PRODUCT records with this identifier
            // We need to get their primary name first to search by name
            const nameResponse = await fetch(`/names/primary/${address}`);
            let subscriberName: string | null = null;

            if (nameResponse.ok) {
              const nameData = await nameResponse.json();
              subscriberName = nameData?.name ?? null;
            }

            if (!subscriberName) {
              // No registered name, can't have published a subscription record
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
                  const expectedPrice = getPriceAtTime(
                    subscriptionStates,
                    paymentTimestamp,
                    subscriptionPrice
                  );

                  if (Math.abs(txData?.amount - expectedPrice) > 0.00001) {
                    validationError = `Payment amount ${txData?.amount} doesn't match expected price ${expectedPrice} (price at time of payment: ${new Date(paymentTimestamp).toLocaleDateString()})`;
                  } else {
                    // All validations passed
                    paymentValid = true;
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
              // Get the interval that was active when they paid
              const intervalDaysAtPayment = getIntervalDaysAtTime(
                subscriptionStates,
                paymentTimestamp,
                intervalDays
              );

              // Calculate when the subscription expires (payment date + historical interval + grace period)
              const subscriptionEndsAt =
                paymentTimestamp + intervalDaysAtPayment * 24 * 60 * 60 * 1000;
              const graceEndsAt =
                subscriptionEndsAt + graceDays * 24 * 60 * 60 * 1000;
              expiresAt = graceEndsAt;

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

      // Update payment info with results
      results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          newPaymentInfo.set(subscribersExcludingOwner[index], result.value);
        } else {
          newPaymentInfo.set(subscribersExcludingOwner[index], {
            address: subscribersExcludingOwner[index],
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
    subscribers.join(','),
    detailsIdentifier,
    subscriptionOwnerAddress,
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
