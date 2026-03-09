import { Box, Button, Card, CardActions, CardContent, Chip, Stack, Typography } from '@mui/material';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { MySubscription } from '../types/subscription';

type AnyGroup = Record<string, unknown>;

type TFunc = (key: string, opts?: Record<string, unknown>) => string;

function formatTimeLeft(expiresAtMs: number, t: TFunc): string {
  const now = Date.now();
  const ms = expiresAtMs - now;
  if (ms <= 0) return t('core:card_due');
  const totalMins = Math.floor(ms / (60 * 1000));
  const totalHours = Math.floor(ms / (60 * 60 * 1000));
  const totalDays = Math.floor(ms / (24 * 60 * 60 * 1000));
  const months = Math.floor(totalDays / 30);
  const years = Math.floor(totalDays / 365);

  if (years > 0) {
    const remMonths = Math.floor((totalDays - years * 365) / 30);
    return remMonths > 0
      ? t('core:card_years_months_left', { years, months: remMonths })
      : t(years === 1 ? 'core:card_year_left' : 'core:card_years_left', { years });
  }
  if (months > 0) {
    const remDays = totalDays - months * 30;
    return remDays > 0
      ? t('core:card_months_days_left', { months, days: remDays })
      : t(months === 1 ? 'core:card_month_left' : 'core:card_months_left', { months });
  }
  if (totalDays > 0) {
    const remHours = totalHours - totalDays * 24;
    return remHours > 0
      ? t('core:card_days_hours_left', { days: totalDays, hours: remHours })
      : t(totalDays === 1 ? 'core:card_day_left' : 'core:card_days_left', { days: totalDays });
  }
  if (totalHours > 0) {
    const remMins = totalMins - totalHours * 60;
    return remMins > 0
      ? t('core:card_hours_mins_left', { hours: totalHours, minutes: remMins })
      : t(totalHours === 1 ? 'core:card_hour_left' : 'core:card_hours_left', { hours: totalHours });
  }
  if (totalMins > 0) return t(totalMins === 1 ? 'core:card_min_left' : 'core:card_mins_left', { minutes: totalMins });
  return t('core:card_due');
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
  const { t } = useTranslation(['core']);
  const groupName = getGroupName(s.groupInfo);
  const groupId = getGroupId(s.groupInfo);
  const pendingApproval = isPending(s.groupInfo);

  const [timeLeft, setTimeLeft] = useState<string>(
    () => (expiresAt != null ? formatTimeLeft(expiresAt, t) : '')
  );
  useEffect(() => {
    if (expiresAt == null) return;
    setTimeLeft(formatTimeLeft(expiresAt, t));
    const interval = setInterval(() => setTimeLeft(formatTimeLeft(expiresAt, t)), 60 * 1000);
    return () => clearInterval(interval);
  }, [expiresAt, t]);

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
            <Typography sx={{ opacity: 0.8 }}>{t('core:card_owner')}: {s.ownerName}</Typography>
            {groupName && (
              <Typography sx={{ opacity: 0.7, fontSize: '0.875rem' }}>
                {t('core:card_group')}: {groupName}
                {groupId !== null && ` (ID: ${groupId})`}
              </Typography>
            )}
            {pendingApproval && (
              <Chip
                label={t('core:card_pending_approval')}
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
                  ? t('core:card_not_active')
                  : needsPayment
                    ? t('core:card_payment_required')
                    : timeLeft ? `${t('core:card_next_due')}: ${timeLeft}` : `${t('core:card_next_due')}: ${s.nextPaymentDue}`
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
            {t('core:card_pay_now')}
          </Button>
        )}
        <Button variant="contained" onClick={() => onView(s.id)}>
          {t('core:card_view_subscription')}
        </Button>
      </CardActions>
    </Card>
  );
}


