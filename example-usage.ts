/**
 * Example usage of the checkSubscriptionStatus utility
 * This file demonstrates how to use the utility in another app
 */

import { checkSubscriptionStatus, isGroupMember, isGroupOwner } from './src/lib/checkSubscriptionStatus';
import { useCheckSubscriptionStatus } from './src/lib/useCheckSubscriptionStatus';

// Example 1: Check full subscription status
async function example1_CheckFullStatus() {
  const result = await checkSubscriptionStatus({
    address: 'QUserAddress123',
    groupId: 12345,
  });

  console.log('Status:', result.status);
  console.log('Is Subscribed:', result.isSubscribed);
  console.log('Needs Payment:', result.needsPayment);
  console.log('Is Owner:', result.isOwner);
  console.log('Is Member:', result.isMember);
  console.log('Has Payment Record:', result.hasPaymentRecord);

  // Grant access based on status
  if (result.status === 'subscribed-paid' || result.status === 'owner') {
    console.log('✅ Access granted');
  } else {
    console.log('❌ Access denied');
  }
}

// Example 2: Quick membership check
async function example2_QuickMembershipCheck() {
  const address = 'QUserAddress123';
  const groupId = 12345;

  const isMember = await isGroupMember(address, groupId);
  const isOwner = await isGroupOwner(address, groupId);

  if (isMember || isOwner) {
    console.log('✅ User has access to the group');
  } else {
    console.log('❌ User does not have access');
  }
}

// Example 3: Batch check multiple users
async function example3_BatchCheck() {
  const addresses = [
    'QUser1',
    'QUser2',
    'QUser3',
  ];
  const groupId = 12345;

  const results = await Promise.all(
    addresses.map(address =>
      checkSubscriptionStatus({ address, groupId })
    )
  );

  results.forEach((result, index) => {
    console.log(`${addresses[index]}: ${result.status}`);
  });

  // Filter only paid subscribers
  const paidSubscribers = addresses.filter(
    (_, index) => results[index].status === 'subscribed-paid'
  );
  console.log('Paid subscribers:', paidSubscribers);
}

// Example 4: Access control middleware (Express-like)
async function example4_AccessControlMiddleware(
  userAddress: string,
  requiredGroupId: number
): Promise<boolean> {
  const result = await checkSubscriptionStatus({
    address: userAddress,
    groupId: requiredGroupId,
  });

  // Allow access if:
  // 1. User is the group owner
  // 2. User is subscribed and has paid
  return result.status === 'owner' || result.status === 'subscribed-paid';
}

// Example 5: Get detailed access information
async function example5_DetailedAccessInfo(address: string, groupId: number) {
  const result = await checkSubscriptionStatus({ address, groupId });

  if (result.status === 'owner') {
    return {
      canAccess: true,
      reason: 'User is the group owner',
      requiresPayment: false,
    };
  }

  if (result.status === 'subscribed-paid') {
    return {
      canAccess: true,
      reason: 'User has an active paid subscription',
      requiresPayment: false,
    };
  }

  if (result.status === 'subscribed-unpaid') {
    return {
      canAccess: false,
      reason: 'User is a member but payment record not found',
      requiresPayment: true,
    };
  }

  return {
    canAccess: false,
    reason: 'User is not a member of this group',
    requiresPayment: false,
  };
}

// Example 6: React Hook Usage
function Example6_ReactComponent() {
  // This is a React component example - uncomment if using in a React app
  /*
  import { useGlobal } from 'qapp-core';
  import { useCheckSubscriptionStatusLib } from './src/lib/useCheckSubscriptionStatus';
  
  function SubscriptionChecker({ groupId }) {
    const { auth } = useGlobal();
    
    const {
      status,
      isSubscribed,
      needsPayment,
      isPaymentTxValid,
      loading,
      error,
      refresh
    } = useCheckSubscriptionStatusLib({
      address: auth?.address ?? null,
      groupId,
    });

    if (loading) {
      return <div>Checking subscription status...</div>;
    }

    if (error) {
      return (
        <div>
          <p>Error: {error.message}</p>
          <button onClick={refresh}>Retry</button>
        </div>
      );
    }

    return (
      <div>
        <h3>Subscription Status</h3>
        <p>Status: {status}</p>
        <p>Is Subscribed: {isSubscribed ? 'Yes' : 'No'}</p>
        <p>Needs Payment: {needsPayment ? 'Yes' : 'No'}</p>
        <p>Payment Valid: {isPaymentTxValid ? 'Yes' : 'No'}</p>
        <button onClick={refresh}>Refresh Status</button>
      </div>
    );
  }
  */
  
  console.log('See comment above for React Hook usage example');
}

// Run examples
async function runExamples() {
  console.log('=== Example 1: Full Status Check ===');
  await example1_CheckFullStatus();

  console.log('\n=== Example 2: Quick Membership Check ===');
  await example2_QuickMembershipCheck();

  console.log('\n=== Example 3: Batch Check ===');
  await example3_BatchCheck();

  console.log('\n=== Example 4: Access Control ===');
  const hasAccess = await example4_AccessControlMiddleware('QUser1', 12345);
  console.log('Has access:', hasAccess);

  console.log('\n=== Example 5: Detailed Access Info ===');
  const info = await example5_DetailedAccessInfo('QUser1', 12345);
  console.log(info);
  
  console.log('\n=== Example 6: React Hook ===');
  Example6_ReactComponent();
}

// Uncomment to run
// runExamples();

