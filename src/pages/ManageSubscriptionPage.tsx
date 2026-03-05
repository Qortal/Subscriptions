import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  FormControl,
  FormControlLabel,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Snackbar,
  Skeleton,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import { useAtom } from 'jotai';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useInitializeManagedSubscriptions } from '../hooks/useInitializeManagedSubscriptions';
import { objectToBase64, useGlobal, usePublish } from 'qapp-core';
import {
  buildSubscriptionIdentifiers,
  buildUpdatedDetails,
  getSubscriptionIdForGroup,
  updateSubscription,
  type UpdateSubscriptionForm,
} from '../lib/subscriptionPublishing';
import type { SubscriptionFullDetails } from '../types/subscription';
import { useGroupMembers } from '../hooks/useGroupMembers';
import {
  cachePendingSubscription,
  pendingOwnerActionsAtom,
  type PendingOwnerAction,
} from '../lib/pendingTransactionsCache';
import {
  useFetchPrimaryNames,
  useGetDisplayName,
} from '../hooks/useFetchPrimaryNames';
import { useSubscriberPaymentStatus } from '../hooks/useSubscriberPaymentStatus';
import { useGroupJoinRequests } from '../hooks/useGroupJoinRequests';
import { useValidateJoinRequests } from '../hooks/useValidateJoinRequests';
import { useValidateGroupKeys } from '../hooks/useValidateGroupKeys';
import { inviteToGroup, kickFromGroup } from '../lib/subscriptionPayment';
import { HOURLY_INTERVAL_DAYS, GRACE_20_MIN_DAYS } from '../constants';

const AUTO_REFRESH_INTERVAL = 20 * 1000; // 2 minutes

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

