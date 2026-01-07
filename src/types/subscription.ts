export type BillingInterval = 'monthly' | 'yearly';

// UI wording: "Private groups" (we treat any non-open/closed group as private for this app)
export type GroupAccessType = 'private';

export type SubscriptionCatalogItem = {
  id: string;
  title: string;
  ownerName: string;
  ownerAddress: string;
  groupId: number;
  description: string;
  priceQort: number;
  billingInterval: BillingInterval;
  perks: string[];
  detailsIdentifier: string;
  indexIdentifier: string; // The latest versioned index identifier
};

export type MySubscription = {
  id: string;
  title: string;
  ownerName: string;
  groupInfo: unknown;
  priceQort: number;
  billingInterval: BillingInterval;
  status: 'active' | 'paused' | 'cancelled';
  nextPaymentDue: string; // ISO date string
};

export type Subscriber = {
  name: string;
  address: string;
  joinedAt: string; // ISO date string
  lastPaidAt: string | null; // ISO date string
  nextDueAt: string; // ISO date string
  isPaidUp: boolean;
};

export type SubscriptionState = {
  version: number;
  price: number;
  interval: 'DAY' | 'WEEK' | 'MONTH' | 'YEAR';
  effectiveFrom: number; // Unix timestamp in milliseconds
};

export type SubscriptionOnChainIndex = {
  // Minimal, versioned payload intended to fit into 239 bytes when encoded for on-chain ARBITRARY data.
  // We keep short keys and store amount as a QORT string with up to 2 decimals (e.g. "2.23").
  schema: 'sub-v1';
  gid: number; // group id
  amt: string; // amount in QORT with up to 2 decimals (>= "1.00")
  int: number; // interval days
  gr: number; // grace days
};

export type SubscriptionFullDetailsV1 = {
  schema: 'q-subscriptions/details@v1';
  subscriptionId: string;
  ownerName: string;
  ownerAddress?: string;
  groupId: number;
  groupAccess: GroupAccessType;
  title: string;
  description: string;
  perks: string[];
  tags?: string[];
  createdAt: string; // ISO date
};

export type SubscriptionFullDetailsV2 = {
  schema: 'q-subscriptions/details@v2';
  subscriptionId: string;
  ownerName: string;
  ownerAddress?: string;
  groupId: number;
  groupAccess: GroupAccessType;
  title: string;
  description: string;
  perks: string[];
  tags?: string[];
  createdAt: string; // ISO date
  // Pricing / billing rules (mirrors on-chain index so UIs can rely on details alone)
  amountQort: string; // fixed 2-decimal QORT string (e.g. "2.00")
  intervalDays: number;
  graceDays: number;
  // States for pricing tiers or multiple subscription options
  states?: SubscriptionState[];
};

export type SubscriptionFullDetails =
  | SubscriptionFullDetailsV1
  | SubscriptionFullDetailsV2;

export type OwnedGroup = {
  id: number;
  name: string;
  access: GroupAccessType;
  raw?: unknown;
};

export type MemberGroup = {
  id: number;
  name: string;
  access: GroupAccessType;
  ownerAddress: string;
  raw?: unknown;
};
