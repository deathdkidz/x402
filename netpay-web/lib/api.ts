// Facilitator API client for SERVER-SIDE ONLY calls
// This file should NEVER be imported in client components

// Runtime check to prevent client-side usage
if (typeof window !== 'undefined') {
  throw new Error('lib/api.ts must only be used server-side');
}

const FACILITATOR_URL = process.env.FACILITATOR_URL || 'https://api.netpay.id';
const FACILITATOR_API_KEY = process.env.FACILITATOR_API_KEY || '';

interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

async function facilitatorRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  try {
    // Validate API key exists
    if (!FACILITATOR_API_KEY) {
      console.error('FACILITATOR_API_KEY not configured');
      return { success: false, error: 'Server configuration error' };
    }

    const url = `${FACILITATOR_URL}${endpoint}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': FACILITATOR_API_KEY,
        'X-Request-Source': 'netpay-dashboard',
        ...options.headers,
      },
    });

    const data = await response.json();

    if (!response.ok) {
      return { success: false, error: data.error || 'Request failed' };
    }

    return { success: true, data };
  } catch (error) {
    console.error('Facilitator API error:', error);
    return { success: false, error: 'Network error' };
  }
}

// ============ Auth API ============

export interface MerchantData {
  id: number;
  authAddress: string;
  businessName: string;
  apiKey: string;
  creditBalance: number;
  status: string;
  createdAt: string;
}

export interface AuthResult {
  merchant: MerchantData;
  sessionToken: string;
  isNewUser: boolean;
}

export async function authenticateWallet(
  address: string,
  message: string,
  signature: string
): Promise<ApiResponse<AuthResult>> {
  return facilitatorRequest<AuthResult>('/merchant/auth', {
    method: 'POST',
    body: JSON.stringify({ address, message, signature }),
  });
}

export async function validateSession(
  sessionToken: string
): Promise<ApiResponse<{ merchant: MerchantData }>> {
  return facilitatorRequest<{ merchant: MerchantData }>('/merchant/session', {
    method: 'POST',
    body: JSON.stringify({ sessionToken }),
  });
}

export async function logoutSession(
  sessionToken: string
): Promise<ApiResponse<{ success: boolean }>> {
  return facilitatorRequest<{ success: boolean }>('/merchant/logout', {
    method: 'POST',
    body: JSON.stringify({ sessionToken }),
  });
}

// ============ Dashboard API ============

export interface DashboardStats {
  creditBalance: number;
  totalTransactions: number;
  totalVolume: number;
  successRate: number;
  recentTransactions: Transaction[];
  volumeByDay: { date: string; volume: number }[];
}

export interface Transaction {
  id: number;
  payerAddress: string;
  recipientAddress: string;
  amount: number;
  asset: string;
  network: string;
  status: string;
  txHash: string | null;
  resource: string | null;
  creditCost: number;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TransactionsResult {
  transactions: Transaction[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export async function getDashboardStats(
  merchantId: number
): Promise<ApiResponse<DashboardStats>> {
  return facilitatorRequest<DashboardStats>(`/merchant/${merchantId}/dashboard/stats`);
}

export async function getTransactions(
  merchantId: number,
  params: { page?: number; limit?: number; status?: string; network?: string; search?: string }
): Promise<ApiResponse<TransactionsResult>> {
  const query = new URLSearchParams();
  if (params.page) query.append('page', params.page.toString());
  if (params.limit) query.append('limit', params.limit.toString());
  if (params.status) query.append('status', params.status);
  if (params.network) query.append('network', params.network);
  if (params.search) query.append('search', params.search);
  
  return facilitatorRequest<TransactionsResult>(
    `/merchant/${merchantId}/transactions?${query}`
  );
}

export interface CreditsData {
  balance: number;
  lifetimePurchased: number;
  lifetimeUsed: number;
  usedLast30Days: number;
  transactions: CreditTransaction[];
  purchases: CreditPurchase[];
}

export interface CreditTransaction {
  id: number;
  type: string;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  description: string | null;
  createdAt: string;
}

export interface CreditPurchase {
  id: number;
  network: string;
  txHash: string;
  tokenAmount: number;
  creditAmount: number;
  status: string;
  createdAt: string;
}

export async function getCredits(
  merchantId: number
): Promise<ApiResponse<CreditsData>> {
  return facilitatorRequest<CreditsData>(`/merchant/${merchantId}/credits`);
}

export interface AnalyticsData {
  totalVolume: number;
  totalCount: number;
  avgTransaction: number;
  successRate: number;
  volumeByNetwork: { name: string; value: number; percentage: number }[];
  volumeByAsset: { name: string; value: number; percentage: number }[];
  dailyVolume: { date: string; volume: number; count: number; successRate: number }[];
  hourlyDistribution: { hour: number; count: number }[];
}

export async function getAnalytics(
  merchantId: number,
  period: string = '30d'
): Promise<ApiResponse<AnalyticsData>> {
  return facilitatorRequest<AnalyticsData>(
    `/merchant/${merchantId}/analytics?period=${period}`
  );
}

export interface MerchantSettings {
  merchant: {
    id: number;
    businessName: string;
    businessEmail: string | null;
    website: string | null;
    walletAddress: string;
    supportEmail: string | null;
    description: string | null;
    apiKey: string;
    createdAt: string;
  };
  notifications: {
    emailSettlements: boolean;
    emailFailures: boolean;
    emailCredits: boolean;
    emailWeekly: boolean;
    emailMarketing: boolean;
  };
}

export async function getSettings(
  merchantId: number
): Promise<ApiResponse<MerchantSettings>> {
  return facilitatorRequest<MerchantSettings>(`/merchant/${merchantId}/settings`);
}

export async function updateSettings(
  merchantId: number,
  data: Partial<MerchantSettings>
): Promise<ApiResponse<{ success: boolean }>> {
  return facilitatorRequest<{ success: boolean }>(`/merchant/${merchantId}/settings`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}
