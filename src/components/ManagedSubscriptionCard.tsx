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
import { useTranslation } from 'react-i18next';
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

function getGroupName(group: AnyGroup, unnamedLabel: string): string {
  const name = group?.groupName;
  if (name) return String(name);
  return unnamedLabel;
}

function intervalDaysToBillingInterval(
  _intervalDays: number
): 'hourly' | 'daily' | 'monthly' | 'yearly' {
  return 'monthly';
}

export function ManagedSubscriptionCard(props: {
  groupInfo: AnyGroup;
  onManage: (groupId: number) => void;
}) {
  const { groupInfo, onManage } = props;
  const { t } = useTranslation(['core']);
  const { auth, identifierOperations } = useGlobal();
  const { fetchPublish } = usePublish(3, 'JSON');
  const [details, setDetails] = useState<SubscriptionFullDetails | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(true);
  const groupId = useMemo(() => getGroupId(groupInfo), [groupInfo]);
  const unnamedLabel = t('core:managed_unnamed_group');
  const subscriptionId = useMemo(
    () => (groupId !== null ? getSubscriptionIdForGroup(groupId) : null),
    [groupId]
  );

  const { actions, loading: actionsLoading } =
    useManagedSubscriptionActions(groupId);

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

  const title = details?.title || getGroupName(groupInfo, unnamedLabel);
  const groupName = getGroupName(groupInfo, unnamedLabel);
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
  const revenueQort = Math.round(gross * 100) / 100;

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
                  label={t('core:managed_card_disabled')}
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
                          {actions.pendingJoinRequests === 1
                            ? t('core:managed_pending_join_requests', {
                                count: actions.pendingJoinRequests,
                              })
                            : t('core:managed_pending_join_requests_plural', {
                                count: actions.pendingJoinRequests,
                              })}
                        </div>
                      )}
                      {actions.needsReEncryption && (
                        <div>{t('core:managed_keys_reencryption')}</div>
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
              {priceQort} QORT /{' '}
              {t(`core:billing_interval_${billingInterval}`, {
                defaultValue: billingInterval,
              })}
            </Typography>
            {groupName && groupName !== title && (
              <Typography sx={{ opacity: 0.7, fontSize: '0.875rem' }}>
                {t('core:card_group')}: {groupName}{' '}
                {groupId !== null && `(ID: ${groupId})`}
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
              label={t('core:managed_subscribers', { count: memberCount })}
              size="small"
              variant="outlined"
            />
            {actionsLoading ? (
              <Skeleton variant="rounded" width={90} height={24} />
            ) : (
              <Chip
                label={t('core:managed_unpaid', { count: unpaidCount })}
                size="small"
                variant="outlined"
                color={unpaidCount > 0 ? 'warning' : 'success'}
              />
            )}
            <Chip
              label={t('core:managed_qort_mo_est', { amount: revenueQort })}
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
          {t('core:managed_manage')}
          {actions.totalActions > 0 &&
            ` (${actions.totalActions === 1 ? t('core:managed_actions', { count: actions.totalActions }) : t('core:managed_actions_plural', { count: actions.totalActions })})`}
        </Button>
      </CardActions>
    </Card>
  );
}
