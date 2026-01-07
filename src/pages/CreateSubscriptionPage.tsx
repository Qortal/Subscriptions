import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Divider,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Snackbar,
  Stack,
  Step,
  StepLabel,
  Stepper,
  TextField,
  Typography,
} from '@mui/material';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGlobal, usePublish } from 'qapp-core';
import { useOwnedGroups } from '../hooks/useOwnedGroups';
import { useInitializeManagedSubscriptions } from '../hooks/useInitializeManagedSubscriptions';
import {
  buildFullDetails,
  buildOnChainIndex,
  buildSubscriptionIdentifiers,
  encodeOnChainIndexData,
  publishSubscription,
  type CreateSubscriptionForm,
} from '../lib/subscriptionPublishing';
import { useTestIdentifiers } from '../constants';
import { cachePendingSubscription } from '../lib/pendingTransactionsCache';

function isValidAmountInput(value: string) {
  // allow "", "1", "1.", "1.2", "1.23" (max 2 decimals)
  return /^\d*(\.\d{0,2})?$/.test(value);
}

function roundTo2(value: number) {
  return Math.round(value * 100) / 100;
}

export function CreateSubscriptionPage() {
  const navigate = useNavigate();
  const { auth, identifierOperations, lists } = useGlobal();
  const { publishMultipleResources } = usePublish();
  const { ownedGroups, loading, error } = useOwnedGroups();
  const { managedSubscriptions, loading: managedLoading } =
    useInitializeManagedSubscriptions();

  const [activeStep, setActiveStep] = useState(0);
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [snackbarMsg, setSnackbarMsg] = useState('Created!');
  const [isPublishing, setIsPublishing] = useState(false);

  const ownerName = auth?.name ?? 'unknown-owner';
  const ownerAddress = auth?.address ?? undefined;

  // Get group IDs that already have subscriptions
  const managedGroupIds = useMemo(() => {
    return managedSubscriptions
      .map((g: any) => {
        const idRaw = g?.groupId ?? g?.id;
        const id =
          typeof idRaw === 'string' && /^\d+$/.test(idRaw)
            ? Number(idRaw)
            : idRaw;
        return typeof id === 'number' && Number.isFinite(id) ? id : null;
      })
      .filter((id): id is number => id !== null);
  }, [managedSubscriptions]);

  // Filter out groups that already have subscriptions
  const availableGroups = useMemo(() => {
    return ownedGroups.filter((g: any) => {
      const idRaw = g?.groupId ?? g?.id;
      const id =
        typeof idRaw === 'string' && /^\d+$/.test(idRaw)
          ? Number(idRaw)
          : idRaw;
      if (typeof id !== 'number' || !Number.isFinite(id)) return false;
      return !managedGroupIds.includes(id);
    });
  }, [ownedGroups, managedGroupIds]);

  const [groupId, setGroupId] = useState<number>(0);
  const group = useMemo(() => {
    const match =
      availableGroups.find(
        (g: any) => Number(g?.groupId ?? g?.id) === groupId
      ) ?? null;
    return match;
  }, [groupId, availableGroups]);

  useEffect(() => {
    const ids = availableGroups
      .map((g: any) => g?.groupId ?? g?.id)
      .map((id: any) =>
        typeof id === 'string' && /^\d+$/.test(id) ? Number(id) : id
      )
      .filter(
        (id: any): id is number => typeof id === 'number' && Number.isFinite(id)
      );

    if (ids.length === 0) return;
    if (ids.includes(groupId)) return;
    setGroupId(ids[0]);
  }, [groupId, availableGroups]);

  const [title, setTitle] = useState('My Premium Subscription');
  const [amountQortInput, setAmountQortInput] = useState('2');
  const [intervalDays] = useState<number>(30); // Fixed to monthly for MVP
  const [graceDays, setGraceDays] = useState<number>(3);
  const [description, setDescription] = useState(
    'Describe your subscription: what it is, who it is for, and how subscribers benefit.'
  );
  const [perksText, setPerksText] = useState(
    'Weekly updates\nPrivate group access\nBonus posts'
  );

  const amountQort = useMemo(() => {
    const trimmed = amountQortInput.trim();
    if (!trimmed) return 1;
    const n = Number(trimmed);
    if (!Number.isFinite(n)) return 1;
    return Math.max(1, roundTo2(n));
  }, [amountQortInput]);

  const subscriptionId = useMemo(() => {
    if (!groupId) return null;
    if (useTestIdentifiers) {
      return `test-subscription-${groupId.toString()}`;
    }
    return `subscription-${groupId.toString()}`;
  }, [groupId]);

  const perks = useMemo(
    () =>
      perksText
        .split('\n')
        .map((p) => p.trim())
        .filter(Boolean),
    [perksText]
  );

  const form: CreateSubscriptionForm | null = useMemo(() => {
    if (!group || !subscriptionId) return null;
    const gidRaw = (group as any)?.groupId ?? (group as any)?.id;
    const gid =
      typeof gidRaw === 'string' && /^\d+$/.test(gidRaw)
        ? Number(gidRaw)
        : gidRaw;
    if (typeof gid !== 'number' || !Number.isFinite(gid)) return null;
    return {
      subscriptionId,
      ownerName,
      ownerAddress,
      groupId: gid,
      groupAccess: 'private',
      title,
      description,
      perks,
      amountQort,
      intervalDays,
      graceDays,
    };
  }, [
    amountQort,
    description,
    graceDays,
    group,
    intervalDays,
    ownerAddress,
    ownerName,
    perks,
    subscriptionId,
    title,
  ]);

  const fullDetails = useMemo(
    () => (form ? buildFullDetails(form) : null),
    [form]
  );

  const steps = ['Choose group', 'Pricing rules', 'Details & publish'];

  const graceOptions = [3, 5, 7] as const;

  const canContinue =
    !!group &&
    title.trim().length > 0 &&
    amountQortInput.trim().length > 0 &&
    amountQort >= 1 &&
    graceOptions.includes(graceDays as (typeof graceOptions)[number]);

  async function handlePublish() {
    if (!form || !fullDetails || !form.subscriptionId) return;

    try {
      setIsPublishing(true);

      if (!auth?.name) {
        throw new Error('A Qortal name is required to publish');
      }
      if (!identifierOperations) {
        throw new Error('Identifier operations unavailable');
      }

      const { detailsIdentifier, indexIdentifier } =
        await buildSubscriptionIdentifiers(
          identifierOperations,
          form.subscriptionId
        );
      const onChainIndex = buildOnChainIndex(form);

      // keep as a quick sanity check / debug hook (publishSubscription also enforces 239 bytes by default)
      encodeOnChainIndexData(onChainIndex);

      await publishSubscription({
        ownerName: auth.name,
        detailsIdentifier,
        indexIdentifier,
        details: fullDetails,
        index: onChainIndex,
        publishMultipleResources,
      });

      // Cache the pending subscription so it shows up immediately even if blockchain hasn't confirmed
      cachePendingSubscription({
        type: 'create',
        subscriptionId: form.subscriptionId,
        groupId: form.groupId,
        ownerName: auth.name,
        ownerAddress: auth.address ?? undefined,
        detailsIdentifier,
        indexIdentifier,
        details: fullDetails,
        index: onChainIndex,
      });

      // Mirror example_app: update local publish cache after publishing so UI sees it immediately.
      lists.updateNewResources([
        {
          qortalMetadata: {
            name: auth.name,
            service: 'DOCUMENT',
            identifier: detailsIdentifier,
            size: 100,
            created: Date.now(),
            updated: Date.now(),
          },
          data: fullDetails,
        },
        {
          qortalMetadata: {
            name: auth.name,
            service: 'DOCUMENT',
            identifier: indexIdentifier,
            size: 100,
            created: Date.now(),
            updated: Date.now(),
          },
          data: onChainIndex,
        },
      ]);

      if (!group) {
        throw new Error('Group not found');
      }

      // Success - data is now published and cached in lists
      // No need to update global state - hooks will fetch fresh data

      setSnackbarMsg('Subscription published.');
      setSnackbarOpen(true);
      navigate(`/manage/${group.groupId}`);
    } catch (e: any) {
      setSnackbarMsg(e?.message ?? 'Failed to create subscription');
      setSnackbarOpen(true);
    } finally {
      setIsPublishing(false);
    }
  }

  return (
    <Stack spacing={2.5}>
      <Box>
        <Button size="small" onClick={() => navigate('/')}>
          ← Home
        </Button>
      </Box>

      <Stack spacing={0.5}>
        <Typography variant="h4" fontWeight={900}>
          Create subscription
        </Typography>
        <Typography sx={{ opacity: 0.8 }}>
          Step 1: choose a private group + publish two records (on-chain index +
          full details).
        </Typography>
      </Stack>

      {error ? <Alert severity="warning">{error}</Alert> : null}
      {!loading && !managedLoading && ownedGroups.length === 0 ? (
        <Alert severity="warning">
          No owned private groups found. Create a private group first, then come
          back here.
        </Alert>
      ) : null}
      {!loading &&
      !managedLoading &&
      ownedGroups.length > 0 &&
      availableGroups.length === 0 ? (
        <Alert severity="info">
          All your owned private groups already have subscriptions. You can
          manage them from the "Managed subscriptions" tab on the home page.
        </Alert>
      ) : null}

      <Card variant="outlined">
        <CardContent>
          <Stepper activeStep={activeStep} alternativeLabel>
            {steps.map((label) => (
              <Step key={label}>
                <StepLabel>{label}</StepLabel>
              </Step>
            ))}
          </Stepper>

          <Divider sx={{ my: 2 }} />

          {activeStep === 0 ? (
            <Stack spacing={2}>
              <Typography variant="h6" fontWeight={800}>
                Choose an owned private group
              </Typography>

              <FormControl
                fullWidth
                disabled={
                  loading || managedLoading || availableGroups.length === 0
                }
              >
                <InputLabel id="group-label">Private group</InputLabel>
                <Select
                  labelId="group-label"
                  label="Private group"
                  value={groupId}
                  onChange={(e) => setGroupId(Number(e.target.value))}
                >
                  {availableGroups
                    .map((g: any) => {
                      const idRaw = g?.groupId ?? g?.id;
                      const id =
                        typeof idRaw === 'string' && /^\d+$/.test(idRaw)
                          ? Number(idRaw)
                          : idRaw;
                      if (typeof id !== 'number' || !Number.isFinite(id))
                        return null;
                      const name =
                        g?.groupName ?? g?.name ?? g?.group ?? 'Unnamed group';
                      return (
                        <MenuItem key={id} value={id}>
                          {String(name)} (#{id})
                        </MenuItem>
                      );
                    })
                    .filter(Boolean)}
                </Select>
              </FormControl>

              <Alert severity="info">
                Subscribers will need to be in this group to access your gated
                content.
              </Alert>
            </Stack>
          ) : null}

          {activeStep === 1 ? (
            <Stack spacing={2}>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <TextField
                  label="Monthly Price (QORT)"
                  type="number"
                  value={amountQortInput}
                  onChange={(e) => {
                    const next = e.target.value;
                    if (next === '' || isValidAmountInput(next)) {
                      setAmountQortInput(next);
                    }
                  }}
                  onBlur={() => {
                    // normalize/clamp on blur
                    setAmountQortInput(String(amountQort));
                  }}
                  helperText="Min 1 QORT, up to 2 decimals"
                  inputProps={{ min: 1, step: 0.01 }}
                  fullWidth
                />
                <FormControl fullWidth>
                  <InputLabel id="grace-label">Grace Period (days)</InputLabel>
                  <Select
                    labelId="grace-label"
                    label="Grace Period (days)"
                    value={graceDays}
                    onChange={(e) => setGraceDays(Number(e.target.value))}
                  >
                    {graceOptions.map((d) => (
                      <MenuItem key={d} value={d}>
                        {d} days
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Stack>

              <Alert severity="info">
                Monthly subscription with a {graceDays}-day grace period after
                payment is due.
              </Alert>
            </Stack>
          ) : null}

          {activeStep === 2 ? (
            <Stack spacing={2}>
              <Typography variant="h6" fontWeight={800}>
                Full details (QDN publish)
              </Typography>

              <TextField
                label="Title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                fullWidth
              />

              <TextField
                label="Description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                fullWidth
                multiline
                minRows={4}
              />

              <TextField
                label="What you get (one perk per line)"
                value={perksText}
                onChange={(e) => setPerksText(e.target.value)}
                fullWidth
                multiline
                minRows={4}
              />
            </Stack>
          ) : null}

          <Divider sx={{ my: 2 }} />

          <Stack direction="row" spacing={1} justifyContent="space-between">
            <Button
              variant="outlined"
              disabled={activeStep === 0}
              onClick={() => setActiveStep((s) => Math.max(0, s - 1))}
            >
              Back
            </Button>

            {activeStep < steps.length - 1 ? (
              <Button
                variant="contained"
                disabled={!canContinue}
                onClick={() =>
                  setActiveStep((s) => Math.min(steps.length - 1, s + 1))
                }
              >
                Continue
              </Button>
            ) : (
              <Button
                variant="contained"
                disabled={!canContinue || isPublishing}
                onClick={handlePublish}
              >
                {isPublishing ? 'Publishing…' : 'Publish & create'}
              </Button>
            )}
          </Stack>
        </CardContent>
      </Card>

      <Snackbar
        open={snackbarOpen}
        autoHideDuration={3000}
        onClose={() => setSnackbarOpen(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setSnackbarOpen(false)}
          severity="info"
          variant="filled"
          sx={{ width: '100%' }}
        >
          {snackbarMsg}
        </Alert>
      </Snackbar>
    </Stack>
  );
}
