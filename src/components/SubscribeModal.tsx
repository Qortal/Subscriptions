import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  Step,
  StepLabel,
  Stepper,
  Typography,
} from '@mui/material';
import { useState } from 'react';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import AddIcon from '@mui/icons-material/Add';
import RemoveIcon from '@mui/icons-material/Remove';

type SubscriptionStep = 'payment' | 'joinGroup' | 'publish' | 'complete';

interface SubscribeModalProps {
  open: boolean;
  onClose: () => void;
  subscriptionTitle: string;
  unitAmount: number;
  /** e.g. "month", "hour", "day", "year" - used for "Pay for 2 months" copy */
  intervalLabel: string;
  groupId: number;
  onPayment: (intervalCount: number) => Promise<string>; // Returns payment signature
  onJoinGroup: () => Promise<void>; // Join group request
  onPublish: (paymentSignature: string) => Promise<void>;
  onComplete?: () => void; // Optional callback when subscription is complete
  isRenewal?: boolean; // If true, skip join group step (user is already a member)
  defaultIntervalCount?: number;
}

export function SubscribeModal({
  open,
  onClose,
  subscriptionTitle,
  unitAmount,
  intervalLabel,
  groupId,
  onPayment,
  onJoinGroup,
  onPublish,
  onComplete,
  isRenewal = false,
  defaultIntervalCount = 1,
}: SubscribeModalProps) {
  const [currentStep, setCurrentStep] = useState<SubscriptionStep>('payment');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paymentSignature, setPaymentSignature] = useState<string | null>(null);
  const [intervalCount, setIntervalCount] = useState<number>(defaultIntervalCount);
  const totalAmount = unitAmount * intervalCount;

  const steps = isRenewal
    ? ['Payment', 'Publish Record', 'Complete']
    : ['Payment', 'Join Group', 'Publish Record', 'Complete'];

  const handlePayment = async () => {
    setIsProcessing(true);
    setError(null);

    try {
      const signature = await onPayment(intervalCount);
      setPaymentSignature(signature);
      // Skip join group step if this is a renewal
      setCurrentStep(isRenewal ? 'publish' : 'joinGroup');
    } catch (err: any) {
      setError(err?.message ?? 'Payment failed');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleJoinGroup = async () => {
    setIsProcessing(true);
    setError(null);

    try {
      await onJoinGroup();
      setCurrentStep('publish');
    } catch (err: any) {
      setError(err?.message ?? 'Failed to send join group request');
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePublish = async () => {
    if (!paymentSignature) {
      setError('No payment signature found');
      return;
    }

    setIsProcessing(true);
    setError(null);

    try {
      await onPublish(paymentSignature);
      setCurrentStep('complete');
    } catch (err: any) {
      setError(err?.message ?? 'Failed to publish subscription record');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleClose = () => {
    if (!isProcessing) {
      // Only call onComplete if we're at the 'complete' step
      if (currentStep === 'complete' && onComplete) {
        onComplete();
      }

      // Reset state and close
      setCurrentStep('payment');
      setPaymentSignature(null);
      setError(null);
      setIntervalCount(defaultIntervalCount);
      onClose();
    }
  };

  const getStepIndex = () => {
    if (isRenewal) {
      // In renewal mode: Payment (0), Publish (1), Complete (2)
      switch (currentStep) {
        case 'payment':
          return 0;
        case 'publish':
          return 1;
        case 'complete':
          return 2;
        default:
          return 0;
      }
    } else {
      // Normal mode: Payment (0), Join Group (1), Publish (2), Complete (3)
      switch (currentStep) {
        case 'payment':
          return 0;
        case 'joinGroup':
          return 1;
        case 'publish':
          return 2;
        case 'complete':
          return 3;
        default:
          return 0;
      }
    }
  };

  return (
    <Dialog
      open={open}
      onClose={(_event, reason) => {
        // Prevent closing on backdrop click, only allow explicit close actions
        if (reason === 'backdropClick') {
          return;
        }
        handleClose();
      }}
      maxWidth="sm"
      fullWidth
      disableEscapeKeyDown={isProcessing}
    >
      <DialogTitle>
        <Typography variant="h6" fontWeight={800}>
          {isRenewal ? 'Renew' : 'Subscribe to'} {subscriptionTitle}
        </Typography>
        {currentStep === 'payment' && (
          <Typography variant="body2" sx={{ opacity: 0.6, mt: 0.25, fontWeight: 400 }}>
            {unitAmount} QORT / {intervalLabel}
          </Typography>
        )}
      </DialogTitle>

      <DialogContent>
        <Stack spacing={3}>
          <Stepper activeStep={getStepIndex()} alternativeLabel>
            {steps.map((label) => (
              <Step key={label}>
                <StepLabel>{label}</StepLabel>
              </Step>
            ))}
          </Stepper>

          {error && (
            <Alert severity="error" onClose={() => setError(null)}>
              {error}
            </Alert>
          )}

          {currentStep === 'payment' && (
            <Box>
              {/* Duration picker */}
              <Typography variant="body2" sx={{ opacity: 0.75, mb: 1.5 }}>
                {isRenewal ? 'How long would you like to renew for?' : 'Choose how long to subscribe for:'}
              </Typography>

              <Stack
                direction="row"
                alignItems="center"
                justifyContent="center"
                spacing={2}
                sx={{ mb: 2 }}
              >
                <IconButton
                  onClick={() => setIntervalCount((n) => Math.max(1, n - 1))}
                  disabled={isProcessing || intervalCount <= 1}
                  size="large"
                  sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2 }}
                >
                  <RemoveIcon />
                </IconButton>
                <Box textAlign="center" sx={{ minWidth: 100 }}>
                  <Typography variant="h3" fontWeight={800} lineHeight={1}>
                    {intervalCount}
                  </Typography>
                  <Typography variant="body2" sx={{ opacity: 0.65, mt: 0.25 }}>
                    {intervalCount === 1 ? intervalLabel : `${intervalLabel}s`}
                  </Typography>
                </Box>
                <IconButton
                  onClick={() => setIntervalCount((n) => Math.min(12, n + 1))}
                  disabled={isProcessing || intervalCount >= 12}
                  size="large"
                  sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2 }}
                >
                  <AddIcon />
                </IconButton>
              </Stack>

              {/* Summary card */}
              <Box
                sx={{
                  borderRadius: 2,
                  border: '1px solid',
                  borderColor: 'divider',
                  p: 2,
                  backgroundColor: 'action.hover',
                }}
              >
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Typography variant="body2" sx={{ opacity: 0.75 }}>
                    {unitAmount} QORT × {intervalCount} {intervalCount === 1 ? intervalLabel : `${intervalLabel}s`}
                  </Typography>
                  <Typography variant="h6" fontWeight={800}>
                    {totalAmount} QORT
                  </Typography>
                </Stack>
              </Box>

              <Typography variant="caption" sx={{ display: 'block', opacity: 0.55, mt: 1.5 }}>
                {!isRenewal
                  ? 'After payment you\'ll need to join the group and publish your subscription record on-chain.'
                  : 'After payment you\'ll need to publish your updated subscription record on-chain.'}
              </Typography>
            </Box>
          )}

          {currentStep === 'joinGroup' && (
            <Box>
              <Stack direction="row" spacing={1} alignItems="center" mb={2}>
                <CheckCircleIcon color="success" />
                <Typography variant="body2" color="success.main">
                  Payment sent successfully!
                </Typography>
              </Stack>

              <Typography variant="body1" gutterBottom>
                <strong>Step 2:</strong> Request to join the group
              </Typography>
              <Typography variant="body2" sx={{ opacity: 0.85, mt: 1 }}>
                Now you need to send a join request to become a member of the
                subscription group (Group ID: {groupId}).
              </Typography>
              <Typography variant="body2" sx={{ opacity: 0.7, mt: 1 }}>
                The group owner will need to approve your request before you can
                access group content.
              </Typography>
            </Box>
          )}

          {currentStep === 'publish' && (
            <Box>
              <Stack direction="row" spacing={1} alignItems="center" mb={1}>
                <CheckCircleIcon color="success" />
                <Typography variant="body2" color="success.main">
                  Payment sent successfully!
                </Typography>
              </Stack>
              {!isRenewal && (
                <Stack direction="row" spacing={1} alignItems="center" mb={2}>
                  <CheckCircleIcon color="success" />
                  <Typography variant="body2" color="success.main">
                    Join request sent successfully!
                  </Typography>
                </Stack>
              )}

              <Typography variant="body1" gutterBottom>
                <strong>Step {isRenewal ? '2' : '3'}:</strong> Publish your
                subscription record
              </Typography>
              <Typography variant="body2" sx={{ opacity: 0.85, mt: 1 }}>
                Now you need to publish your subscription record on-chain to
                complete the process. This links your payment to the
                subscription.
              </Typography>
              <Typography variant="body2" sx={{ opacity: 0.7, mt: 1 }}>
                You can close this modal and complete this step later if needed.
              </Typography>
              {paymentSignature && (
                <Typography
                  variant="caption"
                  sx={{
                    mt: 1,
                    display: 'block',
                    wordBreak: 'break-all',
                    opacity: 0.6,
                  }}
                >
                  Payment TX: {paymentSignature.slice(0, 20)}...
                </Typography>
              )}
            </Box>
          )}

          {currentStep === 'complete' && (
            <Box textAlign="center" py={2}>
              <CheckCircleIcon
                sx={{ fontSize: 64, color: 'success.main', mb: 2 }}
              />
              <Typography variant="h6" gutterBottom fontWeight={700}>
                {isRenewal
                  ? 'Successfully Renewed!'
                  : 'Subscription Request Submitted!'}
              </Typography>
              <Typography variant="body2" sx={{ opacity: 0.85 }}>
                {isRenewal
                  ? `Your subscription to ${subscriptionTitle} has been renewed and is now active.`
                  : `Your payment and subscription record have been published successfully.`}
              </Typography>
              {!isRenewal && (
                <Typography variant="body2" sx={{ opacity: 0.85, mt: 2 }}>
                  <strong>Next Steps:</strong>
                  <br />
                  The subscription manager needs to approve your join request to
                  grant you access to the group. Once approved, they will also
                  need to re-encrypt the group keys to give you access to
                  encrypted content.
                </Typography>
              )}
            </Box>
          )}
        </Stack>
      </DialogContent>

      <DialogActions>
        {currentStep === 'payment' && (
          <>
            <Button onClick={handleClose} disabled={isProcessing}>
              Cancel
            </Button>
            <Button
              variant="contained"
              onClick={handlePayment}
              disabled={isProcessing}
              startIcon={isProcessing ? <CircularProgress size={16} /> : null}
            >
              {isProcessing ? 'Processing...' : 'Make Payment'}
            </Button>
          </>
        )}

        {currentStep === 'joinGroup' && (
          <>
            <Button
              variant="contained"
              onClick={handleJoinGroup}
              disabled={isProcessing}
              startIcon={isProcessing ? <CircularProgress size={16} /> : null}
            >
              {isProcessing ? 'Sending Request...' : 'Join Group'}
            </Button>
          </>
        )}

        {currentStep === 'publish' && (
          <>
            <Button
              variant="contained"
              onClick={handlePublish}
              disabled={isProcessing}
              startIcon={isProcessing ? <CircularProgress size={16} /> : null}
            >
              {isProcessing ? 'Publishing...' : 'Publish Record'}
            </Button>
          </>
        )}

        {currentStep === 'complete' && (
          <Button variant="contained" onClick={handleClose}>
            Done
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
