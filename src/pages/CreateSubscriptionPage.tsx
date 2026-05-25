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
import { useTranslation } from 'react-i18next';
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
import {
  useTestIdentifiers,
} from '../constants';
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
  const { t } = useTranslation(['core']);
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

  const [title, setTitle] = useState('');
  const [amountQortInput, setAmountQortInput] = useState('10');
  const intervalDays = 30;
  const [graceDays, setGraceDays] = useState<number>(3);
  const [description, setDescription] = useState('');
  const [perksText, setPerksText] = useState('');

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

  const steps = [t('core:create_step_choose_group'), t('core:create_step_pricing'), t('core:create_step_details')];

  const graceOptions = [3, 5, 7] as const;

  const isPriceValid =
    amountQortInput.trim() !== '' &&
    (() => {
      const n = Number(amountQortInput.trim());
      return Number.isFinite(n) && n > 0;
    })();

  const canContinue =
    !!group &&
    (activeStep === 0 ||
      (isPriceValid &&
        amountQort >= 1 &&
        graceOptions.includes(graceDays as (typeof graceOptions)[number]) &&
        (activeStep < steps.length - 1 ||
          (title.trim().length > 0 && description.trim().length > 0))));

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

      setSnackbarMsg(t('core:create_snackbar_created'));
      setSnackbarOpen(true);
      navigate(`/manage/${group.groupId}`);
    } catch (e: any) {
      setSnackbarMsg(e?.message ?? t('core:create_snackbar_failed'));
      setSnackbarOpen(true);
    } finally {
      setIsPublishing(false);
    }
  }

  return (
    <Stack spacing={2.5}>
      <Box
        sx={(theme) => ({
          backgroundColor: theme.palette.background.paper,
          border: `1px solid ${theme.palette.border.subtle}`,
          borderRadius: '8px',
          p: 1,
        })}
      >
        <Button size="small" onClick={() => navigate('/')}>
          {t('core:create_home_btn')}
        </Button>
      </Box>

      <Stack
        spacing={0.5}
        sx={(theme) => ({
          backgroundColor: theme.palette.background.paper,
          border: `1px solid ${theme.palette.border.subtle}`,
          borderRadius: '8px',
          p: { xs: 2, sm: 2.5 },
        })}
      >
        <Typography variant="h4" fontWeight={900}>
          {t('core:create_title')}
        </Typography>
        <Typography color="text.secondary" variant="body2">
          {t('core:create_step_intro')}
        </Typography>
      </Stack>

      {error ? <Alert severity="warning">{error}</Alert> : null}
      {!loading && !managedLoading && ownedGroups.length === 0 ? (
        <Alert severity="warning">
          {t('core:create_no_owned_groups')}
        </Alert>
      ) : null}
      {!loading &&
      !managedLoading &&
      ownedGroups.length > 0 &&
      availableGroups.length === 0 ? (
        <Alert severity="info">
          {t('core:create_all_have_subscriptions')}
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
                {t('core:create_choose_group_title')}
              </Typography>

              <FormControl
                fullWidth
                disabled={
                  loading || managedLoading || availableGroups.length === 0
                }
              >
                <InputLabel id="group-label">{t('core:create_private_group')}</InputLabel>
                <Select
                  labelId="group-label"
                  label={t('core:create_private_group')}
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
                        g?.groupName ?? g?.name ?? g?.group ?? t('core:create_unnamed_group');
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
                {t('core:create_subscribers_need_group')}
              </Alert>
            </Stack>
          ) : null}

          {activeStep === 1 ? (
            <Stack spacing={2}>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <TextField
                  label={t('core:create_price_qort')}
                  type="number"
                  value={amountQortInput}
                  onChange={(e) => {
                    const next = e.target.value;
                    if (next === '' || isValidAmountInput(next)) {
                      setAmountQortInput(next);
                    }
                  }}
                  onBlur={() => {
                    setAmountQortInput(String(amountQort));
                  }}
                  helperText={t('core:create_min_qort')}
                  inputProps={{ min: 1, step: 0.01 }}
                  fullWidth
                />
                <TextField
                  label={t('core:create_billing_interval')}
                  value={t('core:create_monthly_30')}
                  disabled
                  fullWidth
                />
              </Stack>

              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <FormControl fullWidth>
                  <InputLabel id="grace-label">{t('core:create_grace_period')}</InputLabel>
                  <Select
                    labelId="grace-label"
                    label={t('core:create_grace_period')}
                    value={graceDays}
                    onChange={(e) => setGraceDays(Number(e.target.value))}
                  >
                    {[3, 5, 7].map((d) => (
                      <MenuItem key={d} value={d}>
                        {t('core:create_days', { count: d })}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Stack>

              <Alert severity="info">
                {t('core:create_billing_grace_info', {
                  interval: 'monthly',
                  grace: `${graceDays}-day`,
                })}
              </Alert>
            </Stack>
          ) : null}

          {activeStep === 2 ? (
            <Stack spacing={2}>
              <Typography variant="h6" fontWeight={800}>
                {t('core:create_full_details_title')}
              </Typography>

              <TextField
                label={t('core:create_title_label')}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                fullWidth
              />

              <TextField
                label={t('core:create_description_label')}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                fullWidth
                multiline
                minRows={4}
              />

              <TextField
                label={t('core:create_perks_label')}
                value={perksText}
                onChange={(e) => setPerksText(e.target.value)}
                fullWidth
                multiline
                minRows={4}
              />
            </Stack>
          ) : null}

          <Divider sx={{ my: 2 }} />

          <Stack
            direction={{ xs: 'column-reverse', sm: 'row' }}
            spacing={1}
            justifyContent="space-between"
          >
            <Button
              variant="outlined"
              disabled={activeStep === 0}
              onClick={() => setActiveStep((s) => Math.max(0, s - 1))}
            >
              {t('core:create_back')}
            </Button>

            {activeStep < steps.length - 1 ? (
              <Button
                variant="contained"
                disabled={!canContinue}
                onClick={() =>
                  setActiveStep((s) => Math.min(steps.length - 1, s + 1))
                }
              >
                {t('core:create_continue')}
              </Button>
            ) : (
              <Button
                variant="contained"
                disabled={!canContinue || isPublishing}
                onClick={handlePublish}
              >
                {isPublishing ? t('core:create_publishing') : t('core:create_publish_btn')}
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
