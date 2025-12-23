// Facilitator API client for SERVER-SIDE ONLY calls
// This file should NEVER be imported in client components

// Runtime check to prevent client-side usage
if (typeof window !== 'undefined') {
  throw new Error('lib/api.ts must only be used server-side');
}

const FACILITATOR_URL = process.env.FACILITATOR_URL || 'http://localhost:8080';
const INTERNAL_API_SECRET = process.env.INTERNAL_API_SECRET || '';

interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

interface FacilitatorOptions extends RequestInit {
  sessionToken?: string;
}

async function facilitatorRequest<T>(
  endpoint: string,
  options: FacilitatorOptions = {}
): Promise<ApiResponse<T>> {
  try {
    const url = `${FACILITATOR_URL}${endpoint}`;
    
    // Extract sessionToken before spreading to headers
    const { sessionToken, ...fetchOptions } = options;
    
    // Build headers with internal auth
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Request-Source': 'netpay-dashboard',
    };
    
    // Add internal API secret for all requests from dashboard
    if (INTERNAL_API_SECRET) {
      headers['X-Internal-Secret'] = INTERNAL_API_SECRET;
    }
    
    // Add session token if provided
    if (sessionToken) {
      headers['X-Session-Token'] = sessionToken;
    }
    
    const response = await fetch(url, {
      ...fetchOptions,
      headers: {
        ...headers,
        ...fetchOptions.headers,
      },
      // Add cache: 'no-store' for dynamic data
      cache: 'no-store',
    });

    const data = await response.json();

    if (!response.ok) {
      return { success: false, error: data.error || 'Request failed' };
    }

    // Handle new API response format
    if (data.success !== undefined) {
      return { success: data.success, data: data.data, error: data.error };
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
  mainnetCreditBalance: number;
  testnetCreditsRemaining: number;
  testnetCreditsUsed: number;
  status: string;
  createdAt: string;
}

export interface AuthResult {
  merchant: MerchantData;
  sessionToken: string;
  isNewUser: boolean;
  isAdmin?: boolean;
  adminRole?: string;
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
  mainnetCreditBalance: number;
  testnetCreditsRemaining: number;
  testnetCreditsUsed: number;
  testnetCreditsAllocated: number;
  currentPeriod: string;
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
  merchantId: number,
  sessionToken?: string
): Promise<ApiResponse<DashboardStats>> {
  return facilitatorRequest<DashboardStats>(`/merchant/${merchantId}/dashboard/stats`, { sessionToken });
}

export async function getTransactions(
  merchantId: number,
  params: { page?: number; limit?: number; status?: string; network?: string; search?: string },
  sessionToken?: string
): Promise<ApiResponse<TransactionsResult>> {
  const query = new URLSearchParams();
  if (params.page) query.append('page', params.page.toString());
  if (params.limit) query.append('limit', params.limit.toString());
  if (params.status) query.append('status', params.status);
  if (params.network) query.append('network', params.network);
  if (params.search) query.append('search', params.search);
  
  return facilitatorRequest<TransactionsResult>(
    `/merchant/${merchantId}/transactions?${query}`,
    { sessionToken }
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
  merchantId: number,
  sessionToken?: string
): Promise<ApiResponse<CreditsData>> {
  return facilitatorRequest<CreditsData>(`/merchant/${merchantId}/credits`, { sessionToken });
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
  period: string = '30d',
  sessionToken?: string
): Promise<ApiResponse<AnalyticsData>> {
  return facilitatorRequest<AnalyticsData>(
    `/merchant/${merchantId}/analytics?period=${period}`,
    { sessionToken }
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
  merchantId: number,
  sessionToken?: string
): Promise<ApiResponse<MerchantSettings>> {
  return facilitatorRequest<MerchantSettings>(`/merchant/${merchantId}/settings`, { sessionToken });
}

export async function updateSettings(
  merchantId: number,
  data: Partial<MerchantSettings>,
  sessionToken?: string
): Promise<ApiResponse<{ success: boolean }>> {
  return facilitatorRequest<{ success: boolean }>(`/merchant/${merchantId}/settings`, {
    method: 'PUT',
    body: JSON.stringify(data),
    sessionToken,
  });
}

// ============ Credits/Topup API ============

export interface TopupPackage {
  id: number;
  name: string;
  description: string | null;
  creditAmount: number;
  priceUsdc: number;
  bonusCredits: number;
  totalCredits: number;
  isPopular: boolean;
}

export interface TopupOrder {
  orderId: string;
  merchantId: number;
  creditAmount: number;
  bonusCredits: number;
  totalCredits: number;
  priceUsdc: number;
  network: string;
  status: string;
  paymentAddress: string;
  expiresAt: string;
  createdAt: string;
}

export async function getTopupPackages(merchantId: number, sessionToken?: string): Promise<ApiResponse<TopupPackage[]>> {
  return facilitatorRequest<TopupPackage[]>(`/merchant/${merchantId}/credits/packages`, { sessionToken });
}

export async function createTopupOrder(
  merchantId: number,
  packageId?: number,
  creditAmount?: number,
  network: string = 'base',
  sessionToken?: string
): Promise<ApiResponse<TopupOrder>> {
  return facilitatorRequest<TopupOrder>(`/merchant/${merchantId}/credits/topup`, {
    method: 'POST',
    body: JSON.stringify({ packageId, creditAmount, network }),
    sessionToken,
  });
}

export async function getTopupOrder(merchantId: number, orderId: string, sessionToken?: string): Promise<ApiResponse<TopupOrder>> {
  return facilitatorRequest<TopupOrder>(`/merchant/${merchantId}/credits/topup/${orderId}`, { sessionToken });
}

// ============ Admin API ============

export interface AdminAuthResult {
  admin: {
    id: number;
    username: string;
    displayName: string | null;
    role: string;
    totpEnabled: boolean;
  };
  sessionToken: string;
}

export interface AdminDashboardStats {
  totalMerchants: number;
  activeMerchants: number;
  pendingMerchants: number;
  suspendedMerchants: number;
  bannedMerchants: number;
  totalSettlements24h: number;
  totalSettlements7d: number;
  totalVolume24h: number;
  totalVolume7d: number;
  totalCreditsUsed: number;
  totalCreditsPurchased: number;
  successRate24h: number;
  recentSettlements: {
    id: number;
    merchantName: string;
    amount: number;
    network: string;
    status: string;
    createdAt: string;
  }[];
}

export interface AdminMerchant {
  id: number;
  authAddress: string;
  businessName: string | null;
  email: string | null;
  creditBalance: number;
  mainnetCreditBalance: number;
  lifetimeCreditsPurchased: number;
  lifetimeCreditsUsed: number;
  status: string;
  isActive: boolean;
  createdAt: string;
  lastActiveAt: string | null;
  settlementCount: number;
  totalVolume: number;
}

export interface AdminTransaction {
  id: number;
  merchantId: number | null;
  merchantName: string | null;
  payerAddress: string;
  recipientAddress: string;
  amount: number;
  asset: string;
  network: string;
  status: string;
  txHash: string | null;
  resource: string | null;
  creditCost: number;
  createdAt: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export async function adminLogin(
  username: string,
  password: string,
  totpCode?: string
): Promise<ApiResponse<AdminAuthResult>> {
  return facilitatorRequest<AdminAuthResult>('/admin/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password, totpCode }),
  });
}

export async function adminValidateSession(
  sessionToken: string
): Promise<ApiResponse<AdminAuthResult['admin']>> {
  return facilitatorRequest<AdminAuthResult['admin']>('/admin/auth/session', {
    method: 'POST',
    body: JSON.stringify({ sessionToken }),
  });
}

export async function adminLogout(sessionToken: string): Promise<ApiResponse<{ success: boolean }>> {
  return facilitatorRequest<{ success: boolean }>('/admin/auth/logout', {
    method: 'POST',
    body: JSON.stringify({ sessionToken }),
  });
}

export async function getAdminDashboard(): Promise<ApiResponse<AdminDashboardStats>> {
  return facilitatorRequest<AdminDashboardStats>('/admin/dashboard');
}

export async function getAdminMerchants(
  params: { page?: number; limit?: number; status?: string; search?: string } = {}
): Promise<ApiResponse<{ merchants: AdminMerchant[]; pagination: { page: number; limit: number; total: number; totalPages: number } }>> {
  const query = new URLSearchParams();
  if (params.page) query.append('page', params.page.toString());
  if (params.limit) query.append('limit', params.limit.toString());
  if (params.status) query.append('status', params.status);
  if (params.search) query.append('search', params.search);
  return facilitatorRequest(`/admin/merchants?${query}`);
}

export async function getAdminMerchant(merchantId: number): Promise<ApiResponse<AdminMerchant>> {
  return facilitatorRequest<AdminMerchant>(`/admin/merchants/${merchantId}`);
}

export async function updateAdminMerchant(
  merchantId: number,
  data: { businessName?: string; email?: string; status?: string; isActive?: boolean; testnetCreditsEnabled?: boolean }
): Promise<ApiResponse<{ success: boolean }>> {
  return facilitatorRequest<{ success: boolean }>(`/admin/merchants/${merchantId}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function banMerchant(merchantId: number, reason: string): Promise<ApiResponse<{ success: boolean }>> {
  return facilitatorRequest<{ success: boolean }>(`/admin/merchants/${merchantId}/ban`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}

export async function unbanMerchant(merchantId: number): Promise<ApiResponse<{ success: boolean }>> {
  return facilitatorRequest<{ success: boolean }>(`/admin/merchants/${merchantId}/unban`, {
    method: 'POST',
  });
}

export async function adjustMerchantCredits(
  merchantId: number,
  type: 'mainnet' | 'testnet',
  amount: number,
  reason: string
): Promise<ApiResponse<{ success: boolean }>> {
  return facilitatorRequest<{ success: boolean }>(`/admin/merchants/${merchantId}/credits`, {
    method: 'POST',
    body: JSON.stringify({ type, amount, reason }),
  });
}

export async function getAdminTransactions(
  params: { page?: number; limit?: number; status?: string; network?: string; merchantId?: number; search?: string } = {}
): Promise<ApiResponse<{ transactions: AdminTransaction[]; pagination: { page: number; limit: number; total: number; totalPages: number } }>> {
  const query = new URLSearchParams();
  if (params.page) query.append('page', params.page.toString());
  if (params.limit) query.append('limit', params.limit.toString());
  if (params.status) query.append('status', params.status);
  if (params.network) query.append('network', params.network);
  if (params.merchantId) query.append('merchantId', params.merchantId.toString());
  if (params.search) query.append('search', params.search);
  return facilitatorRequest(`/admin/transactions?${query}`);
}

export async function getAdminSettings(): Promise<ApiResponse<{ settings: { key: string; value: string; type: string; description: string | null }[] }>> {
  return facilitatorRequest('/admin/settings');
}

export async function updateAdminSettings(
  settings: { key: string; value: string; type: string }[]
): Promise<ApiResponse<{ success: boolean }>> {
  return facilitatorRequest<{ success: boolean }>('/admin/settings', {
    method: 'PUT',
    body: JSON.stringify({ settings }),
  });
}

export async function getAdminAuditLog(
  params: { page?: number; limit?: number; action?: string; adminId?: number } = {}
): Promise<ApiResponse<{ logs: { id: number; adminId: number | null; adminUsername: string | null; action: string; entityType: string | null; entityId: string | null; createdAt: string }[]; pagination: { page: number; limit: number; total: number; totalPages: number } }>> {
  const query = new URLSearchParams();
  if (params.page) query.append('page', params.page.toString());
  if (params.limit) query.append('limit', params.limit.toString());
  if (params.action) query.append('action', params.action);
  if (params.adminId) query.append('adminId', params.adminId.toString());
  return facilitatorRequest(`/admin/audit?${query}`);
}

export async function getAdminTopupOrders(
  params: { page?: number; limit?: number; status?: string } = {}
): Promise<ApiResponse<{ orders: { id: number; orderId: string; merchantId: number; merchantName: string | null; creditAmount: number; bonusCredits: number; priceUsdc: number; network: string | null; status: string; expiresAt: string; createdAt: string }[]; pagination: { page: number; limit: number; total: number; totalPages: number } }>> {
  const query = new URLSearchParams();
  if (params.page) query.append('page', params.page.toString());
  if (params.limit) query.append('limit', params.limit.toString());
  if (params.status) query.append('status', params.status);
  return facilitatorRequest(`/admin/topup/orders?${query}`);
}

export async function completeTopupOrder(
  orderId: string,
  txHash: string
): Promise<ApiResponse<{ success: boolean; creditsAdded: number }>> {
  return facilitatorRequest<{ success: boolean; creditsAdded: number }>(`/admin/topup/orders/${orderId}/complete`, {
    method: 'POST',
    body: JSON.stringify({ txHash }),
  });
}
