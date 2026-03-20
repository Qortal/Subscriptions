import { useTestIdentifiers } from '../constants';
import type {
  GroupAccessType,
  SubscriptionFullDetails,
  SubscriptionOnChainIndex,
} from '../types/subscription';
import { EnumCollisionStrength, objectToBase64 } from 'qapp-core';

export type CreateSubscriptionForm = {
  subscriptionId: string;
  ownerName: string;
  ownerAddress?: string;
  groupId: number;
  groupAccess: GroupAccessType;
  title: string;
  description: string;
  perks: string[];
  amountQort: number;
  intervalDays: number;
  graceDays: number;
};

export function getSubscriptionIdForGroup(groupId: number) {
  return useTestIdentifiers
    ? `test-subscription-${groupId.toString()}`
    : `subscription-${groupId.toString()}`;
}

export async function buildSubscriptionIdentifiers(
  identifierOperations: any,
  subscriptionId: string,
  indexVersion?: number
) {
  const typeDetails = await identifierOperations.hashString(
    useTestIdentifiers ? 'test-subscription_details' : 'subscription_details',
    EnumCollisionStrength.HIGH
  );
  const typeIndex = await identifierOperations.hashString(
    useTestIdentifiers ? 'test-subscription_index' : 'subscription_index',
    EnumCollisionStrength.HIGH
  );
  const idHash = await identifierOperations.hashString(
    subscriptionId,
    EnumCollisionStrength.HIGH
  );

  if (!typeDetails || !typeIndex || !idHash) {
    throw new Error('Failed to create subscription identifiers');
  }

  // Details identifier has NO version - always overwrites the same resource
  // Index identifier has version (-v1, -v2, -v3, etc.) - creates new resources for each pricing change
  const versionSuffix =
    indexVersion !== undefined ? `-v${indexVersion}` : '-v1';

  return {
    detailsIdentifier: typeDetails + idHash,
    indexIdentifier: typeIndex + idHash + versionSuffix,
    idHash,
  };
}

export function encodeOnChainIndexData(index: SubscriptionOnChainIndex) {
  // Compact, deterministic, ascii-only. Target: <= 239 bytes.
  // Format: qsub1|<gid>|<amtQort>|<intDays>|<graceDays>
  return `qsub1|${index.gid}|${index.amt}|${index.int}|${index.gr}`;
}

/** Parse on-chain index data string (qsub1|gid|amt|int|gr) to get price and interval for display/validation */
export function parseOnChainIndexData(
  data: string
): { priceQort: number; intervalDays: number } | null {
  if (!data || typeof data !== 'string') return null;
  const decoded =
    data.length > 0 && !data.includes('|')
      ? (() => {
          try {
            return atob(data);
          } catch {
            return data;
          }
        })()
      : data;
  const parts = decoded.trim().split('|');
  if (parts.length < 5 || parts[0] !== 'qsub1') return null;
  const amt = parseFloat(parts[2]);
  let intervalDays = parseFloat(parts[3]);
  if (Number.isNaN(amt) || Number.isNaN(intervalDays) || intervalDays < 0)
    return null;
  if (intervalDays === 0) intervalDays = 1 / 24; // 0 stored for hourly
  return { priceQort: amt, intervalDays };
}

export function assertOnChainDataLimit(data: string, limitBytes = 239) {
  const bytes = new TextEncoder().encode(data).length;
  if (bytes > limitBytes) {
    throw new Error(
      `On-chain data too large: ${bytes} bytes (max ${limitBytes})`
    );
  }
  return bytes;
}