export function ManageSubscriptionPage() {
  const navigate = useNavigate();
  const { groupId: groupIdParam } = useParams();

  const [refreshKey, setRefreshKey] = useState(0);
  const isRefreshingRef = useRef(false);

  const {
    managedSubscriptions: managed,
    loading: managedLoading,
    error: managedError,
  } = useInitializeManagedSubscriptions(refreshKey);

  const { auth, identifierOperations } = useGlobal();
  const { fetchPublish, publishMultipleResources } = usePublish(3, 'JSON');

  // Use atom for reactive owner actions cache
  const [pendingOwnerActions, setPendingOwnerActions] = useAtom(
    pendingOwnerActionsAtom
  );

  const groupId = groupIdParam ? Number(groupIdParam) : null;
  const groupInfo = useMemo(
    () =>
      groupId !== null
        ? (managed.find((g) => getGroupId(g) === groupId) ?? null)
        : null,
    [managed, groupId]
  );
  const subscriptionId = useMemo(
    () => (groupId !== null ? getSubscriptionIdForGroup(groupId) : null),
    [groupId]
  );

  // Fetch group members
  const {
    members,
    memberCount,
    loading: membersLoading,
  } = useGroupMembers(groupId, 0, refreshKey);

  // Get group owner address to exclude from subscriber lists
  const groupOwnerAddress = auth?.address ?? null;

  // Fetch join requests
  const { joinRequests, loading: joinRequestsLoading } = useGroupJoinRequests(
    groupId,
    refreshKey
  );

  // Filter out join requests that have pending invites in cache
  const filteredJoinRequests = useMemo(() => {
    if (!groupId) return joinRequests;

    return joinRequests.filter((request) => {
      // Check if there's a pending invite for this user in the reactive atom
      const pendingInvite = pendingOwnerActions.find(
        (action) =>
          action.type === 'invite' &&
          action.groupId === groupId &&
          action.inviteeAddress === request.joiner &&
          action.expiresAt > Date.now()
      );
      // Only show if there's no pending invite
      return !pendingInvite;
    });
  }, [joinRequests, groupId, pendingOwnerActions]);

  const memberSubscribers = useMemo(
    () =>
      members
        .filter(
          (m) =>
            m.member !== groupOwnerAddress &&
            m.primaryName != null &&
            m.primaryName !== ''
        )
        .map((m) => ({
          address: m.member,
          primaryName: m.primaryName ?? null,
        })),
    [members, groupOwnerAddress]
  );

  // Fetch primary names for join requesters
  const joinRequesterAddresses = useMemo(
    () => filteredJoinRequests.map((jr) => jr.joiner),
    [filteredJoinRequests]
  );
  useFetchPrimaryNames(joinRequesterAddresses);

  const getDisplayName = useGetDisplayName();

  const shouldReEncryptGroupKeys = useValidateGroupKeys(groupId!, refreshKey);

  const [details, setDetails] = useState<SubscriptionFullDetails | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const didInitFormRef = useRef(false);

  const [showUnpaidOnly, setShowUnpaidOnly] = useState(false);

  const [title, setTitle] = useState('');
  const [priceQortInput, setPriceQortInput] = useState<string>('1');
  const [intervalDays, setIntervalDays] = useState<number>(30);
  const [graceDays, setGraceDays] = useState<number>(3);
  const [description, setDescription] = useState('');
  const [perks, setPerks] = useState<string[]>([]);
  const [newPerk, setNewPerk] = useState('');
  const [status, setStatus] = useState<'active' | 'disabled'>('active');
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [snackbarMsg, setSnackbarMsg] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isReencrypting, setIsReencrypting] = useState(false);
  const [isTogglingStatus, setIsTogglingStatus] = useState(false);

  // Get the details identifier for payment validation
  const [detailsIdentifier, setDetailsIdentifier] = useState<string | null>(
    null
  );

  const priceQort = useMemo(() => {
    const trimmed = priceQortInput.trim();
    if (!trimmed) return 1;
    const n = Number(trimmed);
    return Number.isFinite(n) && n >= 0 ? n : 1;
  }, [priceQortInput]);

  useEffect(() => {
    if (subscriptionId && identifierOperations) {
      buildSubscriptionIdentifiers(identifierOperations, subscriptionId).then(
        (ids) => {
          setDetailsIdentifier(ids.detailsIdentifier);
        }
      );
    }
  }, [subscriptionId, identifierOperations]);

  // Check payment status for all subscribers
  const subscriptionStates =
    details && (details as any).states ? (details as any).states : undefined;

  const {
    loading: paymentsLoading,
    isPaid,
    isInGracePeriod,
  } = useSubscriberPaymentStatus(
    memberSubscribers,
    detailsIdentifier,
    auth?.address ?? null,
    auth?.name,
    priceQort,
    subscriptionStates,
    intervalDays,
    graceDays,
    true
  );

  // Validate join requests (check if they've paid and published)
  const { loading: validatingJoinRequests, getValidation } =
    useValidateJoinRequests(joinRequesterAddresses, detailsIdentifier);

  const [invitingUser, setInvitingUser] = useState<string | null>(null);
  const [kickingUser, setKickingUser] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadDetails() {
      if (!subscriptionId) return;
      if (!auth?.name) return;
      if (!identifierOperations) return;

      setDetailsLoading(true);
      setDetailsError(null);
      try {
        const { detailsIdentifier } = await buildSubscriptionIdentifiers(
          identifierOperations,
          subscriptionId
        );

        const res = await fetchPublish({
          name: auth.name,
          service: 'DOCUMENT',
          identifier: detailsIdentifier,
        });

        if (!cancelled) {
          const data = res?.resource?.data as
            | SubscriptionFullDetails
            | undefined;
          setDetails(data ?? null);
        }
      } catch (e: any) {
        if (!cancelled) {
          setDetailsError(e?.message ?? 'Failed to load subscription details');
        }
      } finally {
        if (!cancelled) setDetailsLoading(false);
      }
    }

    loadDetails();
    return () => {
      cancelled = true;
    };
  }, [auth?.name, fetchPublish, identifierOperations, subscriptionId]);

  useEffect(() => {
    if (!details) return;
    if (didInitFormRef.current) return;

    const anyDetails = details as any;
    if (typeof anyDetails.title === 'string') setTitle(anyDetails.title);
    if (typeof anyDetails.description === 'string')
      setDescription(anyDetails.description);

    if (anyDetails.amountQort != null) {
      const n = Number(anyDetails.amountQort);
      if (Number.isFinite(n)) setPriceQortInput(String(n));
    }
    if (typeof anyDetails.intervalDays === 'number') {
      setIntervalDays(anyDetails.intervalDays);
    }
    if (typeof anyDetails.graceDays === 'number') {
      setGraceDays(anyDetails.graceDays);
    }
    if (Array.isArray(anyDetails.perks)) {
      setPerks(anyDetails.perks);
    }
    if (anyDetails.status === 'disabled') {
      setStatus('disabled');
    } else {
      setStatus('active');
    }

    didInitFormRef.current = true;
  }, [details]);

  // Transform members into displayable format (excluding owner and pending kicks)
  const displayMembers = useMemo(() => {
    return members
      .filter((member) => {
        if (member.member === groupOwnerAddress) return false;
        if (member.primaryName == null || member.primaryName === '')
          return false;

        const pendingKick = pendingOwnerActions.find(
          (action) =>
            action.type === 'kick' &&
            action.groupId === groupId &&
            action.kickedAddress === member.member &&
            action.expiresAt > Date.now()
        );

        return !pendingKick;
      })
      .map((member) => ({
        address: member.member,
        name: member.primaryName,
        joined: member.joined,
        isAdmin: member.isAdmin || false,
        isPaidUp: isPaid(member.member),
        isInGrace: isInGracePeriod(member.member),
      }));
  }, [
    members,
    groupOwnerAddress,
    isPaid,
    isInGracePeriod,
    pendingOwnerActions,
    groupId,
  ]);

  const filteredMembers = useMemo(() => {
    if (!showUnpaidOnly) return displayMembers;
    // Filter to show only unpaid members
    return displayMembers.filter((m) => !m.isPaidUp);
  }, [showUnpaidOnly, displayMembers]);

  const paidMembersCount = useMemo(() => {
    return displayMembers.filter((m) => m.isPaidUp && !m.isInGrace).length;
  }, [displayMembers]);

  const graceMembersCount = useMemo(() => {
    return displayMembers.filter((m) => m.isInGrace).length;
  }, [displayMembers]);

  const unpaidMembersCount = useMemo(() => {
    return displayMembers.filter((m) => !m.isPaidUp).length;
  }, [displayMembers]);

  async function handleSaveChanges() {
    if (!details || !subscriptionId || !auth?.name || !identifierOperations) {
      setSnackbarMsg('Missing required data to save changes');
      setSnackbarOpen(true);
      return;
    }

    try {
      setIsSaving(true);

      const updateForm: UpdateSubscriptionForm = {
        existingDetails: details,
        title,
        description,
        perks,
        amountQort: priceQort,
        intervalDays,
        graceDays,
      };

      const result = await updateSubscription({
        ownerName: auth.name,
        subscriptionId,
        identifierOperations,
        updateForm,
        publishMultipleResources,
      });

      // Cache the pending subscription update
      cachePendingSubscription({
        type: 'update',
        subscriptionId,
        groupId: groupId ?? 0,
        ownerName: auth.name,
        ownerAddress: auth.address ?? undefined,
        detailsIdentifier: result.detailsIdentifier,
        indexIdentifier: result.indexIdentifier ?? undefined,
        details: buildUpdatedDetails(updateForm),
      });

      // Reload the details to get the updated version with new states
      const res = await fetchPublish({
        name: auth.name,
        service: 'DOCUMENT',
        identifier: result.detailsIdentifier,
      });

      const updatedDetails = res?.resource?.data as
        | SubscriptionFullDetails
        | undefined;
      if (updatedDetails) {
        setDetails(updatedDetails);
      }

      const msg = result.pricingChanged
        ? 'Subscription updated! A new pricing version was created.'
        : 'Subscription updated!';
      setSnackbarMsg(msg);
      setSnackbarOpen(true);
    } catch (e: any) {
      setSnackbarMsg(e?.message ?? 'Failed to save changes');
      setSnackbarOpen(true);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleInviteUser(address: string) {
    if (groupId === null) {
      setSnackbarMsg('Invalid group ID');
      setSnackbarOpen(true);
      return;
    }

    try {
      setInvitingUser(address);
      await inviteToGroup(groupId, address);

      // Add to pending owner actions atom (reactive)
      if (auth?.address) {
        const now = Date.now();
        const newAction: PendingOwnerAction = {
          type: 'invite',
          groupId,
          ownerAddress: auth.address,
          inviteeAddress: address,
          timestamp: now,
          expiresAt: now + 3 * 60 * 1000, // 3 minutes
        };

        // Remove any existing invite for this user, then add new one
        setPendingOwnerActions((prev) => {
          const filtered = prev.filter(
            (action) =>
              !(
                action.type === 'invite' &&
                action.groupId === groupId &&
                action.inviteeAddress === address
              )
          );
          return [...filtered, newAction];
        });
      }

      setSnackbarMsg(
        `Successfully invited ${getDisplayName(address)} to the group!`
      );
      setSnackbarOpen(true);

      // Refresh data after a short delay
      setTimeout(() => {
        setRefreshKey((prev) => prev + 1);
      }, 2000);
    } catch (e: any) {
      setSnackbarMsg(e?.message ?? 'Failed to invite user');
      setSnackbarOpen(true);
    } finally {
      setInvitingUser(null);
    }
  }

  async function handleReencryptGroupKeys() {
    if (groupId === null) {
      setSnackbarMsg('Invalid group ID');
      setSnackbarOpen(true);
      return;
    }

    try {
      setIsReencrypting(true);
      await qortalRequest({
        action: 'REENCRYPT_GROUP_KEYS',
        groupId: groupId,
      });

      // Add to pending owner actions atom (reactive)
      if (auth?.address) {
        const now = Date.now();
        const newAction: PendingOwnerAction = {
          type: 're-encrypt',
          groupId,
          ownerAddress: auth.address,
          memberCount: memberCount || 0,
          reEncryptTimestamp: now,
          timestamp: now,
          expiresAt: now + 2 * 60 * 1000, // 2 minutes
        };

        // Remove any existing re-encrypt for this group, then add new one
        setPendingOwnerActions((prev) => {
          const filtered = prev.filter(
            (action) =>
              !(action.type === 're-encrypt' && action.groupId === groupId)
          );
          return [...filtered, newAction];
        });
      }

      setSnackbarMsg('Successfully re-encrypted group keys!');
      setSnackbarOpen(true);
    } catch (e: any) {
      setSnackbarMsg(e?.message ?? 'Failed to re-encrypt group keys');
      setSnackbarOpen(true);
    } finally {
      setIsReencrypting(false);
    }
  }

  async function handleKickMember(address: string) {
    if (groupId === null) {
      setSnackbarMsg('Invalid group ID');
      setSnackbarOpen(true);
      return;
    }

    try {
      setKickingUser(address);
      await kickFromGroup(groupId, address, 'Payment overdue');

      // Add to pending owner actions atom (reactive)
      if (auth?.address) {
        const now = Date.now();
        const newAction: PendingOwnerAction = {
          type: 'kick',
          groupId,
          ownerAddress: auth.address,
          kickedAddress: address,
          timestamp: now,
          expiresAt: now + 3 * 60 * 1000, // 3 minutes
        };

        // Remove any existing kick for this user, then add new one
        setPendingOwnerActions((prev) => {
          const filtered = prev.filter(
            (action) =>
              !(
                action.type === 'kick' &&
                action.groupId === groupId &&
                action.kickedAddress === address
              )
          );
          return [...filtered, newAction];
        });
      }

      setSnackbarMsg(
        `Successfully kicked ${getDisplayName(address)} from the group!`
      );
      setSnackbarOpen(true);

      // Refresh data after a short delay
      setTimeout(() => {
        setRefreshKey((prev) => prev + 1);
      }, 2000);
    } catch (e: any) {
      setSnackbarMsg(e?.message ?? 'Failed to kick member');
      setSnackbarOpen(true);
    } finally {
      setKickingUser(null);
    }
  }

  const handleRefresh = () => {
    // Only allow manual refresh if not currently loading
    if (!isRefreshingRef.current) {
      setRefreshKey((prev) => prev + 1);
    }
  };

  // Track loading state to prevent concurrent fetches
  useEffect(() => {
    if (
      managedLoading ||
      membersLoading ||
      joinRequestsLoading ||
      paymentsLoading
    ) {
      isRefreshingRef.current = true;
    } else {
      isRefreshingRef.current = false;
    }
  }, [managedLoading, membersLoading, joinRequestsLoading, paymentsLoading]);

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

  async function handleToggleStatus() {
    if (!details || !subscriptionId || !auth?.name || !identifierOperations) {
      setSnackbarMsg('Missing required data to toggle status');
      setSnackbarOpen(true);
      return;
    }

    const newStatus = status === 'active' ? 'disabled' : 'active';

    try {
      setIsTogglingStatus(true);

      // Build identifiers
      const { detailsIdentifier } = await buildSubscriptionIdentifiers(
        identifierOperations,
        subscriptionId
      );

      // Create updated details
      const updatedDetails: any = {
        ...details,
        status: newStatus,
        disabledAt: newStatus === 'disabled' ? Date.now() : undefined,
      };

      // Publish updated details
      await publishMultipleResources([
        {
          service: 'DOCUMENT',
          name: auth.name,
          identifier: detailsIdentifier,
          data64: await objectToBase64(updatedDetails),
        },
      ]);

      setStatus(newStatus);
      setDetails(updatedDetails);
      setSnackbarMsg(
        `Subscription ${newStatus === 'disabled' ? 'disabled' : 're-enabled'}!`
      );
      setSnackbarOpen(true);

      // Refresh after a short delay
      setTimeout(() => {
        setRefreshKey((prev) => prev + 1);
      }, 1000);
    } catch (e: any) {
      setSnackbarMsg(e?.message ?? 'Failed to update status');
      setSnackbarOpen(true);
    } finally {
      setIsTogglingStatus(false);
    }
  }

  const handleAddPerk = () => {
    if (!newPerk.trim()) return;
    setPerks([...perks, newPerk.trim()]);
    setNewPerk('');
  };

  const handleRemovePerk = (index: number) => {
    setPerks(perks.filter((_, i) => i !== index));
  };

  const handleEditPerk = (index: number, value: string) => {
    const updated = [...perks];
    updated[index] = value;
    setPerks(updated);
  };

  // Only show full-page loader on initial load when we don't have data yet.
  // On interval refresh we keep showing the form and update members/requests in the background.
  const isInitialLoad =
    (managedLoading || detailsLoading) && (!groupInfo || !details);
  if (isInitialLoad) {
    return (
      <Stack spacing={2.5}>
        <Box>
          <Button size="small" onClick={() => navigate('/')}>
            ← Home
          </Button>
        </Box>

        <Stack spacing={1}>
          <Typography variant="h4" fontWeight={900}>
            <Skeleton variant="text" width={260} height={44} />
          </Typography>
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            <Skeleton variant="rounded" width={140} height={32} />
            <Skeleton variant="rounded" width={120} height={32} />
            <Skeleton variant="rounded" width={170} height={32} />
          </Stack>
        </Stack>

        <Card variant="outlined">
          <CardContent>
            <Stack spacing={1.5}>
              <Skeleton variant="text" width={220} height={28} />
              <Skeleton variant="rounded" width="100%" height={56} />
              <Skeleton variant="rounded" width="100%" height={56} />
              <Skeleton variant="rounded" width="100%" height={56} />
              <Skeleton variant="rounded" width="100%" height={96} />
            </Stack>
          </CardContent>
        </Card>
      </Stack>
    );
  }

  if (!groupInfo) {
    return (
      <Stack spacing={2}>
        <Typography variant="h5" fontWeight={800}>
          Managed subscription not found
        </Typography>
        <Typography sx={{ opacity: 0.85 }}>
          {managedError ?? 'Could not find that managed subscription.'}
        </Typography>
        <Box>
          <Button variant="contained" onClick={() => navigate('/')}>
            Back to home
          </Button>
        </Box>
      </Stack>
    );
  }

  const displayTitle = title || getGroupName(groupInfo);
  // Subscriber count should exclude the owner
  const subscriberCount = displayMembers.length;
  const paidCount = paidMembersCount;
  const graceCount = graceMembersCount;
  const unpaidCount = unpaidMembersCount;

  const revenueQort =
    Math.round((paidCount + graceCount) * priceQort * 100) / 100;

  const revenueLabel =
    intervalDays === HOURLY_INTERVAL_DAYS
      ? 'QORT/hr'
      : intervalDays === 1
        ? 'QORT/day'
        : 'QORT/mo';

  return (
    <Stack spacing={2.5}>
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Button size="small" onClick={() => navigate('/')}>
          ← Home
        </Button>
        <Tooltip title="Refresh subscription data">
          <IconButton
            onClick={handleRefresh}
            disabled={membersLoading || joinRequestsLoading || paymentsLoading}
            size="small"
          >
            <RefreshIcon />
          </IconButton>
        </Tooltip>
      </Stack>

      <Stack spacing={1}>
        <Typography variant="h4" fontWeight={900}>
          Manage: {displayTitle}
        </Typography>
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          <Chip label={`${subscriberCount} subscribers`} variant="outlined" />
          <Chip
            label={`${paidCount} paid`}
            variant="outlined"
            color="success"
          />
          {graceCount > 0 && (
            <Chip
              label={`${graceCount} grace period`}
              variant="outlined"
              color="warning"
            />
          )}
          <Chip
            label={`${unpaidCount} unpaid`}
            variant="outlined"
            color={unpaidCount > 0 ? 'error' : 'default'}
          />
          <Chip label={`${revenueQort} ${revenueLabel}`} variant="outlined" />
        </Stack>
      </Stack>

      <Alert severity="info">
        {detailsError
          ? `Details load warning: ${detailsError}`
          : 'Edit your subscription details below and save changes.'}
      </Alert>

      {shouldReEncryptGroupKeys && (
        <Alert
          severity="warning"
          action={
            <Button
              color="error"
              size="small"
              onClick={handleReencryptGroupKeys}
              disabled={isReencrypting}
            >
              {isReencrypting ? 'Re-encrypting...' : 'Re-encrypt Keys'}
            </Button>
          }
        >
          The group encryption keys need to be updated. Please update the group
          keys to ensure all members have proper access.
        </Alert>
      )}

      {status === 'disabled' && (
        <Alert severity="warning">
          <Typography variant="body2" fontWeight={600}>
            This subscription is disabled
          </Typography>
          <Typography variant="body2" sx={{ mt: 0.5 }}>
            New users cannot subscribe, but existing members retain access.
            Re-enable to accept new subscribers.
          </Typography>
        </Alert>
      )}

      <Stack direction={{ xs: 'column', lg: 'row' }} spacing={2}>
        <Box flex={1}>
          <Card variant="outlined">
            <CardContent>
              <Typography variant="h6" fontWeight={800}>
                Subscription details
              </Typography>

              <Stack spacing={1.5} sx={{ mt: 2 }}>
                <TextField
                  label="Title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  fullWidth
                />

                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
                  <TextField
                    label="Price (QORT)"
                    type="number"
                    value={priceQortInput}
                    onChange={(e) => setPriceQortInput(e.target.value)}
                    onBlur={() =>
                      setPriceQortInput(
                        Number.isFinite(priceQort) && priceQort >= 0
                          ? String(priceQort)
                          : '1'
                      )
                    }
                    inputProps={{ min: 0, step: 0.01 }}
                    fullWidth
                  />
                  <FormControl fullWidth>
                    <InputLabel id="interval-label">
                      Billing Interval
                    </InputLabel>
                    <Select
                      labelId="interval-label"
                      label="Billing Interval"
                      value={intervalDays}
                      onChange={(e) => setIntervalDays(Number(e.target.value))}
                    >
                      <MenuItem value={HOURLY_INTERVAL_DAYS}>
                        Hourly (for testing)
                      </MenuItem>
                      <MenuItem value={1}>Daily (1 day)</MenuItem>
                      <MenuItem value={30}>Monthly (30 days)</MenuItem>
                    </Select>
                  </FormControl>
                </Stack>

                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
                  <FormControl fullWidth>
                    <InputLabel id="grace-label">Grace Period</InputLabel>
                    <Select
                      labelId="grace-label"
                      label="Grace Period"
                      value={graceDays}
                      onChange={(e) => setGraceDays(Number(e.target.value))}
                    >
                      {![GRACE_20_MIN_DAYS, 3, 5, 7].includes(graceDays) &&
                        (graceDays < 0.1 ? (
                          <MenuItem value={graceDays}>
                            {Math.round(graceDays * 24 * 60)} min
                          </MenuItem>
                        ) : (
                          <MenuItem value={graceDays}>
                            {graceDays} days
                          </MenuItem>
                        ))}
                      <MenuItem value={GRACE_20_MIN_DAYS}>
                        20 min (for testing)
                      </MenuItem>
                      <MenuItem value={3}>3 days</MenuItem>
                      <MenuItem value={5}>5 days</MenuItem>
                      <MenuItem value={7}>7 days</MenuItem>
                    </Select>
                  </FormControl>
                </Stack>

                <TextField
                  label="Description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  fullWidth
                  multiline
                  minRows={4}
                />

                <Box>
                  <Typography variant="subtitle2" fontWeight={700} gutterBottom>
                    What subscribers get (Perks)
                  </Typography>
                  <Stack spacing={1}>
                    {perks.map((perk, index) => (
                      <Stack
                        key={index}
                        direction="row"
                        spacing={1}
                        alignItems="center"
                      >
                        <TextField
                          value={perk}
                          onChange={(e) =>
                            handleEditPerk(index, e.target.value)
                          }
                          fullWidth
                          size="small"
                          placeholder="Perk description"
                        />
                        <IconButton
                          size="small"
                          color="error"
                          onClick={() => handleRemovePerk(index)}
                        >
                          ×
                        </IconButton>
                      </Stack>
                    ))}
                    <Stack direction="row" spacing={1}>
                      <TextField
                        value={newPerk}
                        onChange={(e) => setNewPerk(e.target.value)}
                        onKeyPress={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddPerk();
                          }
                        }}
                        placeholder="Add a new perk..."
                        size="small"
                        fullWidth
                      />
                      <Button
                        variant="outlined"
                        size="small"
                        onClick={handleAddPerk}
                        disabled={!newPerk.trim()}
                      >
                        Add
                      </Button>
                    </Stack>
                  </Stack>
                </Box>

                <Divider />

                <Box>
                  <Typography variant="subtitle2" fontWeight={700} gutterBottom>
                    Subscription Status
                  </Typography>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={status === 'active'}
                        onChange={handleToggleStatus}
                        disabled={isTogglingStatus}
                        color="success"
                      />
                    }
                    label={
                      <Box>
                        <Typography variant="body2" fontWeight={600}>
                          {status === 'active' ? 'Active' : 'Disabled'}
                        </Typography>
                        <Typography variant="caption" sx={{ opacity: 0.7 }}>
                          {status === 'active'
                            ? 'Accepting new subscribers'
                            : 'Not accepting new subscribers nor payments.'}
                        </Typography>
                      </Box>
                    }
                  />
                </Box>

                <Divider />

                <Stack direction="row" spacing={1}>
                  <Button
                    variant="contained"
                    onClick={handleSaveChanges}
                    disabled={isSaving}
                  >
                    {isSaving ? 'Saving...' : 'Save changes'}
                  </Button>
                  <Button
                    variant="outlined"
                    onClick={() =>
                      subscriptionId &&
                      navigate(`/subscription/${subscriptionId}`)
                    }
                    disabled={!subscriptionId}
                  >
                    View public page
                  </Button>
                </Stack>
              </Stack>
            </CardContent>
          </Card>
        </Box>

        <Box flex={1.25}>
          <Card variant="outlined">
            <CardContent>
              <Stack
                direction={{ xs: 'column', sm: 'row' }}
                spacing={1.5}
                justifyContent="space-between"
                alignItems={{ xs: 'flex-start', sm: 'center' }}
              >
                <Typography variant="h6" fontWeight={800}>
                  Members ({subscriberCount})
                  {paymentsLoading && (
                    <Typography
                      component="span"
                      variant="caption"
                      sx={{ ml: 1, opacity: 0.7 }}
                    >
                      (validating payments...)
                    </Typography>
                  )}
                </Typography>

                <FormControlLabel
                  control={
                    <Switch
                      checked={showUnpaidOnly}
                      onChange={(e) => setShowUnpaidOnly(e.target.checked)}
                    />
                  }
                  label="Unpaid only"
                />
              </Stack>

              <Divider sx={{ my: 2 }} />

              {membersLoading && members.length === 0 ? (
                <Typography sx={{ opacity: 0.8 }}>
                  Loading members...
                </Typography>
              ) : filteredMembers.length === 0 ? (
                <Typography sx={{ opacity: 0.8 }}>
                  {showUnpaidOnly
                    ? 'No unpaid members to show.'
                    : 'No members to show.'}
                </Typography>
              ) : (
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Member</TableCell>
                      <TableCell>Joined</TableCell>
                      <TableCell align="right">Role</TableCell>
                      <TableCell align="right">Status</TableCell>
                      <TableCell align="right">Action</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {filteredMembers.map((m) => {
                      const joinedDate = new Date(m.joined);
                      const isKicking = kickingUser === m.address;
                      return (
                        <TableRow key={m.address} hover>
                          <TableCell>
                            <Typography fontWeight={700}>{m.name}</Typography>
                            {m.name !== m.address && (
                              <Typography variant="body2" sx={{ opacity: 0.7 }}>
                                {m.address}
                              </Typography>
                            )}
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2">
                              {joinedDate.toLocaleDateString()}
                            </Typography>
                          </TableCell>
                          <TableCell align="right">
                            {m.isAdmin ? (
                              <Chip
                                label="Admin"
                                size="small"
                                color="primary"
                                variant="outlined"
                              />
                            ) : (
                              <Chip
                                label="Member"
                                size="small"
                                variant="outlined"
                              />
                            )}
                          </TableCell>
                          <TableCell align="right">
                            <Chip
                              label={
                                m.isPaidUp
                                  ? m.isInGrace
                                    ? 'Grace Period'
                                    : 'Paid'
                                  : 'Unpaid'
                              }
                              size="small"
                              color={
                                m.isPaidUp
                                  ? m.isInGrace
                                    ? 'warning'
                                    : 'success'
                                  : 'error'
                              }
                              variant="outlined"
                            />
                          </TableCell>
                          <TableCell align="right">
                            {!m.isPaidUp && (
                              <Button
                                size="small"
                                variant="outlined"
                                color="error"
                                disabled={isKicking || !!kickingUser}
                                onClick={() => handleKickMember(m.address)}
                              >
                                {isKicking ? 'Kicking...' : 'Kick'}
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* Join Requests Section */}
          <Card variant="outlined" sx={{ mt: 2 }}>
            <CardContent>
              <Stack
                direction={{ xs: 'column', sm: 'row' }}
                spacing={1.5}
                justifyContent="space-between"
                alignItems={{ xs: 'flex-start', sm: 'center' }}
              >
                <Typography variant="h6" fontWeight={800}>
                  Join Requests ({filteredJoinRequests.length})
                  {validatingJoinRequests && (
                    <Typography
                      component="span"
                      variant="caption"
                      sx={{ ml: 1, opacity: 0.7 }}
                    >
                      (validating...)
                    </Typography>
                  )}
                </Typography>
              </Stack>

              <Divider sx={{ my: 2 }} />

              {joinRequestsLoading && joinRequests.length === 0 ? (
                <Typography sx={{ opacity: 0.8 }}>
                  Loading join requests...
                </Typography>
              ) : filteredJoinRequests.length === 0 ? (
                <Typography sx={{ opacity: 0.8 }}>
                  No pending join requests.
                </Typography>
              ) : (
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Requester</TableCell>
                      <TableCell align="center">Payment</TableCell>
                      <TableCell align="center">Published</TableCell>
                      <TableCell align="center">Status</TableCell>
                      <TableCell align="right">Action</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {filteredJoinRequests.map((request) => {
                      const validation = getValidation(request.joiner);
                      const displayName = getDisplayName(request.joiner);
                      const isInviting = invitingUser === request.joiner;

                      return (
                        <TableRow key={request.joiner} hover>
                          <TableCell>
                            <Typography fontWeight={700}>
                              {displayName}
                            </Typography>
                            {displayName !== request.joiner && (
                              <Typography variant="body2" sx={{ opacity: 0.7 }}>
                                {request.joiner}
                              </Typography>
                            )}
                          </TableCell>
                          <TableCell align="center">
                            {validation ? (
                              <Chip
                                label={validation.hasPaid ? 'Paid' : 'Not Paid'}
                                size="small"
                                color={validation.hasPaid ? 'success' : 'error'}
                                variant="outlined"
                              />
                            ) : (
                              <Chip
                                label="Checking..."
                                size="small"
                                variant="outlined"
                              />
                            )}
                          </TableCell>
                          <TableCell align="center">
                            {validation ? (
                              <Chip
                                label={
                                  validation.hasPublishedRecord ? 'Yes' : 'No'
                                }
                                size="small"
                                color={
                                  validation.hasPublishedRecord
                                    ? 'success'
                                    : 'default'
                                }
                                variant="outlined"
                              />
                            ) : (
                              <Chip
                                label="Checking..."
                                size="small"
                                variant="outlined"
                              />
                            )}
                          </TableCell>
                          <TableCell align="center">
                            {validation ? (
                              validation.isValid ? (
                                <Chip
                                  label="✓ Valid"
                                  size="small"
                                  color="success"
                                  variant="filled"
                                />
                              ) : (
                                <Chip
                                  label="✗ Invalid"
                                  size="small"
                                  color="error"
                                  variant="outlined"
                                />
                              )
                            ) : (
                              <Chip
                                label="..."
                                size="small"
                                variant="outlined"
                              />
                            )}
                          </TableCell>
                          <TableCell align="right">
                            <Button
                              size="small"
                              variant="contained"
                              color="primary"
                              disabled={
                                !validation ||
                                !validation.isValid ||
                                isInviting ||
                                !!invitingUser
                              }
                              onClick={() => handleInviteUser(request.joiner)}
                            >
                              {isInviting ? 'Inviting...' : 'Approve & Invite'}
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}

              {filteredJoinRequests.length > 0 && (
                <Alert severity="info" sx={{ mt: 2 }}>
                  Only users who have paid and published their subscription
                  record can be invited to the group.
                </Alert>
              )}
            </CardContent>
          </Card>

          {details &&
            (details as any).states &&
            (details as any).states.length > 0 && (
              <Card variant="outlined" sx={{ mt: 2 }}>
                <CardContent>
                  <Typography variant="h6" fontWeight={800}>
                    Pricing History
                  </Typography>

                  <Divider sx={{ my: 2 }} />

                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Version</TableCell>
                        <TableCell>Price</TableCell>
                        <TableCell>Interval</TableCell>
                        <TableCell>Effective From</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {[...(details as any).states]
                        .sort((a: any, b: any) => b.version - a.version)
                        .map((state: any) => {
                          const effectiveDate = new Date(state.effectiveFrom);
                          const isCurrent =
                            state.version ===
                            (details as any).states[
                              (details as any).states.length - 1
                            ]?.version;

                          return (
                            <TableRow key={state.version} hover>
                              <TableCell>
                                <Stack
                                  direction="row"
                                  spacing={1}
                                  alignItems="center"
                                >
                                  <Typography fontWeight={700}>
                                    v{state.version}
                                  </Typography>
                                  {isCurrent && (
                                    <Chip
                                      label="Current"
                                      size="small"
                                      color="primary"
                                    />
                                  )}
                                </Stack>
                              </TableCell>
                              <TableCell>
                                <Typography fontWeight={600}>
                                  {state.price} QORT
                                </Typography>
                              </TableCell>
                              <TableCell>
                                <Typography
                                  sx={{ textTransform: 'capitalize' }}
                                >
                                  {state.interval.toLowerCase()}
                                </Typography>
                              </TableCell>
                              <TableCell>
                                <Typography variant="body2">
                                  {effectiveDate.toLocaleDateString()}{' '}
                                  {effectiveDate.toLocaleTimeString()}
                                </Typography>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}
        </Box>
      </Stack>

      <Snackbar
        open={snackbarOpen}
        autoHideDuration={2500}
        onClose={() => setSnackbarOpen(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setSnackbarOpen(false)}
          severity={snackbarMsg.includes('Failed') ? 'error' : 'success'}
          variant="filled"
          sx={{ width: '100%' }}
        >
          {snackbarMsg}
        </Alert>
      </Snackbar>
    </Stack>
  );
}
