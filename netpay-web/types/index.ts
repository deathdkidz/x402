// ============================================================
// MERCHANT TYPES
// ============================================================
export interface Merchant {
  id: number;
  merchantId: string;
  authAddress: string;
  businessName: string;
  description?: string;
  websiteUrl?: string;
  logoUrl?: string;
  contactEmail?: string;
  creditBalance: number;
  lifetimeCreditsPurchased: number;
  lifetimeCreditsUsed: number;
  isMarketplaceVisible: boolean;
  marketplaceCategory?: string;
  marketplaceTags?: string[];
  webhookUrl?: string;
  webhookSecret?: string;
  webhookEvents?: string[];
  status: 'pending' | 'active' | 'suspended' | 'banned';
  statusReason?: string;
  createdAt: string;
  updatedAt: string;
  lastActiveAt?: string;
}

// ============================================================
// MERCHANT RESOURCE TYPES
// ============================================================
export type ResourceType = 'api' | 'service' | 'data' | 'content' | 'compute' | 'storage';

export interface MerchantResource {
  id: string;
  merchantId: string;
  name: string;
  description?: string;
  type: ResourceType;
  creditCost: number;
  isPublished: boolean;
  totalAccesses?: number;
  createdAt: Date;
  updatedAt: Date;
  url?: string;
  method?: string;
}

// ============================================================
// CREDIT TYPES
// ============================================================
export type CreditTransactionType = 'purchase' | 'settlement_fee' | 'refund' | 'bonus' | 'adjustment';

export interface CreditTransaction {
  id: number;
  merchantId: number;
  type: CreditTransactionType;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  referenceType?: string;
  referenceId?: string;
  description?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface CreditPurchase {
  id: number;
  merchantId: number;
  network: string;
  txHash: string;
  blockNumber: number;
  fromAddress: string;
  tokenAmount: number;
  creditAmount: number;
  bonusCredits: number;
  status: 'pending' | 'confirmed' | 'failed';
  confirmations: number;
  createdAt: string;
  confirmedAt?: string;
}

// ============================================================
// SETTLEMENT TYPES
// ============================================================
export type SettlementStatus = 'pending' | 'preconfirmed' | 'confirmed' | 'failed' | 'expired';

export interface Settlement {
  id: number;
  settlementId: string;
  merchantId: number;
  network: string;
  tokenAddress: string;
  payerAddress: string;
  recipientAddress: string;
  amount: number;
  nonce: string;
  validAfter: number;
  validBefore: number;
  signature: string;
  resourceId?: string;
  resourceUrl?: string;
  txHash?: string;
  blockNumber?: number;
  gasUsed?: number;
  gasPrice?: number;
  creditCost: number;
  gasCostUsd?: number;
  status: SettlementStatus;
  errorMessage?: string;
  createdAt: string;
  submittedAt?: string;
  confirmedAt?: string;
}

// ============================================================
// PAYMASTER TYPES
// ============================================================
export interface Paymaster {
  id: number;
  address: string;
  name?: string;
  networks: string[];
  lastKnownBalance?: number;
  lastBalanceCheck?: string;
  lowBalanceThreshold?: number;
  totalTransactions: number;
  totalGasSpent: number;
  isActive: boolean;
  priority: number;
  createdAt: string;
  updatedAt: string;
}

// ============================================================
// ADMIN TYPES
// ============================================================
export type AdminRole = 'super_admin' | 'admin' | 'viewer';

export interface AdminUser {
  id: number;
  username: string;
  role: AdminRole;
  totpEnabled: boolean;
  lastLoginAt?: string;
  lastLoginIp?: string;
  isActive: boolean;
  createdAt: string;
}

export interface AuditLog {
  id: number;
  adminId?: number;
  action: string;
  entityType?: string;
  entityId?: string;
  oldValue?: Record<string, unknown>;
  newValue?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  createdAt: string;
}

// ============================================================
// ANALYTICS TYPES
// ============================================================
export interface MerchantAnalyticsDaily {
  id: number;
  merchantId: number;
  date: string;
  totalSettlements: number;
  successfulSettlements: number;
  failedSettlements: number;
  totalVolumeUsd: number;
  volumeByNetwork: Record<string, number>;
  volumeByToken: Record<string, number>;
  creditsUsed: number;
  creditsPurchased: number;
  verifyRequests: number;
  settleRequests: number;
}

export interface SystemMetric {
  id: number;
  metricName: string;
  metricValue: number;
  tags?: Record<string, string>;
  recordedAt: string;
}

// ============================================================
// DASHBOARD STATS
// ============================================================
export interface DashboardStats {
  totalMerchants: number;
  activeMerchants: number;
  pendingMerchants: number;
  suspendedMerchants: number;
  totalSettlements24h: number;
  totalSettlements7d: number;
  totalSettlements30d: number;
  totalVolume24h: number;
  totalVolume7d: number;
  totalVolume30d: number;
  totalCreditsSold: number;
  totalCreditsUsed: number;
  successRate24h: number;
}

export interface MerchantDashboardStats {
  creditBalance: number;
  creditsUsed24h: number;
  creditsUsed7d: number;
  creditsUsed30d: number;
  settlements24h: number;
  settlements7d: number;
  settlements30d: number;
  volume24h: number;
  volume7d: number;
  volume30d: number;
  successRate: number;
}

// ============================================================
// API RESPONSE TYPES
// ============================================================
export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface ApiError {
  error: string;
  message: string;
  details?: Record<string, unknown>;
}

// ============================================================
// FILTER & SORT TYPES
// ============================================================
export interface SettlementFilters {
  status?: SettlementStatus;
  network?: string;
  token?: string;
  dateFrom?: string;
  dateTo?: string;
  minAmount?: number;
  maxAmount?: number;
}

export interface MerchantFilters {
  status?: Merchant['status'];
  search?: string;
  isMarketplaceVisible?: boolean;
}
