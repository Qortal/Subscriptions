import {
  Alert,
  Box,
  Button,
  Divider,
  IconButton,
  Stack,
  Tab,
  Tabs,
  Tooltip,
  Typography,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive';
import { useAtom } from 'jotai';
import { useNavigate } from 'react-router-dom';
import { useGlobal } from 'qapp-core';
import { useState } from 'react';
import { homeTabAtom } from '../state/ui';
import { useInitializeManagedSubscriptions } from '../hooks/useInitializeManagedSubscriptions';
import { useInitializeMySubscriptions } from '../hooks/useInitializeMySubscriptions';
import { CurrentSubscriptionCard } from '../components/CurrentSubscriptionCard';
import { SubscriptionCardSkeleton } from '../components/SubscriptionCardSkeleton';
import { ManagedSubscriptionCardSkeleton } from '../components/ManagedSubscriptionCardSkeleton';
import { ManagedSubscriptionCard } from '../components/ManagedSubscriptionCard';
import { useAllManagedSubscriptionActions } from '../hooks/useAllManagedSubscriptionActions';
import { useAllCurrentSubscriptionActions } from '../hooks/useAllCurrentSubscriptionActions';

export function HomePage() {
  const navigate = useNavigate();
  const { auth } = useGlobal();

  const [tab, setTab] = useAtom(homeTabAtom);
  const [refreshKey, setRefreshKey] = useState(0);

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

  const { actions: allActions, loading: actionsLoading } =
    useAllManagedSubscriptionActions(managedSubs);

  const { actions: currentActions, loading: currentActionsLoading } =
    useAllCurrentSubscriptionActions(currentSubs);

  const handleRefresh = () => {
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
            Subscriptions
          </Typography>
          <Typography variant="body1" sx={{ opacity: 0.85 }}>
            {auth?.name ? `Welcome, ${auth.name}. ` : null}
            Manage your subscriptions and discover new content creators.
          </Typography>
        </Box>
        <Tooltip title="Refresh data">
          <IconButton
            onClick={handleRefresh}
            disabled={subsLoading || managedLoading}
          >
            <RefreshIcon />
          </IconButton>
        </Tooltip>
      </Stack>

      {/* Actions notification banner */}
      {!actionsLoading && allActions.totalActions > 0 && (
        <Alert
          severity="warning"
          icon={<NotificationsActiveIcon />}
          action={
            tab !== 1 ? (
              <Button color="inherit" size="small" onClick={() => setTab(1)}>
                View
              </Button>
            ) : undefined
          }
        >
          <Typography variant="body2" fontWeight={600}>
            You have {allActions.totalActions} pending action
            {allActions.totalActions !== 1 ? 's' : ''} on your managed
            subscriptions
          </Typography>
          <Typography variant="caption" sx={{ display: 'block', mt: 0.5 }}>
            {allActions.totalPendingJoinRequests > 0 && (
              <span>
                {allActions.totalPendingJoinRequests} join request
                {allActions.totalPendingJoinRequests !== 1 ? 's' : ''} to review
              </span>
            )}
            {allActions.totalPendingJoinRequests > 0 &&
              allActions.totalNeedingReEncryption > 0 &&
              ' • '}
            {allActions.totalNeedingReEncryption > 0 && (
              <span>
                {allActions.totalNeedingReEncryption} subscription
                {allActions.totalNeedingReEncryption !== 1 ? 's' : ''} need key
                re-encryption
              </span>
            )}
          </Typography>
        </Alert>
      )}

      {/* Current subscriptions payment notification banner */}
      {!currentActionsLoading && currentActions.totalNeedingPayment > 0 && (
        <Alert
          severity="error"
          icon={<NotificationsActiveIcon />}
          action={
            tab !== 0 ? (
              <Button color="inherit" size="small" onClick={() => setTab(0)}>
                View
              </Button>
            ) : undefined
          }
        >
          <Typography variant="body2" fontWeight={600}>
            {currentActions.totalNeedingPayment} subscription
            {currentActions.totalNeedingPayment !== 1 ? 's' : ''}{' '}
            {currentActions.totalNeedingPayment !== 1 ? 'need' : 'needs'}{' '}
            payment
          </Typography>
          <Typography variant="caption" sx={{ display: 'block', mt: 0.5 }}>
            Your payment is due. Please make a payment to maintain access.
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
          aria-label="home tabs"
        >
          <Tab label="Current subscriptions" />
          <Tab label="Managed subscriptions" />
        </Tabs>
        <Divider sx={{ mt: 1 }} />
      </Box>

      {tab === 0 ? (
        <Stack spacing={1.5}>
          <Typography variant="h6" fontWeight={700}>
            Current subscriptions
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
                  : 'You don’t have any subscriptions yet.'}
              </Typography>
            )
          ) : (
            currentSubs.map((s) => (
              <CurrentSubscriptionCard
                key={s.id}
                subscription={s}
                onView={(id) => navigate(`/subscription/${id}`)}
              />
            ))
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
              Managed subscriptions
            </Typography>

            <Button variant="contained" onClick={() => navigate('/create')}>
              Create subscription
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
                  : 'You’re not managing any subscriptions yet.'}
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
    </Stack>
  );
}