function utf8ToBase64(input: string) {
  const bytes = new TextEncoder().encode(input);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function buildOnChainIndex(
  form: CreateSubscriptionForm
): SubscriptionOnChainIndex {
  return {
    schema: 'sub-v1',
    gid: form.groupId,
    amt: form.amountQort.toFixed(2),
    int: form.intervalDays,
    gr: form.graceDays,
  };
}

export function buildFullDetails(
  form: CreateSubscriptionForm
): SubscriptionFullDetails {
  // Convert intervalDays to interval enum
  const getIntervalFromDays = (
    days: number
  ): 'HOUR' | 'DAY' | 'WEEK' | 'MONTH' | 'YEAR' => {
    if (days < 1) return 'HOUR';
    if (days === 1) return 'DAY';
    if (days === 7) return 'WEEK';
    if (days >= 365) return 'YEAR';
    return 'MONTH';
  };

  return {
    schema: 'q-subscriptions/details@v2',
    subscriptionId: form.subscriptionId,
    ownerName: form.ownerName,
    ownerAddress: form.ownerAddress,
    groupId: form.groupId,
    groupAccess: form.groupAccess,
    title: form.title,
    description: form.description,
    perks: form.perks,
    createdAt: new Date().toISOString(),
    amountQort: form.amountQort.toFixed(2),
    intervalDays: form.intervalDays,
    graceDays: form.graceDays,
    states: [
      {
        version: 1,
        price: form.amountQort,
        interval: getIntervalFromDays(form.intervalDays),
        effectiveFrom: Date.now(),
      },
    ],
  };
}

export type UpdateSubscriptionForm = {
  existingDetails: SubscriptionFullDetails;
  title?: string;
  description?: string;
  perks?: string[];
  amountQort?: number;
  intervalDays?: number;
  graceDays?: number;
};

function hasPricingChanged(
  existingDetails: SubscriptionFullDetails,
  newAmount?: number,
  newIntervalDays?: number
): boolean {
  const anyDetails = existingDetails as any;

  const existingAmount =
    typeof anyDetails.amountQort === 'string'
      ? Number(anyDetails.amountQort)
      : anyDetails.amountQort;

  const existingIntervalDays = anyDetails.intervalDays;

  if (newAmount !== undefined && newAmount !== existingAmount) return true;
  if (newIntervalDays !== undefined && newIntervalDays !== existingIntervalDays)
    return true;

  return false;
}

export function buildUpdatedDetails(
  updateForm: UpdateSubscriptionForm
): SubscriptionFullDetails {
  const { existingDetails } = updateForm;
  const anyExisting = existingDetails as any;

  // Convert intervalDays to interval enum
  const getIntervalFromDays = (
    days: number
  ): 'HOUR' | 'DAY' | 'WEEK' | 'MONTH' | 'YEAR' => {
    if (days < 1) return 'HOUR';
    if (days === 1) return 'DAY';
    if (days === 7) return 'WEEK';
    if (days >= 365) return 'YEAR';
    return 'MONTH';
  };

  // Get current values
  const currentAmount =
    typeof anyExisting.amountQort === 'string'
      ? Number(anyExisting.amountQort)
      : (anyExisting.amountQort ?? 1);
  const currentIntervalDays = anyExisting.intervalDays ?? 30;

  // Apply updates
  const newAmount = updateForm.amountQort ?? currentAmount;
  const newIntervalDays = updateForm.intervalDays ?? currentIntervalDays;
  const newGraceDays = updateForm.graceDays ?? anyExisting.graceDays ?? 3;

  // Check if pricing changed
  const pricingChanged = hasPricingChanged(
    existingDetails,
    updateForm.amountQort,
    updateForm.intervalDays
  );

  // Get existing states or create empty array
  const existingStates = anyExisting.states ?? [];
  const currentVersion =
    existingStates.length > 0
      ? Math.max(...existingStates.map((s: any) => s.version ?? 0))
      : 0;

  // Build new states array
  let newStates = existingStates;
  if (pricingChanged) {
    // Add a new version to the states array
    newStates = [
      ...existingStates,
      {
        version: currentVersion + 1,
        price: newAmount,
        interval: getIntervalFromDays(newIntervalDays),
        effectiveFrom: Date.now(),
      },
    ];
  }

  return {
    ...existingDetails,
    title: updateForm.title ?? anyExisting.title ?? '',
    description: updateForm.description ?? anyExisting.description ?? '',
    perks: updateForm.perks ?? anyExisting.perks ?? [],
    amountQort: newAmount.toFixed(2),
    intervalDays: newIntervalDays,
    graceDays: newGraceDays,
    states: newStates,
  } as SubscriptionFullDetails;
}

export async function updateSubscription(args: {
  ownerName: string;
  subscriptionId: string;
  identifierOperations: any;
  updateForm: UpdateSubscriptionForm;
  publishMultipleResources: (resources: any[]) => Promise<any>;
}) {
  const { updateForm } = args;
  const { existingDetails } = updateForm;

  // Build updated details
  const updatedDetails = buildUpdatedDetails(updateForm);

  // Check if pricing changed (amount or interval)
  const pricingChanged = hasPricingChanged(
    existingDetails,
    updateForm.amountQort,
    updateForm.intervalDays
  );

  const resources: any[] = [];

  // Get the details identifier (no version)
  const { detailsIdentifier } = await buildSubscriptionIdentifiers(
    args.identifierOperations,
    args.subscriptionId
  );

  // Always publish updated details to the same identifier
  const detailsBase64 = await objectToBase64(updatedDetails);
  resources.push({
    service: 'DOCUMENT',
    name: args.ownerName,
    identifier: detailsIdentifier,
    data64: detailsBase64,
  });

  let newIndexIdentifier: string | null = null;

  // Only create a new versioned on-chain index if pricing changed
  if (pricingChanged) {
    const anyUpdated = updatedDetails as any;
    const anyExisting = existingDetails as any;

    // Get the current version from the states array
    const existingStates = anyExisting.states ?? [];
    const currentVersion =
      existingStates.length > 0
        ? Math.max(...existingStates.map((s: any) => s.version ?? 0))
        : 0;

    const newVersion = currentVersion + 1;

    // Build identifier with new version
    const { indexIdentifier } = await buildSubscriptionIdentifiers(
      args.identifierOperations,
      args.subscriptionId,
      newVersion
    );

    newIndexIdentifier = indexIdentifier;

    const newIndex: SubscriptionOnChainIndex = {
      schema: 'sub-v1',
      gid: anyUpdated.groupId,
      amt: anyUpdated.amountQort,
      int: anyUpdated.intervalDays,
      gr: anyUpdated.graceDays,
    };

    const onChainData = encodeOnChainIndexData(newIndex);
    const indexBase64 = utf8ToBase64(onChainData);

    resources.push({
      service: 'DOCUMENT',
      name: args.ownerName,
      identifier: indexIdentifier,
      data64: indexBase64,
    });
  }

  await args.publishMultipleResources(resources);

  return {
    detailsIdentifier,
    indexIdentifier: newIndexIdentifier,
    pricingChanged,
    resourcesPublished: resources.length,
  };
}

export async function publishSubscription(args: {
  ownerName: string;
  detailsIdentifier: string;
  indexIdentifier: string;
  details: SubscriptionFullDetails;
  index: SubscriptionOnChainIndex;
  publishMultipleResources: (resources: any[]) => Promise<any>;
}) {
  // NOTE: single entry point on purpose — user will own the publishing logic in here.
  // Current default behavior:
  // - publish details as JSON (base64)
  // - publish index as compact on-chain string (base64)

  const detailsBase64 = await objectToBase64(args.details);
  const onChainData = encodeOnChainIndexData(args.index);

  const indexBase64 = utf8ToBase64(onChainData);

  await args.publishMultipleResources([
    {
      service: 'DOCUMENT',
      name: args.ownerName,
      identifier: args.detailsIdentifier,
      data64: detailsBase64,
    },
    {
      service: 'DOCUMENT',
      name: args.ownerName,
      identifier: args.indexIdentifier,
      data64: indexBase64,
    },
  ]);

  return {
    detailsIdentifier: args.detailsIdentifier,
    indexIdentifier: args.indexIdentifier,
    onChainBytes: new TextEncoder().encode(onChainData).length,
  };
}
