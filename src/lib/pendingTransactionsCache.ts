/**
 * Pending Transactions Cache
 * 
 * This module provides a robust caching system for blockchain transactions that are 
 * pending confirmation. Since blockchain transactions take time to confirm, users who 
 * refresh the page immediately after performing an action would see stale data.
 * 
 * The cache stores pending transactions in localStorage with timestamps and merges them
 * with blockchain data to provide an accurate view of the current state.
 * 
 * Uses Jotai's atomWithStorage for reactive localStorage-backed state.
 * 
 * NOTE: The helper functions (cachePending*, getPending*, etc) directly manipulate localStorage
 * for backward compatibility. The atoms automatically sync with localStorage changes.
 * For reactive components, use the atoms with useAtom/useAtomValue.
 * 
 * Cached Actions:
 * - Create subscription (details + index)
 * - Update subscription (details + optional new index)
 * - Subscribe process (payment tx + join request + published record)
 * - Owner actions (invite to group + re-encrypt keys)
 */

import { atomWithStorage } from 'jotai/utils';

// Cache keys
const CACHE_KEY_PREFIX = 'qortal_subscriptions_pending_';
const CACHE_KEY_SUBSCRIPTIONS = `${CACHE_KEY_PREFIX}subscriptions`;
const CACHE_KEY_SUBSCRIBE_ACTIONS = `${CACHE_KEY_PREFIX}subscribe_actions`;
const CACHE_KEY_OWNER_ACTIONS = `${CACHE_KEY_PREFIX}owner_actions`;

// Cache expiration times (in milliseconds)
const CACHE_EXPIRATION_SUBSCRIPTION = 3 * 60 * 1000; // 3 minutes
const CACHE_EXPIRATION_SUBSCRIBE_ACTION = 3 * 60 * 1000; // 3 minutes
const CACHE_EXPIRATION_OWNER_ACTION = 3 * 60 * 1000; // 3 minutes

// Type definitions
export type PendingSubscription = {
  type: 'create' | 'update';
  subscriptionId: string;
  groupId: number;
  ownerName: string;
  ownerAddress?: string;
  detailsIdentifier: string;
  indexIdentifier?: string; // Optional for updates that don't change pricing
  details: any; // SubscriptionFullDetails
  index?: any; // SubscriptionOnChainIndex (optional for updates)
  timestamp: number;
  expiresAt: number;
};

export type PendingSubscribeAction = {
  subscriberName: string;
  subscriberAddress: string;
  subscriptionId: string;
  detailsIdentifier: string;
  groupId: number;
  ownerAddress: string;
  paymentTxSignature?: string; // Set after payment
  joinRequestSent?: boolean; // Set after join request
  recordPublished?: boolean; // Set after on-chain publish
  timestamp: number;
  expiresAt: number;
};

export type PendingOwnerAction = {
  type: 'invite' | 're-encrypt' | 'kick';
  groupId: number;
  ownerAddress: string;
  inviteeAddress?: string; // For invite actions
  kickedAddress?: string; // For kick actions
  // For re-encrypt actions:
  memberCount?: number; // Member count at time of re-encryption
  reEncryptTimestamp?: number; // When re-encryption was done (for comparison with join dates)
  timestamp: number;
  expiresAt: number;
};

// Reactive atoms for cache storage
export const pendingSubscriptionsAtom = atomWithStorage<PendingSubscription[]>(
  CACHE_KEY_SUBSCRIPTIONS,
  []
);

export const pendingSubscribeActionsAtom = atomWithStorage<PendingSubscribeAction[]>(
  CACHE_KEY_SUBSCRIBE_ACTIONS,
  []
);

export const pendingOwnerActionsAtom = atomWithStorage<PendingOwnerAction[]>(
  CACHE_KEY_OWNER_ACTIONS,
  []
);

// Helper functions for localStorage
function getCacheItem<T>(key: string): T[] {
  try {
    const item = localStorage.getItem(key);
    if (!item) return [];
    const parsed = JSON.parse(item);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error(`Failed to read cache ${key}:`, error);
    return [];
  }
}

