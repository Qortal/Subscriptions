import { objectToBase64 } from 'qapp-core';

// @ts-ignore - qortalRequest is available globally
declare const qortalRequest: (params: any) => Promise<any>;

export type SubscriptionRecord = {
  si: string; // subscriptionIndexIdentifier (shortened for space)
  tx: string; // paymentTxSignature (shortened for space)
};

/**
 * Send a payment for a subscription
 */
export async function sendSubscriptionPayment(
  recipientAddress: string,
  amount: number
): Promise<string> {
  try {
    const response = await qortalRequest({
      action: 'SEND_COIN',
      coin: 'QORT',
      recipient: recipientAddress,
      amount: amount,
    });

    if (!response || !response.signature) {
      throw new Error('Payment failed: No transaction signature received');
    }

    return response.signature;
  } catch (error: any) {
    throw new Error(error?.message ?? 'Failed to send payment');
  }
}

/**
 * Send a join group request
 */
export async function sendJoinGroupRequest(groupId: number): Promise<void> {
  try {
    const response = await qortalRequest({
      action: 'JOIN_GROUP',
      groupId: groupId,
    });

    // The JOIN_GROUP request doesn't return anything, it just throws on error
    console.log('Join group request sent successfully', response);
  } catch (error: any) {
    throw new Error(error?.message ?? 'Failed to send join group request');
  }
}

/**
 * Invite a user to a group
 */
export async function inviteToGroup(
  groupId: number,
  inviteeAddress: string
): Promise<void> {
  try {
    const response = await qortalRequest({
      action: 'INVITE_TO_GROUP',
      groupId: groupId,
      inviteeAddress: inviteeAddress,
      inviteTime: 10800,
    });

    console.log('Invite sent successfully', response);
  } catch (error: any) {
    throw new Error(error?.message ?? 'Failed to invite user to group');
  }
}

/**
 * Publish subscription record on-chain
 * Uses PRODUCT service with the same identifier as the details (but different service)
 */
export async function publishSubscriptionRecord(args: {
  subscriberName: string;
  subscriberAddress: string;
  detailsIdentifier: string;
  subscriptionIndexIdentifier: string;
  paymentTxSignature: string;
  publishMultipleResources: (resources: any[]) => Promise<any>;
}): Promise<void> {
  const subscriptionRecord: SubscriptionRecord = {
    si: args.subscriptionIndexIdentifier,
    tx: args.paymentTxSignature,
  };

  const recordBase64 = await objectToBase64(subscriptionRecord);
  console.log('test', recordBase64);
  await args.publishMultipleResources([
    {
      service: 'PRODUCT',
      name: args.subscriberName,
      identifier: args.detailsIdentifier, // Same identifier as details, but PRODUCT service
      data64: recordBase64,
    },
  ]);
}

/**
 * Complete subscription flow: payment + join group + on-chain record
 */
export async function subscribeToSubscription(args: {
  subscriberName: string;
  subscriberAddress: string;
  ownerAddress: string;
  detailsIdentifier: string;
  subscriptionIndexIdentifier: string; // The versioned index (e.g., hash-v2)
  groupId: number;
  amount: number;
  publishMultipleResources: (resources: any[]) => Promise<any>;
}): Promise<{ paymentTxSignature: string }> {
  // Step 1: Send payment
  const paymentTxSignature = await sendSubscriptionPayment(
    args.ownerAddress,
    args.amount
  );

  // Step 2: Send join group request
  await sendJoinGroupRequest(args.groupId);

  // Step 3: Publish subscription record on-chain
  await publishSubscriptionRecord({
    subscriberName: args.subscriberName,
    subscriberAddress: args.subscriberAddress,
    detailsIdentifier: args.detailsIdentifier,
    subscriptionIndexIdentifier: args.subscriptionIndexIdentifier,
    paymentTxSignature,
    publishMultipleResources: args.publishMultipleResources,
  });

  return { paymentTxSignature };
}
