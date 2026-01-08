import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  IconButton,
  List,
  ListItem,
  ListItemText,
  Snackbar,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useCatalog } from '../hooks/useCatalog';
import { useGlobal, usePublish } from 'qapp-core';
import {
  sendSubscriptionPayment,
  publishSubscriptionRecord,
  sendJoinGroupRequest,
} from '../lib/subscriptionPayment';
import { SubscribeModal } from '../components/SubscribeModal';
import { useCheckSubscriptionStatus } from '../hooks/useCheckSubscriptionStatus';
import { useGroupInfo } from '../hooks/useGroupInfo';
import { useFetchSubscription } from '../hooks/useFetchSubscription';
import { useValidateUserInGroupKeys } from '../hooks/useValidateUserInGroupKeys';
import { useJoinRequestGroups } from '../hooks/useJoinRequestGroups';
import {
  cachePendingSubscribeAction,
  updatePendingSubscribeAction,
} from '../lib/pendingTransactionsCache';
import { getSubscriptionIdForGroup } from '../lib/subscriptionPublishing';

export function SubscriptionPage() {
  const navigate = useNavigate();
  const { subscriptionId } = useParams();
  const { catalog } = useCatalog();
  const { auth } = useGlobal();
  const { publishMultipleResources } = usePublish();

  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // First try to find in catalog
  const catalogItem = useMemo(
    () =>
      subscriptionId
        ? (catalog.find((s) => s.id === subscriptionId) ?? null)
        : null,
    [catalog, subscriptionId]
  );

  // Extract groupId from subscriptionId if not in catalog
  const groupIdFromSubscriptionId = useMemo(() => {
    if (!subscriptionId) return null;
    // subscriptionId format: "subscription-{groupId}" or "test-subscription-{groupId}"
    const match = subscriptionId.match(/subscription-(\d+)$/);
    return match ? parseInt(match[1], 10) : null;
  }, [subscriptionId]);

  // Fetch subscription if not in catalog
  const {
    subscription: fetchedSubscription,
    loading: fetchingSubscription,
    error: fetchError,
  } = useFetchSubscription(
    catalogItem ? null : (subscriptionId ?? null),
    catalogItem ? null : groupIdFromSubscriptionId
  );

  // Use catalog item if available, otherwise use fetched subscription
  const item = catalogItem || fetchedSubscription;

  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [snackbarMsg, setSnackbarMsg] = useState('');
  const [subscribeModalOpen, setSubscribeModalOpen] = useState(false);
  const [justSubscribed, setJustSubscribed] = useState(false);

  // Fetch group information
  const { groupName, loading: groupLoading } = useGroupInfo(
    item?.groupId ?? null
  );

  // Check if user is already subscribed (member of the group) and payment status
  const {
    loading: checkingSubscription,
    isSubscribed,
    needsPayment,
    isOwner,
  } = useCheckSubscriptionStatus(
    item?.groupId ?? null,
    item?.detailsIdentifier ?? null,
    !!item && !!auth?.address,
    refreshTrigger
  );

  // Check if user has a pending join request for this group
  const { joinRequestGroupIds, loading: checkingJoinRequests } =
    useJoinRequestGroups();
  const hasPendingJoinRequest = item?.groupId
    ? joinRequestGroupIds.includes(item.groupId)
    : false;

  // Treat user as subscribed if they just completed subscription
  const userIsSubscribed = isSubscribed || justSubscribed;
  const userNeedsPayment = needsPayment && !justSubscribed;

  // Check if subscription is disabled
  const isDisabled = item && (item as any).status === 'disabled';

  // Check if user is in group encryption keys (only if subscribed and paid)
  const shouldCheckGroupKeys = userIsSubscribed && !userNeedsPayment;
  const { isInGroupKeys, isLoading: checkingGroupKeys } =
    useValidateUserInGroupKeys(shouldCheckGroupKeys ? (item?.groupId ?? 0) : 0);

  const handleOpenSubscribeModal = () => {
    if (!auth?.name || !auth?.address) {
      setSnackbarMsg('You must be logged in to subscribe');
      setSnackbarOpen(true);
      return;
    }
    // Check if subscription is disabled
    if (isDisabled) {
      setSnackbarMsg(
        'This subscription is currently not accepting new members'
      );
      setSnackbarOpen(true);
      return;
    }
    // Prevent owner from subscribing to their own group
    if (isOwner) {
      setSnackbarMsg('You are the owner of this subscription group');
      setSnackbarOpen(true);
      return;
    }
    // Prevent opening if user has pending join request
    if (hasPendingJoinRequest) {
      setSnackbarMsg('Your subscription request is pending approval');
      setSnackbarOpen(true);
      return;
    }
    // Allow opening modal if not subscribed OR if subscribed but needs payment
    if (userIsSubscribed && !userNeedsPayment) {
      setSnackbarMsg('You are already subscribed!');
      setSnackbarOpen(true);
      return;
    }
    setSubscribeModalOpen(true);
  };

  const handlePayment = async (): Promise<string> => {
    if (!item || !auth?.name || !auth?.address) {
      throw new Error('Subscription not found or user not authenticated');
    }

    const signature = await sendSubscriptionPayment(
      item.ownerAddress,
      item.priceQort
    );

    // Cache the pending subscribe action with payment signature
    const subscriptionId = getSubscriptionIdForGroup(item.groupId);
    cachePendingSubscribeAction({
      subscriberName: auth.name,
      subscriberAddress: auth.address,
      subscriptionId,
      detailsIdentifier: item.detailsIdentifier,
      groupId: item.groupId,
      ownerAddress: item.ownerAddress,
      paymentTxSignature: signature,
      joinRequestSent: false,
      recordPublished: false,
    });

    return signature;
  };

  const handleJoinGroup = async (): Promise<void> => {
    if (!item || !auth?.address) {
      throw new Error('Subscription not found or user not authenticated');
    }

    await sendJoinGroupRequest(item.groupId);

    // Update the pending action to mark join request as sent
    const subscriptionId = getSubscriptionIdForGroup(item.groupId);
    updatePendingSubscribeAction(auth.address, subscriptionId, {
      joinRequestSent: true,
    });
  };

  const handlePublish = async (paymentSignature: string): Promise<void> => {
    if (!item || !auth?.name || !auth?.address) {
      throw new Error('Missing required data');
    }

    await publishSubscriptionRecord({
      subscriberName: auth.name,
      subscriberAddress: auth.address,
      detailsIdentifier: item.detailsIdentifier,
      subscriptionIndexIdentifier: item.indexIdentifier,
      paymentTxSignature: paymentSignature,
      publishMultipleResources,
    });

    // Update the pending action to mark record as published
    const subscriptionId = getSubscriptionIdForGroup(item.groupId);
    updatePendingSubscribeAction(auth.address, subscriptionId, {
      recordPublished: true,
    });
  };

  const handleSubscribeComplete = () => {
    setSnackbarMsg('Successfully subscribed!');
    setSnackbarOpen(true);
    setJustSubscribed(true);
  };

  const handleRefresh = () => {
    setRefreshTrigger((prev) => prev + 1);
    setJustSubscribed(false);
  };

  // Show loading state while fetching
  if (fetchingSubscription) {
    return (
      <Stack spacing={2} alignItems="center" py={4}>
        <Typography variant="h5" fontWeight={800}>
          Loading subscription...
        </Typography>
      </Stack>
    );
  }

  // Show error if fetch failed
  if (fetchError && !catalogItem) {
    return (
      <Stack spacing={2}>
        <Typography variant="h5" fontWeight={800} color="error">
          Failed to load subscription
        </Typography>
        <Typography sx={{ opacity: 0.85 }}>{fetchError}</Typography>
        <Box>
          <Button variant="contained" onClick={() => navigate('/')}>
            Back to home
          </Button>
        </Box>
      </Stack>
    );
  }

  // Show not found if no item
  if (!item) {
    return (
      <Stack spacing={2}>
        <Typography variant="h5" fontWeight={800}>
          Subscription not found
        </Typography>
        <Typography sx={{ opacity: 0.85 }}>
          This subscription hasn't been published yet or doesn't exist.
        </Typography>
        <Box>
          <Button variant="contained" onClick={() => navigate('/')}>
            Back to home
          </Button>
        </Box>
      </Stack>
    );
  }

  return (
    <Stack spacing={2.5}>
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Button size="small" onClick={() => navigate('/')}>
          ← Home
        </Button>
        <Tooltip title="Refresh subscription data">
          <IconButton
            onClick={handleRefresh}
            disabled={
              checkingSubscription || checkingJoinRequests || checkingGroupKeys
            }
            size="small"
          >
            <RefreshIcon />
          </IconButton>
        </Tooltip>
      </Stack>

      <Stack spacing={1}>
        <Typography variant="h4" fontWeight={900}>
          {item.title}
        </Typography>
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          <Chip label={`Owner: ${item.ownerName}`} variant="outlined" />
          <Chip label={item.ownerAddress} variant="outlined" />
          {groupName && (
            <Chip
              label={`Group: ${groupName}`}
              variant="outlined"
              color="primary"
            />
          )}
          <Chip
            label={`Group ID: ${item.groupId}`}
            variant="outlined"
            size="small"
          />
          {groupLoading && (
            <Chip label="Loading group..." variant="outlined" size="small" />
          )}
        </Stack>
      </Stack>

      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
        <Box flex={2}>
          <Card variant="outlined">
            <CardContent>
              <Typography variant="h6" fontWeight={800}>
                About
              </Typography>
              <Typography sx={{ opacity: 0.85, mt: 0.5 }}>
                {item.description}
              </Typography>

              <Divider sx={{ my: 2 }} />

              <Typography variant="h6" fontWeight={800}>
                What you get
              </Typography>
              <List dense>
                {item.perks.map((perk) => (
                  <ListItem key={perk} disableGutters>
                    <ListItemText primary={perk} />
                  </ListItem>
                ))}
              </List>
            </CardContent>
          </Card>
        </Box>

        <Box flex={1}>
          <Card variant="outlined">
            <CardContent>
              <Typography variant="h6" fontWeight={800}>
                Subscribe
              </Typography>

              <Stack spacing={1} sx={{ mt: 1.5 }}>
                <Divider />

                <Typography variant="h5" fontWeight={900}>
                  {item.priceQort} QORT{' '}
                  <Typography component="span" sx={{ opacity: 0.75 }}>
                    / month
                  </Typography>
                </Typography>

                {isDisabled ? (
                  <Alert severity="info">
                    <Typography variant="body2" fontWeight={600}>
                      This subscription is currently not accepting new members
                    </Typography>
                  </Alert>
                ) : hasPendingJoinRequest ? (
                  <Button
                    size="large"
                    variant="outlined"
                    disabled
                    sx={{ color: 'warning.main', borderColor: 'warning.main' }}
                  >
                    ⏳ Pending Approval
                  </Button>
                ) : isOwner ? (
                  <Button
                    size="large"
                    variant="outlined"
                    disabled
                    sx={{ color: 'info.main', borderColor: 'info.main' }}
                  >
                    👤 You Own This Group
                  </Button>
                ) : userIsSubscribed && !userNeedsPayment ? (
                  <Button
                    size="large"
                    variant="outlined"
                    disabled
                    sx={{ color: 'success.main', borderColor: 'success.main' }}
                  >
                    ✓ Already Subscribed
                  </Button>
                ) : userNeedsPayment ? (
                  <Button
                    size="large"
                    variant="contained"
                    color="error"
                    onClick={handleOpenSubscribeModal}
                    disabled={checkingSubscription}
                  >
                    {checkingSubscription
                      ? 'Checking...'
                      : '⚠ Payment Required'}
                  </Button>
                ) : (
                  <Button
                    size="large"
                    variant="contained"
                    onClick={handleOpenSubscribeModal}
                    disabled={checkingSubscription || checkingJoinRequests}
                  >
                    {checkingSubscription || checkingJoinRequests
                      ? 'Checking...'
                      : 'Subscribe'}
                  </Button>
                )}
              </Stack>
            </CardContent>
          </Card>
        </Box>
      </Stack>

      {/* Pending approval status */}
      {hasPendingJoinRequest && (
        <Alert severity="info">
          <Typography variant="body2" fontWeight={600} gutterBottom>
            Subscription Request Pending
          </Typography>
          <Typography variant="body2">
            Your payment and subscription record have been published
            successfully. The subscription manager needs to approve your join
            request to grant you access to the group.
          </Typography>
        </Alert>
      )}

      {/* Group keys status for subscribed and paid users */}
      {shouldCheckGroupKeys && (
        <Box>
          {checkingGroupKeys ? (
            <Alert severity="info">Checking group encryption access...</Alert>
          ) : isInGroupKeys ? (
            <Alert severity="success">
              ✓ You have access to the group's encrypted content.
            </Alert>
          ) : (
            <Alert severity="warning">
              <Typography variant="body2" fontWeight={600} gutterBottom>
                Waiting for Access
              </Typography>
              <Typography variant="body2">
                You have subscribed and paid, but you don't yet have access to
                encrypted group content. The subscription manager needs to:
              </Typography>
              <Typography variant="body2" component="div" sx={{ mt: 1 }}>
                1. Approve your join request (if not yet approved)
                <br />
                2. Re-encrypt the group keys to include you
              </Typography>
              <Typography variant="body2" sx={{ mt: 1, opacity: 0.9 }}>
                This is typically done when the manager reviews new subscribers.
                You'll automatically gain access once completed.
              </Typography>
            </Alert>
          )}
        </Box>
      )}

      <SubscribeModal
        open={subscribeModalOpen}
        onClose={() => setSubscribeModalOpen(false)}
        subscriptionTitle={item.title}
        amount={item.priceQort}
        groupId={item.groupId}
        onPayment={handlePayment}
        onJoinGroup={handleJoinGroup}
        onPublish={handlePublish}
        onComplete={handleSubscribeComplete}
        isRenewal={userNeedsPayment}
      />

      <Snackbar
        open={snackbarOpen}
        autoHideDuration={3000}
        onClose={() => setSnackbarOpen(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setSnackbarOpen(false)}
          severity={
            snackbarMsg.includes('Failed') || snackbarMsg.includes('must')
              ? 'error'
              : 'success'
          }
          variant="filled"
          sx={{ width: '100%' }}
        >
          {snackbarMsg}
        </Alert>
      </Snackbar>
    </Stack>
  );
}
