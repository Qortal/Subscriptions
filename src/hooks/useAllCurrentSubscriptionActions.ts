import { useEffect, useState } from 'react';
import { useGlobal } from 'qapp-core';
import { buildSubscriptionIdentifiers } from '../lib/subscriptionPublishing';
import { fetchSubscriptionIndexPrice } from './useSubscriptionIndexPrice';
import type { BillingInterval } from '../types/subscription';
import {
  getPaidIntervalsFromAmount,
  isMultipleOfUnitPrice,
} from '../lib/resolvePaymentIndexIdentifier';

/** Normalize PRODUCT record so we have { si?, tx } even when API returns base64 or wrapper */
function parseProductRecordData(raw: any): { si?: string; tx: string } | null {
  if (!raw) return null;
  if (typeof raw.tx === 'string') {
    return { si: typeof raw.si === 'string' ? raw.si : undefined, tx: raw.tx };
  }
  const b64 = raw.data ?? raw.resource?.data;
  if (typeof b64 === 'string') {
    try {
      const decoded = JSON.parse(atob(b64)) as { si?: string; tx?: string };
      if (decoded && typeof decoded.tx === 'string') {
        return {
          si: typeof decoded.si === 'string' ? decoded.si : undefined,
          tx: decoded.tx,
        };
      }
    } catch {
      // ignore
    }
  }
  return null;
}

export type CurrentSubscriptionActions = {
  totalNeedingPayment: number;
  totalActions: number;
  subscriptionsWithActions: string[];
  /** Locked-in price/interval from subscriber's PRODUCT (si) for display on cards */
  subscriptionDisplayOverrides: Record<
    string,
    { priceQort: number; billingInterval: BillingInterval }
  >;
  /** Next due (subscription end) timestamp in ms for "X mins/hours/days left" */
  subscriptionExpiresAt: Record<string, number>;
  /** Locked-in index identifier (si) from subscriber's PRODUCT record, used for renewals */
  subscriptionPaymentIndexIdentifier: Record<string, string>;
};

function intervalDaysToBillingInterval(intervalDays: number): BillingInterval {
  if (intervalDays < 0.1) return 'hourly';
  if (intervalDays === 1) return 'daily';
  if (intervalDays >= 365) return 'yearly';
  return 'monthly';
}

export type SubscriptionState = {
  version: number;
  price: number;
  interval: 'HOUR' | 'DAY' | 'WEEK' | 'MONTH' | 'YEAR';
  effectiveFrom: number;
};

/**
 * Hook to check if any current subscriptions need payment.
 * Validates payment amount and period; uses index (si) from PRODUCT for expected price/interval when present.
 */