function setCacheItem<T>(key: string, items: T[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(items));
  } catch (error) {
    console.error(`Failed to write cache ${key}:`, error);
  }
}

function removeExpiredItems<T extends { expiresAt: number }>(items: T[]): T[] {
  const now = Date.now();
  return items.filter((item) => item.expiresAt > now);
}

// ========== Subscription Caching ==========

/**
 * Cache a pending subscription creation or update
 */
export function cachePendingSubscription(
  subscription: Omit<PendingSubscription, 'timestamp' | 'expiresAt'>
): void {
  const items = getCacheItem<PendingSubscription>(CACHE_KEY_SUBSCRIPTIONS);

  // Remove any existing cache for this subscription
  const filtered = items.filter(
    (item) =>
      item.subscriptionId !== subscription.subscriptionId ||
      item.ownerName !== subscription.ownerName
  );

  // Add new cache entry
  const now = Date.now();
  filtered.push({
    ...subscription,
    timestamp: now,
    expiresAt: now + CACHE_EXPIRATION_SUBSCRIPTION,
  });

  setCacheItem(CACHE_KEY_SUBSCRIPTIONS, removeExpiredItems(filtered));
}

/**
 * Get pending subscription by subscription ID and owner
 */
export function getPendingSubscription(
  subscriptionId: string,
  ownerName: string
): PendingSubscription | null {
  const items = removeExpiredItems(
    getCacheItem<PendingSubscription>(CACHE_KEY_SUBSCRIPTIONS)
  );
  setCacheItem(CACHE_KEY_SUBSCRIPTIONS, items); // Clean up expired items

  return (
    items.find(
      (item) =>
        item.subscriptionId === subscriptionId && item.ownerName === ownerName
    ) ?? null
  );
}

/**
 * Get all pending subscriptions for an owner
 */
export function getPendingSubscriptionsByOwner(
  ownerName: string
): PendingSubscription[] {
  const items = removeExpiredItems(
    getCacheItem<PendingSubscription>(CACHE_KEY_SUBSCRIPTIONS)
  );
  setCacheItem(CACHE_KEY_SUBSCRIPTIONS, items); // Clean up expired items

  return items.filter((item) => item.ownerName === ownerName);
}

/**
 * Remove a pending subscription from cache (call when confirmed on blockchain)
 */
export function clearPendingSubscription(
  subscriptionId: string,
  ownerName: string
): void {
  const items = getCacheItem<PendingSubscription>(CACHE_KEY_SUBSCRIPTIONS);
  const filtered = items.filter(
    (item) =>
      item.subscriptionId !== subscriptionId || item.ownerName !== ownerName
  );
  setCacheItem(CACHE_KEY_SUBSCRIPTIONS, filtered);
}

// ========== Subscribe Action Caching ==========

/**
 * Cache a pending subscribe action
 */
export function cachePendingSubscribeAction(
  action: Omit<PendingSubscribeAction, 'timestamp' | 'expiresAt'>
): void {
  const items = getCacheItem<PendingSubscribeAction>(
    CACHE_KEY_SUBSCRIBE_ACTIONS
  );

  // Find existing action for this subscriber + subscription
  const existingIndex = items.findIndex(
    (item) =>
      item.subscriberAddress === action.subscriberAddress &&
      item.subscriptionId === action.subscriptionId
  );

  const now = Date.now();
  const newAction: PendingSubscribeAction = {
    ...action,
    timestamp: now,
    expiresAt: now + CACHE_EXPIRATION_SUBSCRIBE_ACTION,
  };

  if (existingIndex >= 0) {
    // Update existing action (merge fields)
    items[existingIndex] = {
      ...items[existingIndex],
      ...newAction,
    };
  } else {
    // Add new action
    items.push(newAction);
  }

  setCacheItem(CACHE_KEY_SUBSCRIBE_ACTIONS, removeExpiredItems(items));
}

/**
 * Update a pending subscribe action (for multi-step process)
 */
