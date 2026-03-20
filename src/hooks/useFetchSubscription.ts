import { useEffect, useState } from 'react';
import { useGlobal, usePublish } from 'qapp-core';
import type { SubscriptionCatalogItem } from '../types/subscription';
import { buildSubscriptionIdentifiers } from '../lib/subscriptionPublishing';
import type { SubscriptionFullDetails } from '../types/subscription';
import { getPendingSubscription } from '../lib/pendingTransactionsCache';

function intervalDaysToBillingInterval(
  _intervalDays: number
): 'hourly' | 'daily' | 'monthly' | 'yearly' {
  return 'monthly';
}

/**
 * Hook to fetch a single subscription by its ID and groupId
 * Useful for public subscription pages when the item isn't in the catalog
 */
export function useFetchSubscription(
  subscriptionId: string | null,
  groupId: number | null
) {
  const { identifierOperations, lists } = useGlobal();
  const { fetchPublish } = usePublish(3, 'JSON');

  const [subscription, setSubscription] =
    useState<SubscriptionCatalogItem | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!subscriptionId || groupId === null) {
      setSubscription(null);
      setLoading(false);
      return;
    }

    if (!identifierOperations || !lists) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function fetchSubscriptionDetails() {
      if (!subscriptionId || groupId === null) return;

      setLoading(true);
      setError(null);

      try {
        // Fetch group info to get owner address
        const groupRes = await fetch(`/groups/${groupId}`);
        if (!groupRes.ok) {
          throw new Error('Failed to fetch group information');
        }
        const groupData = await groupRes.json();
        const ownerAddress = groupData?.owner || '';

        if (!ownerAddress) {
          throw new Error('Group owner not found');
        }

        // Get owner's primary name
        const ownerName = groupData.ownerPrimaryName;
        if (!ownerName) {
          throw new Error('Owner primary name not found');
        }

        // Check cache first - if found, use it as fallback
        const cachedSubscription = getPendingSubscription(
          subscriptionId,
          ownerName
        );

        const { detailsIdentifier } = await buildSubscriptionIdentifiers(
          identifierOperations,
          subscriptionId
        );

        // Get the base identifier prefix for index search (to find latest version)
        const { indexIdentifier: baseIndexIdentifier } =
          await buildSubscriptionIdentifiers(
            identifierOperations,
            subscriptionId
          );
        const baseIdentifierPrefix = baseIndexIdentifier.replace(/-v\d+$/, '');

        // Check if subscription exists - fetch latest versioned index
        const matches = await lists.fetchResourcesResultsOnly({
          identifier: baseIdentifierPrefix,
          service: 'DOCUMENT',
          name: ownerName,
          exactMatchNames: true,
          prefix: true,
          reverse: true,
          limit: 1,
        });

        // If no blockchain data but we have cached data, use it
        if ((!matches || matches.length === 0) && cachedSubscription) {
          const cachedDetails = cachedSubscription.details as any;
          const catalogItem: SubscriptionCatalogItem = {
            id: subscriptionId,
            title:
              typeof cachedDetails?.title === 'string'
                ? cachedDetails.title
                : 'Untitled',
            ownerName,
            ownerAddress,
            groupId,
            description:
              typeof cachedDetails?.description === 'string'
                ? cachedDetails.description
                : '',
            priceQort:
              cachedDetails?.amountQort != null
                ? Number(cachedDetails.amountQort)
                : 1,
            billingInterval: intervalDaysToBillingInterval(
              cachedDetails?.intervalDays ?? 30
            ),
            perks: Array.isArray(cachedDetails?.perks)
              ? cachedDetails.perks
              : [],
            detailsIdentifier: cachedSubscription.detailsIdentifier,
            indexIdentifier:
              cachedSubscription.indexIdentifier ?? baseIndexIdentifier + '-v1',
          };

          if (!cancelled) {
            setSubscription(catalogItem);
          }
          return;
        }

        if (!matches || matches.length === 0) {
          throw new Error('Subscription not published yet');
        }

        const latestIndex = matches[0];
        const indexIdentifier = latestIndex?.identifier;

        // Validate that the identifier has a version suffix
        if (!indexIdentifier || !/-v\d+$/.test(indexIdentifier)) {
          throw new Error('Invalid subscription index');
        }

        // Fetch details
        const detailsRes = await fetchPublish({
          name: ownerName,
          service: 'DOCUMENT',
          identifier: detailsIdentifier,
        });

        const details = detailsRes?.resource?.data as
          | SubscriptionFullDetails
          | undefined;

        // If blockchain details not found but we have cache, use cache
        if (!details && cachedSubscription) {
          const cachedDetails = cachedSubscription.details as any;
          const catalogItem: SubscriptionCatalogItem = {
            id: subscriptionId,
            title:
              typeof cachedDetails?.title === 'string'
                ? cachedDetails.title
                : 'Untitled',
            ownerName,
            ownerAddress,
            groupId,
            description:
              typeof cachedDetails?.description === 'string'
                ? cachedDetails.description
                : '',
            priceQort:
              cachedDetails?.amountQort != null
                ? Number(cachedDetails.amountQort)
                : 1,
            billingInterval: intervalDaysToBillingInterval(
              cachedDetails?.intervalDays ?? 30
            ),
            perks: Array.isArray(cachedDetails?.perks)
              ? cachedDetails.perks
              : [],
            detailsIdentifier: cachedSubscription.detailsIdentifier,
            indexIdentifier,
          };

          if (!cancelled) {
            setSubscription(catalogItem);
          }
          return;
        }

        if (!details) {
          throw new Error('Subscription details not found');
        }

        const anyDetails = details as any;

        const catalogItem: SubscriptionCatalogItem = {
          id: subscriptionId,
          title:
            typeof anyDetails?.title === 'string'
              ? anyDetails.title
              : 'Untitled',
          ownerName,
          ownerAddress,
          groupId,
          description:
            typeof anyDetails?.description === 'string'
              ? anyDetails.description
              : '',
          priceQort:
            anyDetails?.amountQort != null ? Number(anyDetails.amountQort) : 1,
          billingInterval: intervalDaysToBillingInterval(
            anyDetails?.intervalDays ?? 30
          ),
          perks: Array.isArray(anyDetails?.perks) ? anyDetails.perks : [],
          detailsIdentifier,
          indexIdentifier, // The latest versioned index
        };

        if (!cancelled) {
          setSubscription(catalogItem);
        }
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message ?? 'Failed to load subscription');
          setSubscription(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchSubscriptionDetails();

    return () => {
      cancelled = true;
    };
  }, [subscriptionId, groupId, identifierOperations, lists, fetchPublish]);

  return { subscription, loading, error };
}
