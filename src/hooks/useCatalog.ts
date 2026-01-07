import { useEffect, useState } from 'react';
import { useGlobal, usePublish } from 'qapp-core';
import type { SubscriptionCatalogItem } from '../types/subscription';
import {
  buildSubscriptionIdentifiers,
  getSubscriptionIdForGroup,
} from '../lib/subscriptionPublishing';
import type { SubscriptionFullDetails } from '../types/subscription';
import { useOwnedGroups } from './useOwnedGroups';

function intervalDaysToBillingInterval(
  intervalDays: number
): 'monthly' | 'yearly' {
  if (intervalDays >= 365) return 'yearly';
  return 'monthly';
}

async function fetchPrimaryNameForAddress(ownerAddress: string) {
  const response = await fetch(`/names/primary/${ownerAddress}`);
  if (!response.ok) return null;
  const data = await response.json();
  const name = data?.name;
  return typeof name === 'string' && name.trim() ? name : null;
}

export function useCatalog() {
  const { identifierOperations, lists } = useGlobal();
  const { fetchPublish } = usePublish(3, 'JSON');
  const { ownedGroups } = useOwnedGroups();

  const [catalog, setCatalog] = useState<SubscriptionCatalogItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchCatalog() {
      if (!identifierOperations || !lists) return;

      setLoading(true);
      setError(null);

      try {
        // Fetch catalog items from owned groups that have published subscriptions
        const results = await Promise.all(
          ownedGroups.map(async (g: any) => {
            const groupId =
              typeof g.groupId === 'number'
                ? g.groupId
                : typeof g.groupId === 'string'
                  ? Number(g.groupId)
                  : null;

            if (groupId === null) return null;

            const ownerAddress = g.owner || '';
            const ownerName = await fetchPrimaryNameForAddress(ownerAddress);
            if (!ownerName) return null;

            const subscriptionId = getSubscriptionIdForGroup(groupId);
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
            const baseIdentifierPrefix = baseIndexIdentifier.replace(
              /-v\d+$/,
              ''
            );

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

            if (!matches || matches.length === 0) return null;

            const latestIndex = matches[0];
            const indexIdentifier = latestIndex?.identifier;

            // Validate that the identifier has a version suffix
            if (!indexIdentifier || !/-v\d+$/.test(indexIdentifier)) {
              return null;
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

            if (!details) return null;

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
                anyDetails?.amountQort != null
                  ? Number(anyDetails.amountQort)
                  : 1,
              billingInterval: intervalDaysToBillingInterval(
                anyDetails?.intervalDays ?? 30
              ),
              perks: Array.isArray(anyDetails?.perks) ? anyDetails.perks : [],
              detailsIdentifier,
              indexIdentifier, // The latest versioned index
            };

            return catalogItem;
          })
        );

        const fetchedCatalog = results.filter(
          Boolean
        ) as SubscriptionCatalogItem[];

        if (!cancelled) {
          setCatalog(fetchedCatalog);
        }
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message ?? 'Failed to load catalog');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchCatalog();
    return () => {
      cancelled = true;
    };
  }, [identifierOperations, lists, ownedGroups, fetchPublish]);

  return { catalog, loading, error };
}