export function updatePendingSubscribeAction(
  subscriberAddress: string,
  subscriptionId: string,
  updates: Partial<Omit<PendingSubscribeAction, 'timestamp' | 'expiresAt'>>
): void {
  const items = getCacheItem<PendingSubscribeAction>(
    CACHE_KEY_SUBSCRIBE_ACTIONS
  );

  const existingIndex = items.findIndex(
    (item) =>
      item.subscriberAddress === subscriberAddress &&
      item.subscriptionId === subscriptionId
  );

  if (existingIndex >= 0) {
    items[existingIndex] = {
      ...items[existingIndex],
      ...updates,
    };
    setCacheItem(CACHE_KEY_SUBSCRIBE_ACTIONS, removeExpiredItems(items));
  }
}

/**
 * Get pending subscribe action for a user and subscription
 */
export function getPendingSubscribeAction(
  subscriberAddress: string,
  subscriptionId: string
): PendingSubscribeAction | null {
  const items = removeExpiredItems(
    getCacheItem<PendingSubscribeAction>(CACHE_KEY_SUBSCRIBE_ACTIONS)
  );
  setCacheItem(CACHE_KEY_SUBSCRIBE_ACTIONS, items); // Clean up expired items

  return (
    items.find(
      (item) =>
        item.subscriberAddress === subscriberAddress &&
        item.subscriptionId === subscriptionId
    ) ?? null
  );
}

/**
 * Get pending subscribe action by group ID and subscriber
 */
export function getPendingSubscribeActionByGroup(
  subscriberAddress: string,
  groupId: number
): PendingSubscribeAction | null {
  const items = removeExpiredItems(
    getCacheItem<PendingSubscribeAction>(CACHE_KEY_SUBSCRIBE_ACTIONS)
  );
  setCacheItem(CACHE_KEY_SUBSCRIBE_ACTIONS, items); // Clean up expired items

  return (
    items.find(
      (item) =>
        item.subscriberAddress === subscriberAddress && item.groupId === groupId
    ) ?? null
  );
}

/**
 * Get all pending subscribe actions for a subscription (owner's view)
 */
export function getPendingSubscribeActionsBySubscription(
  subscriptionId: string
): PendingSubscribeAction[] {
  const items = removeExpiredItems(
    getCacheItem<PendingSubscribeAction>(CACHE_KEY_SUBSCRIBE_ACTIONS)
  );
  setCacheItem(CACHE_KEY_SUBSCRIBE_ACTIONS, items); // Clean up expired items

  return items.filter((item) => item.subscriptionId === subscriptionId);
}

/**
 * Remove a pending subscribe action from cache
 */
export function clearPendingSubscribeAction(
  subscriberAddress: string,
  subscriptionId: string
): void {
  const items = getCacheItem<PendingSubscribeAction>(
    CACHE_KEY_SUBSCRIBE_ACTIONS
  );
  const filtered = items.filter(
    (item) =>
      item.subscriberAddress !== subscriberAddress ||
      item.subscriptionId !== subscriptionId
  );
  setCacheItem(CACHE_KEY_SUBSCRIBE_ACTIONS, filtered);
}

// ========== Owner Action Caching ==========

/**
 * Cache a pending owner action (invite or re-encrypt)
 */
export function cachePendingOwnerAction(
  action: Omit<PendingOwnerAction, 'timestamp' | 'expiresAt'>
): void {
  const items = getCacheItem<PendingOwnerAction>(CACHE_KEY_OWNER_ACTIONS);

  // Remove duplicate actions
  const filtered = items.filter((item) => {
    if (item.type === action.type && item.groupId === action.groupId) {
      if (
        action.type === 'invite' &&
        item.inviteeAddress === action.inviteeAddress
      ) {
        return false;
      }
      if (action.type === 're-encrypt') {
        return false; // Remove any existing re-encrypt for this group
      }
    }
    return true;
  });

  // Add new action
  const now = Date.now();
  filtered.push({
    ...action,
    timestamp: now,
    expiresAt: now + CACHE_EXPIRATION_OWNER_ACTION,
  });

  setCacheItem(CACHE_KEY_OWNER_ACTIONS, removeExpiredItems(filtered));
}

