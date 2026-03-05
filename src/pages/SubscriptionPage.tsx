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
import { useSubscriptionBillingDetails } from '../hooks/useSubscriptionBillingDetails';
import { useSubscriptionIndexPrice } from '../hooks/useSubscriptionIndexPrice';
import {
  useSubscriberPaymentStatus,
  getPriceAtTime,
} from '../hooks/useSubscriberPaymentStatus';
import {
  cachePendingSubscribeAction,
  updatePendingSubscribeAction,
} from '../lib/pendingTransactionsCache';
import { getSubscriptionIdForGroup } from '../lib/subscriptionPublishing';

function formatExpiry(expiresAt: number): {
  dateText: string;
  timeLeft: string;
} {
  const d = new Date(expiresAt);
  const dateText = d.toLocaleDateString(undefined, { dateStyle: 'medium' });
  const now = Date.now();
  if (expiresAt <= now) return { dateText, timeLeft: 'Expired' };
  const ms = expiresAt - now;
  const days = Math.floor(ms / (24 * 60 * 60 * 1000));
  const hours = Math.floor((ms % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
  const minutes = Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000));
  const timeLeft =
    days > 0
      ? `${days} day${days !== 1 ? 's' : ''}, ${hours} hour${hours !== 1 ? 's' : ''} left`
      : hours >= 1
        ? `${hours} hour${hours !== 1 ? 's' : ''} left`
        : `${minutes} min${minutes !== 1 ? 's' : ''} left`;
  return { dateText, timeLeft };
}

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
  console.log('item', item);
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
    existingSubscriptionIndexIdentifier,
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

  // Billing details (interval, grace, status) - fetch whenever we have an item so we get status for isDisabled
  const { details: billingDetails } = useSubscriptionBillingDetails(
    item?.ownerName ?? null,
    item?.detailsIdentifier ?? null,
    !!item
  );

  // Locked-in price/interval from subscriber's PRODUCT record (si) → index DOCUMENT
  const { priceQort: indexPriceQort, intervalDays: indexIntervalDays } =
    useSubscriptionIndexPrice(
      item?.ownerName ?? null,
      existingSubscriptionIndexIdentifier,
      !!(
        item &&
        userIsSubscribed &&
        !isOwner &&
        existingSubscriptionIndexIdentifier
      )
    );

  // Check if subscription is disabled (from fetched details; item from catalog/fetch doesn't include status)
  const isDisabled = item && billingDetails?.status === 'disabled';

  // Check if user is in group encryption keys (only if subscribed and paid)
  const shouldCheckGroupKeys = userIsSubscribed && !userNeedsPayment;
  const { isInGroupKeys, isLoading: checkingGroupKeys } =
    useValidateUserInGroupKeys(shouldCheckGroupKeys ? (item?.groupId ?? 0) : 0);

  // Current user's payment/expiry (only when subscribed and paid)
  const { paymentInfo } = useSubscriberPaymentStatus(
    auth?.address
      ? [{ address: auth.address, primaryName: auth.name ?? null }]
      : [],
    item?.detailsIdentifier ?? null,
    item?.ownerAddress ?? null,
    item?.ownerName ?? null,
    item?.priceQort ?? 0,
    billingDetails?.states,
    billingDetails?.intervalDays ?? 30,
    billingDetails?.graceDays ?? 3,
    !!(
      item &&
      userIsSubscribed &&
      !userNeedsPayment &&
      auth?.address &&
      !isOwner
    )
  );

  const currentUserInfo = auth?.address
    ? paymentInfo.get(auth.address)
    : undefined;
  const currentUserExpiresAt = currentUserInfo?.expiresAt;
  const expiryDisplay =
    currentUserExpiresAt != null ? formatExpiry(currentUserExpiresAt) : null;

  // Expired = paid period has ended (excludes grace). Show renew CTA when the expiry date has passed.
  const isExpired = expiryDisplay?.timeLeft === 'Expired';
  const showRenewCta = userNeedsPayment || (userIsSubscribed && isExpired);

  // Calculate the locked renewal price:
  // Prefer price from index (si) when available; else from states + lastPaymentDate
  const renewalPrice = useMemo(() => {
    const currentPrice = item?.priceQort ?? 0;
    if (indexPriceQort != null) {
      return Math.min(indexPriceQort, currentPrice);
    }
    const lastPaymentDate = currentUserInfo?.lastPaymentDate;
    if (!lastPaymentDate || !billingDetails?.states) {
      return currentPrice;
    }
    const priceAtSubscription = getPriceAtTime(
      billingDetails.states,
      lastPaymentDate,
      currentPrice
    );
    return Math.min(priceAtSubscription, currentPrice);
  }, [
    indexPriceQort,
    currentUserInfo?.lastPaymentDate,
    billingDetails?.states,
    item?.priceQort,
  ]);

  // For subscribed users: show locked-in price/interval from index (si) when available
  const displayPrice =
    userIsSubscribed && !isOwner && indexPriceQort != null
      ? Math.min(indexPriceQort, item?.priceQort ?? indexPriceQort)
      : userIsSubscribed && !isOwner && renewalPrice !== item?.priceQort
        ? renewalPrice
        : (item?.priceQort ?? 0);
  const displayIntervalDays =
    userIsSubscribed && !isOwner && indexIntervalDays != null
      ? indexIntervalDays
      : (billingDetails?.intervalDays ?? 30);
  const displayIntervalLabel = useMemo(() => {
    const days = displayIntervalDays;
    if (days < 0.1) return 'hour';
    if (days === 1) return 'day';
    if (days >= 365) return 'year';
    return 'month';
  }, [displayIntervalDays]);

  const handleOpenSubscribeModal = () => {
    if (!auth?.name || !auth?.address) {
      setSnackbarMsg('You must be logged in to subscribe');
      setSnackbarOpen(true);
      return;
    }
    // Check if subscription is disabled
    if (isDisabled) {
      setSnackbarMsg(
        'This subscription is currently not accepting new subscribers nor payments.'
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
    // Allow opening modal if not subscribed, or needs payment, or expired (renewal)
    const isExpiredForModal = expiryDisplay?.timeLeft === 'Expired';
    if (userIsSubscribed && !userNeedsPayment && !isExpiredForModal) {
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

    // Use locked renewal price (original agreed price, unless current price is lower)
    const amountToPay = showRenewCta ? renewalPrice : item.priceQort;

    const signature = await sendSubscriptionPayment(
      item.ownerAddress,
      amountToPay
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

    // Use locked-in index only when they paid the locked-in price (renewal and renewalPrice < current).
    // When they paid current price (e.g. because it dropped), use latest index.
    const payingLockedInPrice =
      showRenewCta &&
      item.priceQort != null &&
      renewalPrice < item.priceQort &&
      !!existingSubscriptionIndexIdentifier;
    const indexToPublish = payingLockedInPrice
      ? existingSubscriptionIndexIdentifier!
      : item.indexIdentifier;

    await publishSubscriptionRecord({
      subscriberName: auth.name,
      subscriberAddress: auth.address,
      detailsIdentifier: item.detailsIdentifier,
      subscriptionIndexIdentifier: indexToPublish,
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
          <Chip label={`Group ID: ${item.groupId}`} variant="outlined" />
          {groupLoading && <Chip label="Loading group..." variant="outlined" />}
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
                  {displayPrice} QORT{' '}
                  <Typography component="span" sx={{ opacity: 0.75 }}>
                    / {displayIntervalLabel}
                  </Typography>
                </Typography>
                {userIsSubscribed &&
                  !isOwner &&
                  (indexPriceQort != null || renewalPrice !== item.priceQort) &&
                  (indexPriceQort != null
                    ? indexPriceQort < (item?.priceQort ?? 0)
                    : renewalPrice !== item.priceQort) && (
                    <Typography
                      variant="caption"
                      sx={{ opacity: 0.6, fontStyle: 'italic' }}
                    >
                      Your rate is locked at {displayPrice} QORT. The current
                      price for new subscribers is {item.priceQort} QORT.
                    </Typography>
                  )}

                {isDisabled ? (
                  <Alert severity="info">
                    <Typography variant="body2" fontWeight={600}>
                      This subscription is currently not accepting new
                      subscribers nor payments.
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
                ) : userIsSubscribed && !userNeedsPayment && !isExpired ? (
                  <Stack spacing={1}>
                    <Button
                      size="large"
                      variant="outlined"
                      disabled
                      sx={{
                        color: 'success.main',
                        borderColor: 'success.main',
                      }}
                    >
                      ✓ Already Subscribed
                    </Button>
                    {expiryDisplay && (
                      <Box sx={{ pt: 0.5 }}>
                        <Typography variant="body2" sx={{ opacity: 0.9 }}>
                          Expires: {expiryDisplay.dateText}
                        </Typography>
                        <Typography
                          variant="body2"
                          sx={{
                            opacity: 0.85,
                            fontWeight: 600,
                            color:
                              expiryDisplay.timeLeft === 'Expired'
                                ? 'error.main'
                                : 'text.secondary',
                          }}
                        >
                          {expiryDisplay.timeLeft}
                        </Typography>
                      </Box>
                    )}
                  </Stack>
                ) : showRenewCta ? (
                  <Button
                    size="large"
                    variant="contained"
                    color="error"
                    onClick={handleOpenSubscribeModal}
                    disabled={checkingSubscription}
                  >
                    {checkingSubscription
                      ? 'Checking...'
                      : isExpired
                        ? 'Pay subscription'
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
        amount={showRenewCta ? renewalPrice : item.priceQort}
        groupId={item.groupId}
        onPayment={handlePayment}
        onJoinGroup={handleJoinGroup}
        onPublish={handlePublish}
        onComplete={handleSubscribeComplete}
        isRenewal={showRenewCta}
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
