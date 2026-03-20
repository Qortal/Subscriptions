import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
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
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useCatalog } from '../hooks/useCatalog';
import { useGlobal, usePublish } from 'qapp-core';
import { useTranslation } from 'react-i18next';
import {
  notifySubscriptionsUpdate,
  sendSubscriptionPayment,
  publishSubscriptionRecord,
  sendJoinGroupRequest,
  leaveGroup,
} from '../lib/subscriptionPayment';
import { SubscribeModal } from '../components/SubscribeModal';
import { useCheckSubscriptionStatus } from '../hooks/useCheckSubscriptionStatus';
import { useGroupInfo } from '../hooks/useGroupInfo';
import { useFetchSubscription } from '../hooks/useFetchSubscription';
import { useValidateUserInGroupKeys } from '../hooks/useValidateUserInGroupKeys';
import { useJoinRequestGroups } from '../hooks/useJoinRequestGroups';
import { useSubscriptionBillingDetails } from '../hooks/useSubscriptionBillingDetails';
import { useSubscriptionIndexPrice } from '../hooks/useSubscriptionIndexPrice';
import { useKickedFromSubscription } from '../hooks/useKickedFromSubscription';
import { useBannedFromGroup } from '../hooks/useBannedFromGroup';
import {
  useSubscriberPaymentStatus,
  getPriceAtTime,
} from '../hooks/useSubscriberPaymentStatus';
import {
  cachePendingSubscribeAction,
  updatePendingSubscribeAction,
  cachePendingLeaveGroup,
} from '../lib/pendingTransactionsCache';
import { getSubscriptionIdForGroup } from '../lib/subscriptionPublishing';
import { resolvePaymentIndexIdentifierForPublish } from '../lib/resolvePaymentIndexIdentifier';

function formatExpiry(
  expiresAt: number,
  t: (key: string, opts?: Record<string, unknown>) => string
): {
  dateText: string;
  timeLeft: string;
  isExpired: boolean;
} {
  const d = new Date(expiresAt);
  const dateText = d.toLocaleDateString(undefined, { dateStyle: 'medium' });
  const now = Date.now();
  if (expiresAt <= now)
    return { dateText, timeLeft: t('core:sub_expired'), isExpired: true };
  const ms = expiresAt - now;
  const days = Math.floor(ms / (24 * 60 * 60 * 1000));
  const hours = Math.floor((ms % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
  const minutes = Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000));
  let timeLeft: string;
  if (days > 0) {
    timeLeft =
      days === 1 && hours === 1
        ? t('core:sub_time_left_days_hours', { days, hours })
        : t('core:sub_time_left_days_hours_plural', { days, hours });
  } else if (hours >= 1) {
    timeLeft =
      minutes > 0
        ? t('core:sub_time_left_hours', { hours, minutes })
        : hours === 1
          ? t('core:sub_time_left_hour', { hours })
          : t('core:sub_time_left_hours_plural', { hours });
  } else {
    timeLeft =
      minutes === 1
        ? t('core:sub_time_left_mins', { minutes })
        : t('core:sub_time_left_mins_plural', { minutes });
  }
  return { dateText, timeLeft, isExpired: false };
}

const AUTO_REFRESH_INTERVAL = 2 * 60 * 1000; // 2 minutes

