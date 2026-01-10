/**
 * Example usage of checkGroupHasSubscription utility
 *
 * This demonstrates how to quickly check if a group has a subscription
 * and get the title if it exists
 */

import { checkGroupHasSubscription } from './src/lib/checkGroupHasSubscription';
import { useGlobal } from 'qapp-core';

// Example 1: Simple check with title
async function exampleSimpleCheck() {
  const { identifierOperations } = useGlobal();

  const groupId = 12345;
  const result = await checkGroupHasSubscription(groupId, identifierOperations);

  if (result.exists) {
    console.log(`Group ${result.groupId}: "${result.title}" - Has subscription!`);
  } else {
    console.log(`Group ${groupId} does not have a subscription.`);
  }
}

// Example 2: Check multiple groups quickly
async function exampleBatchCheck() {
  const { identifierOperations } = useGlobal();

  const groupIds = [12345, 67890, 11111, 22222];

  console.log('Checking subscriptions for multiple groups...');

  const results = await Promise.all(
    groupIds.map(async (groupId) => {
      const result = await checkGroupHasSubscription(
        groupId,
        identifierOperations
      );
      return result;
    })
  );

  results.forEach((result) => {
    if (result.exists) {
      console.log(`Group ${result.groupId}: ✓ "${result.title}"`);
    } else {
      console.log(`Group: ✗ No subscription`);
    }
  });

  const groupsWithSubscriptions = results.filter((r) => r.exists);
  console.log(
    `\nTotal groups with subscriptions: ${groupsWithSubscriptions.length}/${groupIds.length}`
  );
}

// Example 3: Use in a React component
function SubscriptionCheckComponent({ groupId }: { groupId: number }) {
  const { identifierOperations } = useGlobal();
  const [result, setResult] = React.useState<
    { exists: false } | { exists: true; groupId: number; title: string } | null
  >(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    async function check() {
      setLoading(true);
      const result = await checkGroupHasSubscription(
        groupId,
        identifierOperations
      );
      setResult(result);
      setLoading(false);
    }

    if (groupId && identifierOperations) {
      check();
    }
  }, [groupId, identifierOperations]);

  if (loading) return <div>Checking subscription...</div>;
  if (!result) return <div>Unable to check</div>;

  return (
    <div>
      {result.exists ? (
        <div>
          <div>✓ This group has a subscription enabled</div>
          <div>Title: {result.title}</div>
        </div>
      ) : (
        <div>✗ This group does not have a subscription</div>
      )}
    </div>
  );
}

// Example 4: Conditional navigation based on subscription
async function exampleConditionalAction() {
  const { identifierOperations } = useGlobal();
  const groupId = 12345;

  const result = await checkGroupHasSubscription(groupId, identifierOperations);

  if (result.exists) {
    // Navigate to subscription management page
    console.log(`Navigating to manage "${result.title}"...`);
    // navigate(`/manage/${result.groupId}`);
  } else {
    // Navigate to create subscription page
    console.log('Navigating to create subscription...');
    // navigate(`/create?groupId=${groupId}`);
  }
}

// Example 5: Filter groups that have subscriptions
async function exampleFilterGroups() {
  const { identifierOperations } = useGlobal();
  const allGroupIds = [12345, 67890, 11111, 22222];

  // Check all groups in parallel
  const results = await Promise.all(
    allGroupIds.map((groupId) =>
      checkGroupHasSubscription(groupId, identifierOperations)
    )
  );

  // Filter to only subscription-enabled groups
  const subscriptionGroups = results.filter((r) => r.exists);

  console.log('Groups with subscriptions:');
  subscriptionGroups.forEach((group) => {
    if (group.exists) {
      console.log(`- "${group.title}" (${group.groupId})`);
    }
  });
}
