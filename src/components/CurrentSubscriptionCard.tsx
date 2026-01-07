import { Box, Button, Card, CardActions, CardContent, Chip, Stack, Typography } from '@mui/material';
import type { MySubscription } from '../types/subscription';

type AnyGroup = Record<string, unknown>;

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
}) {
  const { subscription: s, onView } = props;
  const groupName = getGroupName(s.groupInfo);
  const groupId = getGroupId(s.groupInfo);
  const pendingApproval = isPending(s.groupInfo);

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
              label={`${s.priceQort} QORT / ${s.billingInterval}`}
              size="small"
              variant="outlined"
            />
            <Chip
              label={`Next due: ${s.nextPaymentDue}`}
              size="small"
              variant="outlined"
            />
          </Stack>
        </Stack>
      </CardContent>
      <CardActions sx={{ px: 2, pb: 2 }}>
        <Button variant="contained" onClick={() => onView(s.id)}>
          View subscription
        </Button>
      </CardActions>
    </Card>
  );
}


