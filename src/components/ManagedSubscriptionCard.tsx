import {
  Badge,
  Box,
  Button,
  Card,
  CardActions,
  CardContent,
  Chip,
  Skeleton,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive';
import { useEffect, useMemo, useState } from 'react';
import { useGlobal, usePublish } from 'qapp-core';
import {
  buildSubscriptionIdentifiers,
  getSubscriptionIdForGroup,
} from '../lib/subscriptionPublishing';
import type { SubscriptionFullDetails } from '../types/subscription';
import { useManagedSubscriptionActions } from '../hooks/useManagedSubscriptionActions';

type AnyGroup = Record<string, unknown>;

function getGroupId(group: AnyGroup): number | null {
  const id = group?.groupId;
  if (typeof id === 'number') return id;
  if (typeof id === 'string') return Number(id);
  return null;
}

function getGroupName(group: AnyGroup): string {
  const name = group?.groupName;
  if (name) return String(name);
  return 'Unnamed group';
}

function intervalDaysToBillingInterval(
  intervalDays: number
): 'hourly' | 'daily' | 'monthly' | 'yearly' {
  if (intervalDays < 0.1) return 'hourly';
  if (intervalDays === 1) return 'daily';
  if (intervalDays >= 365) return 'yearly';
  return 'monthly';
}

export function ManagedSubscriptionCard(props: {
  groupInfo: AnyGroup;
  onManage: (groupId: number) => void;
}) {
  const { groupInfo, onManage } = props;
  const { auth, identifierOperations } = useGlobal();
  const { fetchPublish } = usePublish(3, 'JSON');
  const [details, setDetails] = useState<SubscriptionFullDetails | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(true);
  console.log('groupInfo', groupInfo);
  const groupId = useMemo(() => getGroupId(groupInfo), [groupInfo]);
  const subscriptionId = useMemo(
    () => (groupId !== null ? getSubscriptionIdForGroup(groupId) : null),
    [groupId]
  );

  const { actions, loading: actionsLoading } = useManagedSubscriptionActions(groupId);

  useEffect(() => {
    let cancelled = false;

    async function fetchDetails() {
      if (!subscriptionId || !auth?.name || !identifierOperations) {
        setDetailsLoading(false);
        return;
      }

      setDetailsLoading(true);
      try {
        const { detailsIdentifier } = await buildSubscriptionIdentifiers(
          identifierOperations,
          subscriptionId
        );

        const detailsRes = await fetchPublish({
          name: auth.name,
          service: 'DOCUMENT',
          identifier: detailsIdentifier,
        });

        const data = detailsRes?.resource?.data as
          | SubscriptionFullDetails
          | undefined;

        if (!cancelled) {
          if (data) {
            setDetails(data);
          }
          setDetailsLoading(false);
        }
      } catch (error) {
        console.error('Failed to fetch subscription details:', error);
        if (!cancelled) {
          setDetailsLoading(false);
        }
      }
    }

    fetchDetails();
    return () => {
      cancelled = true;
    };
  }, [subscriptionId, auth?.name, identifierOperations, fetchPublish]);

  const title = details?.title || getGroupName(groupInfo);
  const groupName = getGroupName(groupInfo);
  const priceQort =
    details && 'amountQort' in details && typeof details.amountQort === 'string'
      ? Number(details.amountQort)
      : 1;
  const intervalDays =
    details &&
    'intervalDays' in details &&
    typeof details.intervalDays === 'number'
      ? details.intervalDays
      : 30;
  const billingInterval = intervalDaysToBillingInterval(intervalDays);

  // Member count from API includes the owner, so subtract 1 to get actual subscriber count
  const rawMemberCount =
    typeof (groupInfo as any).memberCount === 'number'
      ? (groupInfo as any).memberCount
      : 0;
  const memberCount = Math.max(0, rawMemberCount - 1); // Exclude the owner

  const gross = memberCount * (Number.isFinite(priceQort) ? priceQort : 0);
  const revenueQort =
    billingInterval === 'yearly'
      ? Math.round((gross / 12) * 100) / 100
      : billingInterval === 'hourly'
        ? Math.round(gross * 24 * 30 * 100) / 100 // Convert to monthly estimate
        : billingInterval === 'daily'
          ? Math.round(gross * 30 * 100) / 100 // Convert to monthly estimate
          : Math.round(gross * 100) / 100;

  // Get unpaid count from actions hook
  const unpaidCount = actions.unpaidMembersCount;

  if (detailsLoading) {
    return (
      <Card variant="outlined">
        <CardContent>
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            spacing={1.5}
            justifyContent="space-between"
            alignItems={{ xs: 'flex-start', sm: 'center' }}
          >
            <Box>
              <Typography variant="h6" fontWeight={800}>
                <Skeleton variant="text" width={180} />
              </Typography>
              <Typography sx={{ opacity: 0.8 }}>
                <Skeleton variant="text" width={140} />
              </Typography>
            </Box>

            <Stack
              direction="row"
              spacing={1}
              alignItems="center"
              flexWrap="wrap"
              useFlexGap
            >
              <Skeleton variant="rounded" width={120} height={24} />
              <Skeleton variant="rounded" width={100} height={24} />
              <Skeleton variant="rounded" width={140} height={24} />
            </Stack>
          </Stack>
        </CardContent>
        <CardActions sx={{ px: 2, pb: 2 }}>
          <Skeleton variant="rounded" width={80} height={36} />
        </CardActions>
      </Card>
    );
  }

  return (
    <Card variant="outlined">
      <CardContent>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={1.5}
          justifyContent="space-between"
          alignItems={{ xs: 'flex-start', sm: 'center' }}
        >
          <Box>
            <Stack direction="row" spacing={1} alignItems="center">
              <Typography variant="h6" fontWeight={800}>
                {title}
              </Typography>
              {(details as any)?.status === 'disabled' && (
                <Chip
                  label="Disabled"
                  size="small"
                  color="warning"
                  variant="filled"
                />
              )}
              {actions.totalActions > 0 && (
                <Tooltip
                  title={
                    <Box>
                      {actions.pendingJoinRequests > 0 && (
                        <div>
                          {actions.pendingJoinRequests} pending join request
                          {actions.pendingJoinRequests !== 1 ? 's' : ''}
                        </div>
                      )}
                      {actions.needsReEncryption && (
                        <div>Keys need re-encryption</div>
                      )}
                    </Box>
                  }
                >
                  <Badge
                    badgeContent={actions.totalActions}
                    color="error"
                    sx={{ '& .MuiBadge-badge': { fontSize: '0.75rem' } }}
                  >
                    <NotificationsActiveIcon color="error" fontSize="small" />
                  </Badge>
                </Tooltip>
              )}
            </Stack>
            <Typography sx={{ opacity: 0.8 }}>
              {priceQort} QORT / {billingInterval}
            </Typography>
            {groupName && groupName !== title && (
              <Typography sx={{ opacity: 0.7, fontSize: '0.875rem' }}>
                Group: {groupName} {groupId !== null && `(ID: ${groupId})`}
              </Typography>
            )}
          </Box>

          <Stack
            direction="row"
            spacing={1}
            alignItems="center"
            flexWrap="wrap"
            useFlexGap
          >
            <Chip
              label={`${memberCount} subscribers`}
              size="small"
              variant="outlined"
            />
            {actionsLoading ? (
              <Skeleton variant="rounded" width={90} height={24} />
            ) : (
              <Chip
                label={`${unpaidCount} unpaid`}
                size="small"
                variant="outlined"
                color={unpaidCount > 0 ? 'warning' : 'success'}
              />
            )}
            <Chip
              label={`${revenueQort} QORT/mo est.`}
              size="small"
              variant="outlined"
            />
          </Stack>
        </Stack>
      </CardContent>
      <CardActions sx={{ px: 2, pb: 2 }}>
        <Button
          variant="contained"
          onClick={() => groupId !== null && onManage(groupId)}
          disabled={groupId === null}
          color={actions.totalActions > 0 ? 'error' : 'primary'}
        >
          Manage
          {actions.totalActions > 0 &&
            ` (${actions.totalActions} action${actions.totalActions !== 1 ? 's' : ''})`}
        </Button>
      </CardActions>
    </Card>
  );
}
