import { Box, Button, Card, CardActions, CardContent, Chip, Stack, Typography } from '@mui/material';
import { useEffect, useState } from 'react';
import type { MySubscription } from '../types/subscription';

type AnyGroup = Record<string, unknown>;

function formatTimeLeft(expiresAtMs: number): string {
  const now = Date.now();
  const ms = expiresAtMs - now;
  if (ms <= 0) return 'Due';
  const totalMins = Math.floor(ms / (60 * 1000));
  const totalHours = Math.floor(ms / (60 * 60 * 1000));
  const totalDays = Math.floor(ms / (24 * 60 * 60 * 1000));
  const months = Math.floor(totalDays / 30);
  const years = Math.floor(totalDays / 365);

  if (years > 0) {
    const remMonths = Math.floor((totalDays - years * 365) / 30);
    return remMonths > 0
      ? `${years}y ${remMonths}mo left`
      : `${years} year${years !== 1 ? 's' : ''} left`;
  }
  if (months > 0) {
    const remDays = totalDays - months * 30;
    return remDays > 0
      ? `${months}mo ${remDays}d left`
      : `${months} month${months !== 1 ? 's' : ''} left`;
  }
  if (totalDays > 0) {
    const remHours = totalHours - totalDays * 24;
    return remHours > 0
      ? `${totalDays}d ${remHours}h left`
      : `${totalDays} day${totalDays !== 1 ? 's' : ''} left`;
  }
  if (totalHours > 0) {
    const remMins = totalMins - totalHours * 60;
    return remMins > 0
      ? `${totalHours}h ${remMins}m left`
      : `${totalHours} hour${totalHours !== 1 ? 's' : ''} left`;
  }
  if (totalMins > 0) return `${totalMins} min${totalMins !== 1 ? 's' : ''} left`;
  return 'Due';
}

function getGroupName(groupInfo: unknown): string | null {
  if (!groupInfo || typeof groupInfo !== 'object') return null;
  const group = groupInfo as AnyGroup;
  const name = group?.groupName || group?.name;
  if (name && typeof name === 'string') return name;
  return null;
}

function getGroupId(groupInfo: unknown): number | null {
  if (!groupInfo || typeof groupInfo !== 'object') return null;
  const group = groupInfo as AnyGroup;
  const id = group?.groupId || group?.id;
  if (typeof id === 'number') return id;
  if (typeof id === 'string') return Number(id);
  return null;
}

function isPending(groupInfo: unknown): boolean {
  if (!groupInfo || typeof groupInfo !== 'object') return false;
  const group = groupInfo as AnyGroup;
  return group?.isPending === true;
}

export function CurrentSubscriptionCard(props: {
  subscription: MySubscription;
  onView: (id: string) => void;
  onPayNow?: (id: string) => void;
  payNowDisabled?: boolean;
  needsPayment?: boolean;
  /** When set, show this (locked-in from PRODUCT si) instead of subscription.priceQort / billingInterval */
  displayPriceQort?: number;
  displayBillingInterval?: string;
  /** When set, show "X mins/hours/days left" instead of nextPaymentDue date */
  expiresAt?: number;
}) {
  const {
    subscription: s,
    onView,
    onPayNow,
    payNowDisabled,
    needsPayment,
    displayPriceQort,
    displayBillingInterval,
    expiresAt,
  } = props;
  const groupName = getGroupName(s.groupInfo);
  const groupId = getGroupId(s.groupInfo);
  const pendingApproval = isPending(s.groupInfo);

  const [timeLeft, setTimeLeft] = useState<string>(
    () => (expiresAt != null ? formatTimeLeft(expiresAt) : '')
  );
  useEffect(() => {
    if (expiresAt == null) return;
    setTimeLeft(formatTimeLeft(expiresAt));
    const interval = setInterval(() => setTimeLeft(formatTimeLeft(expiresAt)), 60 * 1000);
    return () => clearInterval(interval);
  }, [expiresAt]);

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
              {s.title}
            </Typography>
            <Typography sx={{ opacity: 0.8 }}>Owner: {s.ownerName}</Typography>
            {groupName && (
              <Typography sx={{ opacity: 0.7, fontSize: '0.875rem' }}>
                Group: {groupName}
                {groupId !== null && ` (ID: ${groupId})`}
              </Typography>
            )}
            {pendingApproval && (
              <Chip
                label="⏳ Pending Approval"
                color="warning"
                size="small"
                sx={{ mt: 1 }}
              />
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
              label={s.status}
              color={
                s.status === 'active'
                  ? 'success'
                  : s.status === 'paused'
                    ? 'warning'
                    : 'default'
              }
              variant="outlined"
              size="small"
            />
            <Chip
              label={`${displayPriceQort ?? s.priceQort} QORT / ${displayBillingInterval ?? s.billingInterval}`}
              size="small"
              variant="outlined"
            />
            <Chip
              label={
                s.subscriptionDisabled
                  ? 'Not active'
                  : needsPayment
                    ? 'Payment required'
                    : timeLeft ? `Next due: ${timeLeft}` : `Next due: ${s.nextPaymentDue}`
              }
              size="small"
              variant="outlined"
              color={
                s.subscriptionDisabled
                  ? 'default'
                  : needsPayment
                    ? 'error'
                    : 'default'
              }
            />
          </Stack>
        </Stack>
      </CardContent>
      <CardActions sx={{ px: 2, pb: 2 }}>
        {!s.subscriptionDisabled && needsPayment && onPayNow && (
          <Button
            variant="contained"
            color="error"
            onClick={() => onPayNow(s.id)}
            disabled={payNowDisabled}
          >
            Pay now
          </Button>
        )}
        <Button variant="contained" onClick={() => onView(s.id)}>
          View subscription
        </Button>
      </CardActions>
    </Card>
  );
}


