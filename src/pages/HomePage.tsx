import {
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
import { getSubscriptionIdForGroup } from '../lib/subscriptionPublishing';

export function HomePage() {
  const navigate = useNavigate();
  const { auth } = useGlobal();

  const [tab, setTab] = useAtom(homeTabAtom);
  const [testGroupId, setTestGroupId] = useState('');
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

  const handleGoToSubscription = () => {
    const groupId = parseInt(testGroupId, 10);
    if (!isNaN(groupId)) {
      const subscriptionId = getSubscriptionIdForGroup(groupId);
      navigate(`/subscription/${subscriptionId}`);
    }
  };

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

      {/* Testing tool - Navigate to subscription by groupId */}
      <Box
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
      </Box>

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
