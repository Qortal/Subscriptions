import {
  Alert,
  Box,
  Button,
  Divider,
  IconButton,
  Stack,
  Tab,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive';
import { useAtom } from 'jotai';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useGlobal, usePublish } from 'qapp-core';
import { useEffect, useMemo, useRef, useState } from 'react';
import { homeTabAtom } from '../state/ui';
import { useInitializeManagedSubscriptions } from '../hooks/useInitializeManagedSubscriptions';
import { useInitializeMySubscriptions } from '../hooks/useInitializeMySubscriptions';
import { CurrentSubscriptionCard } from '../components/CurrentSubscriptionCard';
import { SubscriptionCardSkeleton } from '../components/SubscriptionCardSkeleton';
import { ManagedSubscriptionCardSkeleton } from '../components/ManagedSubscriptionCardSkeleton';
import { ManagedSubscriptionCard } from '../components/ManagedSubscriptionCard';
import { useAllManagedSubscriptionActions } from '../hooks/useAllManagedSubscriptionActions';
import { useAllCurrentSubscriptionActions } from '../hooks/useAllCurrentSubscriptionActions';
import { buildSubscriptionIdentifiers } from '../lib/subscriptionPublishing';
import { SubscribeModal } from '../components/SubscribeModal';
import {
  publishSubscriptionRecord,
  sendSubscriptionPayment,
} from '../lib/subscriptionPayment';
import { cachePendingSubscribeAction } from '../lib/pendingTransactionsCache';
import { resolvePaymentIndexIdentifierForPublish } from '../lib/resolvePaymentIndexIdentifier';

const AUTO_REFRESH_INTERVAL = 2 * 60 * 1000; // 2 minutes

type AnyGroup = Record<string, unknown>;

function getGroupId(groupInfo: unknown): number | null {
  if (!groupInfo || typeof groupInfo !== 'object') return null;
  const group = groupInfo as AnyGroup;
  const id = group.groupId || group.id;
  if (typeof id === 'number') return id;
  if (typeof id === 'string') return Number(id);
  return null;
}

function getOwnerAddress(groupInfo: unknown): string | null {
  if (!groupInfo || typeof groupInfo !== 'object') return null;
  const group = groupInfo as AnyGroup;
  const owner = group.ownerAddress || group.owner;
  return typeof owner === 'string' ? owner : null;
}

