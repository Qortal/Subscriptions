import { buildSubscriptionIdentifiers } from './subscriptionPublishing';
import { fetchSubscriptionIndexPrice } from '../hooks/useSubscriptionIndexPrice';

const AMOUNT_TOLERANCE = 0.00001;

function amountMatches(a: number, b: number): boolean {
  return Math.abs(a - b) <= AMOUNT_TOLERANCE;
}

export function getPaidIntervalsFromAmount(
  paidAmount: number,
  unitPrice: number
): number {
  if (!Number.isFinite(paidAmount) || !Number.isFinite(unitPrice) || unitPrice <= 0) {
    return 0;
  }
  const raw = paidAmount / unitPrice;
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  return Math.floor(raw + AMOUNT_TOLERANCE);
}

export function isMultipleOfUnitPrice(
  paidAmount: number,
  unitPrice: number
): boolean {
  const intervals = getPaidIntervalsFromAmount(paidAmount, unitPrice);
  if (intervals < 1) return false;
  return amountMatches(paidAmount, unitPrice * intervals);
}

async function fetchPaymentAmount(paymentTxSignature: string): Promise<number> {
  const txResponse = await fetch(
    `/transactions/signature/${encodeURIComponent(paymentTxSignature)}`
  );
  if (!txResponse.ok) {
    throw new Error('Failed to fetch payment transaction');
  }
  const txData = await txResponse.json();
  const amount = parseFloat(txData?.amount ?? '0');
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Invalid payment amount in transaction');
  }
  return amount;
}

async function fetchLatestIndexIdentifier(args: {
  identifierOperations: any;
  lists: any;
  subscriptionId: string;
  ownerName: string;
  currentIndexIdentifier?: string;
}): Promise<string> {
  const fallbackCurrent = args.currentIndexIdentifier;
  const { indexIdentifier: baseIndexIdentifier } = await buildSubscriptionIdentifiers(
    args.identifierOperations,
    args.subscriptionId
  );
  const baseIdentifierPrefix = baseIndexIdentifier.replace(/-v\d+$/, '');
  const matches = await args.lists.fetchResourcesResultsOnly({
    identifier: baseIdentifierPrefix,
    service: 'DOCUMENT',
    name: args.ownerName,
    exactMatchNames: true,
    prefix: true,
    reverse: true,
    limit: 1,
  });
  const latestIndexIdentifier = matches?.[0]?.identifier;
  if (typeof latestIndexIdentifier === 'string' && /-v\d+$/.test(latestIndexIdentifier)) {
    return latestIndexIdentifier;
  }
  if (fallbackCurrent) return fallbackCurrent;
  return baseIndexIdentifier;
}

export async function resolvePaymentIndexIdentifierForPublish(args: {
  ownerName: string;
  subscriptionId: string;
  paymentTxSignature: string;
  lockedIndexIdentifier?: string;
  currentIndexIdentifier?: string;
  identifierOperations?: any;
  lists?: any;
}): Promise<string> {
  const paidAmount = await fetchPaymentAmount(args.paymentTxSignature);
  const currentIndexIdentifier =
    args.identifierOperations && args.lists
      ? await fetchLatestIndexIdentifier({
          identifierOperations: args.identifierOperations,
          lists: args.lists,
          subscriptionId: args.subscriptionId,
          ownerName: args.ownerName,
          currentIndexIdentifier: args.currentIndexIdentifier,
        })
      : args.currentIndexIdentifier;

  if (!currentIndexIdentifier) {
    throw new Error('Unable to resolve current subscription index identifier');
  }

  const currentIndexPrice = await fetchSubscriptionIndexPrice(
    args.ownerName,
    currentIndexIdentifier
  );
  if (!currentIndexPrice) {
    throw new Error('Unable to fetch current subscription price');
  }

  const lockedIndexIdentifier = args.lockedIndexIdentifier;
  if (isMultipleOfUnitPrice(paidAmount, currentIndexPrice.priceQort)) {
    return currentIndexIdentifier;
  }

  if (lockedIndexIdentifier) {
    const lockedIndexPrice = await fetchSubscriptionIndexPrice(
      args.ownerName,
      lockedIndexIdentifier
    );
    if (
      lockedIndexPrice &&
      isMultipleOfUnitPrice(paidAmount, lockedIndexPrice.priceQort)
    ) {
      return lockedIndexIdentifier;
    }
  }

  throw new Error(
    `Payment amount ${paidAmount} is not a valid multiple of locked/current subscription price`
  );
}