export function SubscriptionPage() {
  const navigate = useNavigate();
  const { t } = useTranslation(['core']);
  const { subscriptionId } = useParams();
  const { catalog } = useCatalog();
  const { auth, identifierOperations, lists } = useGlobal();
  const { publishMultipleResources } = usePublish();

  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const isRefreshingRef = useRef(false);

  // Auto-refresh every 2 minutes
  useEffect(() => {
    const intervalId = setInterval(() => {
      if (!isRefreshingRef.current) {
        setRefreshTrigger((prev) => prev + 1);
      }
    }, AUTO_REFRESH_INTERVAL);
    return () => clearInterval(intervalId);
  }, []);

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
  const [snackbarSeverity, setSnackbarSeverity] = useState<'success' | 'error'>(
    'success'
  );
  const [subscribeModalOpen, setSubscribeModalOpen] = useState(false);
  const [justSubscribed, setJustSubscribed] = useState(false);
  const [leaveGroupDialogOpen, setLeaveGroupDialogOpen] = useState(false);
  const [leavingGroup, setLeavingGroup] = useState(false);

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
    isMember,
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
  const { priceQort: indexPriceQort } = useSubscriptionIndexPrice(
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

  const kickBanEnabled =
    !!item && !isOwner && !isMember && !!auth?.address && !checkingSubscription;

  // When not in group, check if user is banned (takes precedence over kick)
  const { isBanned, banInfo } = useBannedFromGroup(
    item?.groupId ?? null,
    auth?.address ?? null,
    kickBanEnabled
  );

  // When not in group and not banned, check if user was once a member and was kicked
  const { kickInfo } = useKickedFromSubscription(
    item?.groupId ?? null,
    item?.detailsIdentifier ?? null,
    auth?.address ?? null,
    auth?.name ?? null,
    kickBanEnabled && !isBanned
  );

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
    currentUserExpiresAt != null ? formatExpiry(currentUserExpiresAt, t) : null;

  // Expired = paid period has ended (excludes grace). Show renew CTA when the expiry date has passed.
  const isExpired = expiryDisplay?.isExpired ?? false;
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
  const displayIntervalLabel = 'month';

  const handleOpenSubscribeModal = () => {
    if (!auth?.name || !auth?.address) {
      setSnackbarSeverity('error');
      setSnackbarMsg(t('core:sub_snackbar_must_login'));
      setSnackbarOpen(true);
      return;
    }
    // Check if subscription is disabled
    if (isDisabled) {
      setSnackbarSeverity('error');
      setSnackbarMsg(t('core:sub_snackbar_not_accepting'));
      setSnackbarOpen(true);
      return;
    }
    // Prevent owner from subscribing to their own group
    if (isOwner) {
      setSnackbarSeverity('error');
      setSnackbarMsg(t('core:sub_snackbar_you_owner'));
      setSnackbarOpen(true);
      return;
    }
    // Prevent opening if user is banned
    if (isBanned) {
      setSnackbarSeverity('error');
      setSnackbarMsg(t('core:sub_snackbar_banned'));
      setSnackbarOpen(true);
      return;
    }
    // Prevent opening if user has pending join request
    if (hasPendingJoinRequest) {
      setSnackbarSeverity('error');
      setSnackbarMsg(t('core:sub_snackbar_pending_approval'));
      setSnackbarOpen(true);
      return;
    }
    // Allow opening modal if not subscribed, or needs payment, or expired (renewal)
    if (userIsSubscribed && !userNeedsPayment && !isExpired) {
      setSnackbarSeverity('error');
      setSnackbarMsg(t('core:sub_snackbar_already_subscribed'));
      setSnackbarOpen(true);
      return;
    }
    setSubscribeModalOpen(true);
  };

  const handlePayment = async (intervalCount: number): Promise<string> => {
    if (!item || !auth?.name || !auth?.address) {
      throw new Error('Subscription not found or user not authenticated');
    }

    // Use locked renewal price (original agreed price, unless current price is lower)
    const unitAmount = showRenewCta ? renewalPrice : item.priceQort;
    const amountToPay = unitAmount * Math.max(1, Math.floor(intervalCount));

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
    notifySubscriptionsUpdate();
  };

  const handlePublish = async (paymentSignature: string): Promise<void> => {
    if (!item || !auth?.name || !auth?.address) {
      throw new Error('Missing required data');
    }

    // Resolve index by the actual paid tx amount to avoid stale/mismatched si.
    const indexToPublish = await resolvePaymentIndexIdentifierForPublish({
      ownerName: item.ownerName,
      subscriptionId: item.id,
      paymentTxSignature: paymentSignature,
      lockedIndexIdentifier: existingSubscriptionIndexIdentifier ?? undefined,
      currentIndexIdentifier: item.indexIdentifier,
      identifierOperations,
      lists,
    });

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
    notifySubscriptionsUpdate();
  };

  const handleLeaveGroup = async () => {
    if (!item || !auth?.address) return;
    setLeavingGroup(true);
    try {
      await leaveGroup(item.groupId);
      cachePendingLeaveGroup({
        subscriberAddress: auth.address,
        groupId: item.groupId,
      });
      setLeaveGroupDialogOpen(false);
      setJustSubscribed(false);
      setSnackbarSeverity('success');
      setSnackbarMsg(t('core:sub_snackbar_left_group'));
      setSnackbarOpen(true);
      setRefreshTrigger((prev) => prev + 1);
    } catch (e: any) {
      setSnackbarSeverity('error');
      setSnackbarMsg(e?.message ?? t('core:sub_snackbar_failed_leave'));
      setSnackbarOpen(true);
    } finally {
      setLeavingGroup(false);
    }
  };

  const handleSubscribeComplete = () => {
    setSnackbarSeverity('success');
    setSnackbarMsg(t('core:sub_snackbar_success_subscribed'));
    setSnackbarOpen(true);
    setJustSubscribed(true);
  };

  // Track loading state to prevent concurrent fetches
  useEffect(() => {
    isRefreshingRef.current =
      checkingSubscription || checkingJoinRequests || checkingGroupKeys;
  }, [checkingSubscription, checkingJoinRequests, checkingGroupKeys]);

  const handleRefresh = () => {
    if (!isRefreshingRef.current) {
      setRefreshTrigger((prev) => prev + 1);
      setJustSubscribed(false);
    }
  };

  // Show loading state while fetching
  if (fetchingSubscription) {
    return (
      <Stack spacing={2} alignItems="center" py={4}>
        <Typography variant="h5" fontWeight={800}>
          {t('core:sub_loading')}
        </Typography>
      </Stack>
    );
  }

  // Show error if fetch failed
  if (fetchError && !catalogItem) {
    return (
      <Stack spacing={2}>
        <Typography variant="h5" fontWeight={800} color="error">
          {t('core:sub_failed_load')}
        </Typography>
        <Typography sx={{ opacity: 0.85 }}>{fetchError}</Typography>
        <Box>
          <Button variant="contained" onClick={() => navigate('/')}>
            {t('core:sub_back_home')}
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
          {t('core:sub_not_found')}
        </Typography>
        <Typography sx={{ opacity: 0.85 }}>
          {t('core:sub_not_published')}
        </Typography>
        <Box>
          <Button variant="contained" onClick={() => navigate('/')}>
            {t('core:sub_back_home')}
          </Button>
        </Box>
      </Stack>
    );
  }

  return (
    <Stack spacing={2.5}>
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Button size="small" onClick={() => navigate('/')}>
          {t('core:sub_home_btn')}
        </Button>
        <Tooltip title={t('core:sub_refresh_tooltip')}>
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
          <Chip
            label={`${t('core:sub_owner')}: ${item.ownerName}`}
            variant="outlined"
          />
          <Chip label={item.ownerAddress} variant="outlined" />
          {groupName && (
            <Chip
              label={`${t('core:sub_group')}: ${groupName}`}
              variant="outlined"
              color="primary"
            />
          )}
          <Chip
            label={`${t('core:sub_group_id')}: ${item.groupId}`}
            variant="outlined"
          />
          {groupLoading && (
            <Chip label={t('core:sub_loading_group')} variant="outlined" />
          )}
        </Stack>
      </Stack>

      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
        <Box flex={2}>
          <Card variant="outlined">
            <CardContent>
              <Typography variant="h6" fontWeight={800}>
                {t('core:sub_about')}
              </Typography>
              <Typography sx={{ opacity: 0.85, mt: 0.5 }}>
                {item.description}
              </Typography>

              <Divider sx={{ my: 2 }} />

              <Typography variant="h6" fontWeight={800}>
                {t('core:sub_what_you_get')}
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
                {t('core:sub_subscribe')}
              </Typography>

              <Stack spacing={1} sx={{ mt: 1.5 }}>
                {isBanned && banInfo && (
                  <Alert severity="error">
                    <Typography variant="body2" fontWeight={600}>
                      {t('core:sub_banned_message_intro')}
                    </Typography>
                    <Typography
                      variant="body2"
                      fontWeight={600}
                      sx={{ mt: 1 }}
                      component="div"
                    >
                      {banInfo.reason === 'subscriptions:payment-overdue'
                        ? t('core:sub_reason_payment_overdue')
                        : (banInfo.reason ?? t('core:sub_banned_no_reason'))}
                    </Typography>
                  </Alert>
                )}
                {!isBanned && kickInfo.kicked && (
                  <Alert severity="warning">
                    <Typography variant="body2" fontWeight={600}>
                      {t('core:sub_kicked_message_intro')}
                    </Typography>
                    <Typography
                      variant="body2"
                      fontWeight={600}
                      sx={{ mt: 1 }}
                      component="div"
                    >
                      {kickInfo.reason === 'subscriptions:payment-overdue'
                        ? t('core:sub_reason_payment_overdue')
                        : (kickInfo.reason ?? t('core:sub_kicked_no_reason'))}
                    </Typography>
                  </Alert>
                )}
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
                      {t('core:sub_rate_locked', {
                        locked: displayPrice,
                        current: item.priceQort,
                      })}
                    </Typography>
                  )}

                {isDisabled ? (
                  <Alert severity="info">
                    <Typography variant="body2" fontWeight={600}>
                      {t('core:sub_not_accepting')}
                    </Typography>
                  </Alert>
                ) : hasPendingJoinRequest ? (
                  <Button
                    size="large"
                    variant="outlined"
                    disabled
                    sx={{ color: 'warning.main', borderColor: 'warning.main' }}
                  >
                    {t('core:sub_pending_approval_btn')}
                  </Button>
                ) : isOwner ? (
                  <Button
                    size="large"
                    variant="outlined"
                    disabled
                    sx={{ color: 'info.main', borderColor: 'info.main' }}
                  >
                    {t('core:sub_you_own_group')}
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
                      {t('core:sub_already_subscribed')}
                    </Button>
                    {expiryDisplay && (
                      <Box sx={{ pt: 0.5 }}>
                        <Typography variant="body2" sx={{ opacity: 0.9 }}>
                          {t('core:sub_expires')}: {expiryDisplay.dateText}
                        </Typography>
                        <Typography
                          variant="body2"
                          sx={{
                            opacity: 0.85,
                            fontWeight: 600,
                            color: expiryDisplay.isExpired
                              ? 'error.main'
                              : 'text.secondary',
                          }}
                        >
                          {expiryDisplay.timeLeft}
                        </Typography>
                      </Box>
                    )}
                    <Button
                      size="small"
                      variant="outlined"
                      color="error"
                      onClick={() => setLeaveGroupDialogOpen(true)}
                      sx={{ mt: 0.5 }}
                    >
                      {t('core:sub_leave_group')}
                    </Button>
                  </Stack>
                ) : showRenewCta ? (
                  <Stack spacing={1}>
                    <Button
                      size="large"
                      variant="contained"
                      color="error"
                      onClick={handleOpenSubscribeModal}
                      disabled={checkingSubscription || isBanned}
                    >
                      {checkingSubscription
                        ? t('core:sub_checking')
                        : isExpired
                          ? t('core:sub_pay_subscription')
                          : t('core:sub_payment_required')}
                    </Button>
                    <Button
                      size="small"
                      variant="outlined"
                      color="error"
                      onClick={() => setLeaveGroupDialogOpen(true)}
                    >
                      {t('core:sub_leave_group')}
                    </Button>
                  </Stack>
                ) : (
                  <Button
                    size="large"
                    variant="contained"
                    onClick={handleOpenSubscribeModal}
                    disabled={
                      checkingSubscription || checkingJoinRequests || isBanned
                    }
                  >
                    {checkingSubscription || checkingJoinRequests
                      ? t('core:sub_checking')
                      : t('core:sub_subscribe_btn')}
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
            {t('core:sub_request_pending_title')}
          </Typography>
          <Typography variant="body2">
            {t('core:sub_request_pending_body')}
          </Typography>
        </Alert>
      )}

      {/* Group keys status for subscribed and paid users */}
      {shouldCheckGroupKeys && (
        <Box>
          {checkingGroupKeys ? (
            <Alert severity="info">{t('core:sub_checking_encryption')}</Alert>
          ) : isInGroupKeys ? (
            <Alert severity="success">{t('core:sub_have_access')}</Alert>
          ) : (
            <Alert severity="warning">
              <Typography variant="body2" fontWeight={600} gutterBottom>
                {t('core:sub_waiting_access_title')}
              </Typography>
              <Typography variant="body2">
                {t('core:sub_waiting_access_body')}
              </Typography>
              <Typography variant="body2" component="div" sx={{ mt: 1 }}>
                {t('core:sub_waiting_access_step1')}
                <br />
                {t('core:sub_waiting_access_step2')}
              </Typography>
              <Typography variant="body2" sx={{ mt: 1, opacity: 0.9 }}>
                {t('core:sub_waiting_access_note')}
              </Typography>
            </Alert>
          )}
        </Box>
      )}

      <SubscribeModal
        open={subscribeModalOpen}
        onClose={() => setSubscribeModalOpen(false)}
        subscriptionTitle={item.title}
        unitAmount={showRenewCta ? renewalPrice : item.priceQort}
        intervalLabel={displayIntervalLabel}
        groupId={item.groupId}
        onPayment={handlePayment}
        onJoinGroup={handleJoinGroup}
        onPublish={handlePublish}
        onComplete={handleSubscribeComplete}
        isRenewal={showRenewCta}
      />

      {/* Leave Group confirmation dialog */}
      <Dialog
        open={leaveGroupDialogOpen}
        onClose={() => !leavingGroup && setLeaveGroupDialogOpen(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>
          <Typography variant="h6" fontWeight={800}>
            {t('core:sub_leave_dialog_title')}
          </Typography>
        </DialogTitle>
        <DialogContent>
          <Typography variant="body1" gutterBottom>
            {t('core:sub_leave_confirm')}
          </Typography>
          <Typography variant="body2" sx={{ opacity: 0.8, mt: 1 }}>
            {t('core:sub_leave_warning')}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setLeaveGroupDialogOpen(false)}
            disabled={leavingGroup}
          >
            {t('core:sub_cancel')}
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={handleLeaveGroup}
            disabled={leavingGroup}
          >
            {leavingGroup ? t('core:sub_leaving') : t('core:sub_confirm_leave')}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={snackbarOpen}
        autoHideDuration={3000}
        onClose={() => setSnackbarOpen(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setSnackbarOpen(false)}
          severity={snackbarSeverity}
          variant="filled"
          sx={{ width: '100%' }}
        >
          {snackbarMsg}
        </Alert>
      </Snackbar>
    </Stack>
  );
}