export function useAllCurrentSubscriptionActions(currentSubscriptions: any[]) {
  const { auth, identifierOperations, lists } = useGlobal();
  const [aggregatedActions, setAggregatedActions] =
    useState<CurrentSubscriptionActions>({
      totalNeedingPayment: 0,
      totalActions: 0,
      subscriptionsWithActions: [],
      subscriptionDisplayOverrides: {},
      subscriptionExpiresAt: {},
      subscriptionPaymentIndexIdentifier: {},
    });

  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const hasSubscriptions =
      currentSubscriptions && currentSubscriptions.length > 0;
    if (
      !hasSubscriptions ||
      !auth?.name ||
      !identifierOperations ||
      !lists?.fetchResourcesResultsOnly
    ) {
      // Only wipe existing results when subscriptions are genuinely gone.
      // If deps like auth/identifierOperations are briefly unavailable during a
      // re-fetch, keep the previous state so the UI doesn't flash or shift.
      if (!hasSubscriptions) {
        setAggregatedActions({
          totalNeedingPayment: 0,
          totalActions: 0,
          subscriptionsWithActions: [],
          subscriptionDisplayOverrides: {},
          subscriptionExpiresAt: {},
          subscriptionPaymentIndexIdentifier: {},
        });
      }
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
              const { detailsIdentifier } = await buildSubscriptionIdentifiers(
                identifierOperations!,
                subscriptionId
              );

              const paymentRecords = await lists!.fetchResourcesResultsOnly({
                identifier: detailsIdentifier,
                service: 'PRODUCT',
                name: auth!.name || undefined,
                exactMatchNames: true,
                reverse: true,
                prefix: true,
                limit: 1,
              });
              console.log('paymentRecords', paymentRecords);
              let needsPayment = false;
              let displayOverride: {
                priceQort: number;
                billingInterval: BillingInterval;
              } | null = null;
              let expiresAt: number | undefined;
              let paymentIndexIdentifier: string | undefined;

              if (paymentRecords && paymentRecords.length > 0) {
                const record = paymentRecords[0];
                let recordData: any = null;
                try {
                  if ((record as any).data) {
                    recordData = (record as any).data;
                  } else if ((record as any).identifier) {
                    const dataResponse = await fetch(
                      `/arbitrary/PRODUCT/${auth!.name}/${(record as any).identifier}`
                    );
                    if (dataResponse.ok) recordData = await dataResponse.json();
                  }
                } catch (error) {
                  console.error('Error fetching payment record data:', error);
                  // TODO: Handle error
                }

                const parsed = parseProductRecordData(recordData);
                console.log('parsed', parsed);
                if (parsed) recordData = parsed;
                if (parsed?.si) paymentIndexIdentifier = parsed.si;
                if (!recordData || !recordData.tx) needsPayment = true;

                try {
                  const txResponse = await fetch(
                    `/transactions/signature/${recordData.tx}`
                  );
                  if (!txResponse.ok) needsPayment = true;

                  const txData = await txResponse.json();
                  const paymentTs = txData?.timestamp;
                  const amountPaid = parseFloat(txData?.amount || '0');
                  console.log('amountPaid', amountPaid);
                  if (paymentTs == null || amountPaid <= 0) needsPayment = true;
                  console.log('paymentTs', paymentTs, amountPaid);
                  let expectedPrice: number;
                  let intervalDaysAtPayment: number;
                  let paidIntervals = 1;

                  if (
                    recordData.si &&
                    typeof recordData.si === 'string' &&
                    subscription.ownerName
                  ) {
                    const indexData = await fetchSubscriptionIndexPrice(
                      subscription.ownerName,
                      recordData.si
                    );
                    console.log('indexData', indexData);
                    if (indexData) {
                      expectedPrice = indexData.priceQort;
                      intervalDaysAtPayment = indexData.intervalDays;
                      if (!displayOverride) {
                        displayOverride = {
                          priceQort: indexData.priceQort,
                          billingInterval: intervalDaysToBillingInterval(
                            indexData.intervalDays
                          ),
                        };
                      }
                    } else {
                      // TODO: Handle error
                      return;
                    }
                  } else {
                    // TODO: Handle error
                    return;
                  }
                  console.log(
                    'expectedPrice',
                    expectedPrice,
                    amountPaid,
                    intervalDaysAtPayment
                  );
                  if (!isMultipleOfUnitPrice(amountPaid, expectedPrice)) {
                    needsPayment = true;
                  } else {
                    paidIntervals = getPaidIntervalsFromAmount(
                      amountPaid,
                      expectedPrice
                    );
                  }

                  const subscriptionEndsAt =
                    paymentTs +
                    paidIntervals * intervalDaysAtPayment * 24 * 60 * 60 * 1000;
                  expiresAt = subscriptionEndsAt;
                  const now = Date.now();

                  if (now <= subscriptionEndsAt && !needsPayment) {
                    needsPayment = false;
                  } else {
                    needsPayment = true;
                  }
                } catch (error) {
                  console.error('Error validating payment transaction:', error);
                }
              }

              return {
                subscriptionId,
                needsPayment,
                displayOverride,
                expiresAt,
                paymentIndexIdentifier,
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
          const subscriptionDisplayOverrides: Record<
            string,
            { priceQort: number; billingInterval: BillingInterval }
          > = {};
          const subscriptionExpiresAt: Record<string, number> = {};
          const subscriptionPaymentIndexIdentifier: Record<string, string> = {};

          results.forEach((result) => {
            if (!result) return;
            if (result.needsPayment) {
              totalNeedingPayment += 1;
              subscriptionsNeedingPayment.push(result.subscriptionId);
            }
            if (result.displayOverride) {
              subscriptionDisplayOverrides[result.subscriptionId] =
                result.displayOverride;
            }
            if (result.expiresAt != null) {
              subscriptionExpiresAt[result.subscriptionId] = result.expiresAt;
            }
            if (result.paymentIndexIdentifier) {
              subscriptionPaymentIndexIdentifier[result.subscriptionId] =
                result.paymentIndexIdentifier;
            }
          });

          setAggregatedActions({
            totalNeedingPayment,
            totalActions: totalNeedingPayment,
            subscriptionsWithActions: subscriptionsNeedingPayment,
            subscriptionDisplayOverrides,
            subscriptionExpiresAt,
            subscriptionPaymentIndexIdentifier,
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