export function HomePage() {
  const navigate = useNavigate();
  const { t } = useTranslation(['core']);
  const { auth, identifierOperations, lists } = useGlobal();
  const { publishMultipleResources } = usePublish();

  const [tab, setTab] = useAtom(homeTabAtom);
  const [refreshKey, setRefreshKey] = useState(0);
  const [payingSubscriptionId, setPayingSubscriptionId] = useState<
    string | null
  >(null);
  const [testGroupId, setTestGroupId] = useState('');

  const handleOpenSubscriptionByGroupId = () => {
    const id = parseInt(testGroupId.trim(), 10);
    if (!Number.isNaN(id) && id > 0) {
      navigate(`/subscription/subscription-${id}`);
    }
  };
  const isRefreshingRef = useRef(false);

  const {
    mySubscriptions: currentSubs,
    loading: subsLoading,
    error: subsError,
  } = useInitializeMySubscriptions(refreshKey);
  const {
    managedSubscriptions: managedSubs,
    loading: managedLoading,
    error: managedError,
  } = useInitializeManagedSubscriptions(refreshKey);

  const { actions: allActions } = useAllManagedSubscriptionActions(managedSubs);

  const { actions: currentActions } =
    useAllCurrentSubscriptionActions(currentSubs);

  // Subscriptions that need payment and are active (exclude disabled – no action required for those)
  const activeSubscriptionsNeedingPayment = useMemo(
    () =>
      currentSubs.filter(
        (s) =>
          currentActions.subscriptionsWithActions.includes(s.id) &&
          !s.subscriptionDisabled
      ),
    [currentSubs, currentActions.subscriptionsWithActions]
  );
  const activeNeedingPaymentCount = activeSubscriptionsNeedingPayment.length;

  const payingSubscription = useMemo(
    () =>
      payingSubscriptionId
        ? (currentSubs.find((sub) => sub.id === payingSubscriptionId) ?? null)
        : null,
    [currentSubs, payingSubscriptionId]
  );

  // Track loading state to prevent concurrent fetches
  useEffect(() => {
    if (subsLoading || managedLoading) {
      isRefreshingRef.current = true;
    } else {
      isRefreshingRef.current = false;
    }
  }, [subsLoading, managedLoading]);

  // Auto-refresh every 2 minutes
  useEffect(() => {
    const intervalId = setInterval(() => {
      // Only refresh if not currently loading
      if (!isRefreshingRef.current) {
        setRefreshKey((prev) => prev + 1);
      }
    }, AUTO_REFRESH_INTERVAL);

    return () => {
      clearInterval(intervalId);
    };
  }, []);

  const handleRefresh = () => {
    // Only allow manual refresh if not currently loading
    if (!isRefreshingRef.current) {
      setRefreshKey((prev) => prev + 1);
    }
  };

  const handleOpenPayNow = (subscriptionId: string) => {
    if (!auth?.name || !auth?.address) return;
    setPayingSubscriptionId(subscriptionId);
  };

  const handleCardPayment = async (intervalCount: number): Promise<string> => {
    if (!payingSubscription || !auth?.name || !auth?.address) {
      throw new Error('Missing subscription or auth data');
    }

    const ownerAddress = getOwnerAddress(payingSubscription.groupInfo);
    const groupId = getGroupId(payingSubscription.groupInfo);
    if (!ownerAddress || groupId == null) {
      throw new Error('Missing group owner/group id');
    }

    const lockedPrice =
      currentActions.subscriptionDisplayOverrides[payingSubscription.id]
        ?.priceQort;
    // Match SubscriptionPage behavior: charge the lower of locked/current.
    const amountToPay =
      lockedPrice != null
        ? Math.min(lockedPrice, payingSubscription.priceQort)
        : payingSubscription.priceQort;
    const totalAmountToPay =
      amountToPay * Math.max(1, Math.floor(intervalCount));
    const signature = await sendSubscriptionPayment(
      ownerAddress,
      totalAmountToPay
    );
    const { detailsIdentifier } = await buildSubscriptionIdentifiers(
      identifierOperations,
      payingSubscription.id
    );

    cachePendingSubscribeAction({
      subscriberName: auth.name,
      subscriberAddress: auth.address,
      subscriptionId: payingSubscription.id,
      detailsIdentifier,
      groupId,
      ownerAddress,
      paymentTxSignature: signature,
      joinRequestSent: true,
      recordPublished: false,
    });

    return signature;
  };

  const handleCardPublish = async (paymentSignature: string): Promise<void> => {
    if (
      !payingSubscription ||
      !auth?.name ||
      !auth?.address ||
      !identifierOperations
    ) {
      throw new Error('Missing required data');
    }

    const ownerAddress = getOwnerAddress(payingSubscription.groupInfo);
    if (!ownerAddress) {
      throw new Error('Missing owner address');
    }

    const { detailsIdentifier } = await buildSubscriptionIdentifiers(
      identifierOperations,
      payingSubscription.id
    );
    const subscriptionIndexIdentifier =
      await resolvePaymentIndexIdentifierForPublish({
        ownerName: payingSubscription.ownerName,
        subscriptionId: payingSubscription.id,
        paymentTxSignature: paymentSignature,
        lockedIndexIdentifier:
          currentActions.subscriptionPaymentIndexIdentifier[
            payingSubscription.id
          ] ?? undefined,
        identifierOperations,
        lists,
      });
    console.log('subscriptionIndexIdentifier', subscriptionIndexIdentifier);
    await publishSubscriptionRecord({
      subscriberName: auth.name,
      subscriberAddress: auth.address,
      detailsIdentifier,
      subscriptionIndexIdentifier,
      paymentTxSignature: paymentSignature,
      publishMultipleResources,
    });
  };

  const handlePayNowComplete = () => {
    setPayingSubscriptionId(null);
    setRefreshKey((prev) => prev + 1);
  };

  return (
    <Stack spacing={2.5}>
      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="flex-start"
      >
        <Box>
          <Typography variant="h4" fontWeight={800}>
            {t('core:home_title')}
          </Typography>
          <Typography variant="body1" sx={{ opacity: 0.85 }}>
            {auth?.name ? t('core:home_welcome_name', { name: auth.name }) : null}
            {t('core:home_welcome_manage')}
          </Typography>
        </Box>
        <Tooltip title={t('core:home_refresh_data')}>
          <IconButton
            onClick={handleRefresh}
            disabled={subsLoading || managedLoading}
          >
            <RefreshIcon />
          </IconButton>
        </Tooltip>
      </Stack>

      {/* Test: open subscription by group ID */}
      <Stack
        direction="row"
        spacing={1}
        alignItems="center"
        sx={{ flexWrap: 'wrap', gap: 1 }}
      >
        <Typography variant="body2" sx={{ opacity: 0.8 }}>
          {t('core:home_test')}
        </Typography>
        <TextField
          size="small"
          placeholder={t('core:home_group_id')}
          type="number"
          value={testGroupId}
          onChange={(e) => setTestGroupId(e.target.value)}
          inputProps={{ min: 1, step: 1 }}
          sx={{ width: 120 }}
        />
        <Button
          size="small"
          variant="outlined"
          onClick={handleOpenSubscriptionByGroupId}
          disabled={
            !testGroupId.trim() ||
            !Number.isInteger(Number(testGroupId.trim())) ||
            Number(testGroupId.trim()) <= 0
          }
        >
          {t('core:home_open_as_subscriber')}
        </Button>
      </Stack>

      {/* Actions notification banner */}
      {allActions.totalActions > 0 && (
        <Alert
          severity="warning"
          icon={<NotificationsActiveIcon />}
          action={
            tab !== 1 ? (
              <Button color="inherit" size="small" onClick={() => setTab(1)}>
                {t('core:home_view')}
              </Button>
            ) : undefined
          }
        >
          <Typography variant="body2" fontWeight={600}>
            {allActions.totalActions === 1
              ? t('core:home_pending_actions', { count: allActions.totalActions })
              : t('core:home_pending_actions_plural', { count: allActions.totalActions })}
          </Typography>
          <Typography variant="caption" sx={{ display: 'block', mt: 0.5 }}>
            {allActions.totalPendingJoinRequests > 0 && (
              <span>
                {allActions.totalPendingJoinRequests === 1
                  ? t('core:home_join_requests_to_review', { count: allActions.totalPendingJoinRequests })
                  : t('core:home_join_requests_to_review_plural', { count: allActions.totalPendingJoinRequests })}
              </span>
            )}
            {allActions.totalPendingJoinRequests > 0 &&
              allActions.totalNeedingReEncryption > 0 &&
              ' • '}
            {allActions.totalNeedingReEncryption > 0 && (
              <span>
                {allActions.totalNeedingReEncryption === 1
                  ? t('core:home_need_re_encryption', { count: allActions.totalNeedingReEncryption })
                  : t('core:home_need_re_encryption_plural', { count: allActions.totalNeedingReEncryption })}
              </span>
            )}
          </Typography>
        </Alert>
      )}

      {/* Subscriptions I'm in - payment notification banner (only for active subscriptions) */}
      {activeNeedingPaymentCount > 0 && (
        <Alert
          severity="error"
          icon={<NotificationsActiveIcon />}
          action={
            tab !== 0 ? (
              <Button color="inherit" size="small" onClick={() => setTab(0)}>
                {t('core:home_view')}
              </Button>
            ) : undefined
          }
        >
          <Typography variant="body2" fontWeight={600}>
            {activeNeedingPaymentCount === 1
              ? t('core:home_subscriptions_need_payment', { count: activeNeedingPaymentCount })
              : t('core:home_subscriptions_need_payment_plural', { count: activeNeedingPaymentCount })}
          </Typography>
          <Typography variant="caption" sx={{ display: 'block', mt: 0.5 }}>
            {t('core:home_payment_due_message')}
          </Typography>
        </Alert>
      )}

      {/* Testing tool - Navigate to subscription by groupId */}
      {/* <Box
        sx={{
          p: 2,
          backgroundColor: 'rgba(255, 165, 0, 0.1)',
          borderRadius: 1,
          border: '1px dashed orange',
        }}
      >
        <Typography variant="subtitle2" fontWeight={700} gutterBottom>
          🧪 Testing Tool
        </Typography>
        <Stack direction="row" spacing={1} alignItems="center">
          <TextField
            label="Group ID"
            placeholder="e.g. 123"
            size="small"
            value={testGroupId}
            onChange={(e) => setTestGroupId(e.target.value)}
            type="number"
            sx={{ flex: 1, maxWidth: 200 }}
          />
          <Button
            variant="outlined"
            size="small"
            onClick={handleGoToSubscription}
            disabled={!testGroupId || isNaN(parseInt(testGroupId, 10))}
          >
            Go to Subscription
          </Button>
        </Stack>
      </Box> */}

      <Box>
        <Tabs
          value={tab}
          onChange={(_, next) => setTab(next)}
          aria-label={t('core:home_tabs_aria')}
        >
          <Tab label={t('core:home_tab_im_in')} />
          <Tab label={t('core:home_tab_manage')} />
        </Tabs>
        <Divider sx={{ mt: 1 }} />
      </Box>

      {tab === 0 ? (
        <Stack spacing={1.5}>
          <Typography variant="h6" fontWeight={700}>
            {t('core:home_subscriptions_im_in')}
          </Typography>

          {currentSubs.length === 0 ? (
            subsLoading ? (
              <Stack spacing={1.5}>
                {Array.from({ length: 3 }).map((_, i) => (
                  <SubscriptionCardSkeleton key={`sub-skel-${i}`} />
                ))}
              </Stack>
            ) : (
              <Typography sx={{ opacity: 0.8 }}>
                {subsError
                  ? subsError
                  : t('core:home_no_subscriptions_yet')}
              </Typography>
            )
          ) : (
            currentSubs.map((s) => {
              const override =
                currentActions.subscriptionDisplayOverrides?.[s.id];
              const expiresAt = currentActions.subscriptionExpiresAt?.[s.id];
              return (
                <CurrentSubscriptionCard
                  key={s.id}
                  subscription={s}
                  onView={(id) => navigate(`/subscription/${id}`)}
                  onPayNow={handleOpenPayNow}
                  payNowDisabled={!auth?.name || !auth?.address}
                  needsPayment={currentActions.subscriptionsWithActions.includes(
                    s.id
                  )}
                  displayPriceQort={override?.priceQort}
                  displayBillingInterval={override?.billingInterval}
                  expiresAt={expiresAt}
                />
              );
            })
          )}
        </Stack>
      ) : (
        <Stack spacing={1.5}>
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            spacing={1}
            justifyContent="space-between"
            alignItems={{ xs: 'flex-start', sm: 'center' }}
          >
            <Typography variant="h6" fontWeight={700}>
              {t('core:home_subscriptions_manage')}
            </Typography>

            <Button variant="contained" onClick={() => navigate('/create')}>
              {t('core:home_create_subscription')}
            </Button>
          </Stack>

          {managedSubs.length === 0 ? (
            managedLoading ? (
              <Stack spacing={1.5}>
                {Array.from({ length: 3 }).map((_, i) => (
                  <ManagedSubscriptionCardSkeleton key={`managed-skel-${i}`} />
                ))}
              </Stack>
            ) : (
              <Typography sx={{ opacity: 0.8 }}>
                {managedError
                  ? managedError
                  : t('core:home_not_managing_yet')}
              </Typography>
            )
          ) : (
            managedSubs.map((groupInfo) => {
              const groupId =
                typeof groupInfo.groupId === 'number'
                  ? groupInfo.groupId
                  : typeof groupInfo.groupId === 'string'
                    ? Number(groupInfo.groupId)
                    : null;
              const key = groupId !== null ? `group-${groupId}` : Math.random();
              return (
                <ManagedSubscriptionCard
                  key={key}
                  groupInfo={groupInfo}
                  onManage={(gid) => navigate(`/manage/${gid}`)}
                />
              );
            })
          )}
        </Stack>
      )}
      {payingSubscription && (
        <SubscribeModal
          open={!!payingSubscription}
          onClose={() => setPayingSubscriptionId(null)}
          subscriptionTitle={payingSubscription.title}
          unitAmount={
            currentActions.subscriptionDisplayOverrides[payingSubscription.id]
              ?.priceQort != null
              ? Math.min(
                  currentActions.subscriptionDisplayOverrides[
                    payingSubscription.id
                  ].priceQort,
                  payingSubscription.priceQort
                )
              : payingSubscription.priceQort
          }
          intervalLabel={(() => {
            const bi =
              currentActions.subscriptionDisplayOverrides[payingSubscription.id]
                ?.billingInterval ?? payingSubscription.billingInterval;
            return bi === 'hourly'
              ? 'hour'
              : bi === 'daily'
                ? 'day'
                : bi === 'yearly'
                  ? 'year'
                  : 'month';
          })()}
          groupId={getGroupId(payingSubscription.groupInfo) ?? 0}
          onPayment={handleCardPayment}
          onJoinGroup={async () => {}}
          onPublish={handleCardPublish}
          onComplete={handlePayNowComplete}
          isRenewal
        />
      )}
    </Stack>
  );
}