/**
 * Get pending invite action for a user and group
 */
export function getPendingInviteAction(
  groupId: number,
  inviteeAddress: string
): PendingOwnerAction | null {
  const items = removeExpiredItems(
    getCacheItem<PendingOwnerAction>(CACHE_KEY_OWNER_ACTIONS)
  );
  setCacheItem(CACHE_KEY_OWNER_ACTIONS, items); // Clean up expired items

  return (
    items.find(
      (item) =>
        item.type === 'invite' &&
        item.groupId === groupId &&
        item.inviteeAddress === inviteeAddress
    ) ?? null
  );
}

/**
 * Get pending re-encrypt action for a group
 */
export function getPendingReEncryptAction(
  groupId: number
): PendingOwnerAction | null {
  const items = removeExpiredItems(
    getCacheItem<PendingOwnerAction>(CACHE_KEY_OWNER_ACTIONS)
  );
  setCacheItem(CACHE_KEY_OWNER_ACTIONS, items); // Clean up expired items

  return (
    items.find(
      (item) => item.type === 're-encrypt' && item.groupId === groupId
    ) ?? null
  );
}

/**
 * Get all pending owner actions for a group
 */
export function getPendingOwnerActionsByGroup(
  groupId: number
): PendingOwnerAction[] {
  const items = removeExpiredItems(
    getCacheItem<PendingOwnerAction>(CACHE_KEY_OWNER_ACTIONS)
  );
  setCacheItem(CACHE_KEY_OWNER_ACTIONS, items); // Clean up expired items

  return items.filter((item) => item.groupId === groupId);
}

/**
 * Clear a specific pending owner action
 */
export function clearPendingOwnerAction(
  groupId: number,
  type: 'invite' | 're-encrypt',
  inviteeAddress?: string
): void {
  const items = getCacheItem<PendingOwnerAction>(CACHE_KEY_OWNER_ACTIONS);
  const filtered = items.filter((item) => {
    if (item.type === type && item.groupId === groupId) {
      if (type === 'invite' && inviteeAddress) {
        return item.inviteeAddress !== inviteeAddress;
      }
      return false;
    }
    return true;
  });
  setCacheItem(CACHE_KEY_OWNER_ACTIONS, filtered);
}

/**
 * Clear all pending owner actions for a group
 */
export function clearPendingOwnerActionsByGroup(groupId: number): void {
  const items = getCacheItem<PendingOwnerAction>(CACHE_KEY_OWNER_ACTIONS);
  const filtered = items.filter((item) => item.groupId !== groupId);
  setCacheItem(CACHE_KEY_OWNER_ACTIONS, filtered);
}

// ========== Cleanup Utilities ==========

/**
 * Clear all expired cache entries across all caches
 */
export function cleanupExpiredCache(): void {
  // Cleanup subscriptions
  const subscriptions = removeExpiredItems(
    getCacheItem<PendingSubscription>(CACHE_KEY_SUBSCRIPTIONS)
  );
  setCacheItem(CACHE_KEY_SUBSCRIPTIONS, subscriptions);

  // Cleanup subscribe actions
  const subscribeActions = removeExpiredItems(
    getCacheItem<PendingSubscribeAction>(CACHE_KEY_SUBSCRIBE_ACTIONS)
  );
  setCacheItem(CACHE_KEY_SUBSCRIBE_ACTIONS, subscribeActions);

  // Cleanup owner actions
  const ownerActions = removeExpiredItems(
    getCacheItem<PendingOwnerAction>(CACHE_KEY_OWNER_ACTIONS)
  );
  setCacheItem(CACHE_KEY_OWNER_ACTIONS, ownerActions);
}

/**
 * Clear all cache (use with caution)
 */
export function clearAllCache(): void {
  localStorage.removeItem(CACHE_KEY_SUBSCRIPTIONS);
  localStorage.removeItem(CACHE_KEY_SUBSCRIBE_ACTIONS);
  localStorage.removeItem(CACHE_KEY_OWNER_ACTIONS);
}
