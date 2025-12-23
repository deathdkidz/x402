'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardHeader, CardContent, Button, Input, Select } from '@/components/ui';
import { Table, Pagination } from '@/components/ui/Table';
import { StatusBadge } from '@/components/ui/Badge';
import { SearchIcon, PlusIcon, DownloadIcon, RefreshIcon } from '@/components/icons';

// Type for admin merchant data
interface AdminMerchant {
  id: number;
  authAddress: string;
  businessName: string;
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

// Client-side API helpers
async function apiGetAdminMerchants(params: { page?: number; limit?: number; status?: string; search?: string } = {}) {
  const sessionToken = localStorage.getItem('admin_session_token');
  if (!sessionToken) {
    return { success: false, error: 'Not authenticated' };
  }
  const query = new URLSearchParams();
  query.append('sessionToken', sessionToken);
  if (params.page) query.append('page', params.page.toString());
  if (params.limit) query.append('limit', params.limit.toString());
  if (params.status) query.append('status', params.status);
  if (params.search) query.append('search', params.search);
  const res = await fetch(`/api/admin/merchants?${query}`);
  return res.json();
}

async function apiAdminMerchantAction(merchantId: number, action: string, data: Record<string, unknown> = {}) {
  const sessionToken = localStorage.getItem('admin_session_token');
  if (!sessionToken) {
    return { success: false, error: 'Not authenticated' };
  }
  const res = await fetch('/api/admin/merchants', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionToken, merchantId, action, ...data }),
  });
  return res.json();
}

export default function MerchantsPage() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [merchants, setMerchants] = useState<AdminMerchant[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const pageSize = 10;

  const fetchMerchants = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await apiGetAdminMerchants({
        page: currentPage,
        limit: pageSize,
        status: statusFilter === 'all' ? undefined : statusFilter,
        search: search || undefined,
      });
      if (result.success && result.data) {
        setMerchants(result.data.merchants);
        setTotalPages(result.data.pagination.totalPages);
        setTotal(result.data.pagination.total);
      } else {
        setError(result.error || 'Failed to load merchants');
      }
    } catch (err) {
      setError('Failed to connect to API');
    } finally {
      setLoading(false);
    }
  }, [currentPage, statusFilter, search]);

  useEffect(() => {
    fetchMerchants();
  }, [fetchMerchants]);

  useEffect(() => {
    setCurrentPage(1);
  }, [statusFilter, search]);

  const handleBan = async (merchantId: number) => {
    const reason = prompt('Enter reason for banning:');
    if (!reason) return;
    setActionLoading(merchantId);
    try {
      const result = await apiAdminMerchantAction(merchantId, 'ban', { reason });
      if (result.success) {
        fetchMerchants();
      } else {
        alert(result.error || 'Failed to ban merchant');
      }
    } finally {
      setActionLoading(null);
    }
  };

  const handleUnban = async (merchantId: number) => {
    if (!confirm('Are you sure you want to unban this merchant?')) return;
    setActionLoading(merchantId);
    try {
      const result = await apiAdminMerchantAction(merchantId, 'unban');
      if (result.success) {
        fetchMerchants();
      } else {
        alert(result.error || 'Failed to unban merchant');
      }
    } finally {
      setActionLoading(null);
    }
  };

  const handleActivate = async (merchantId: number) => {
    setActionLoading(merchantId);
    try {
      const result = await apiAdminMerchantAction(merchantId, 'update', { status: 'active', isActive: true });
      if (result.success) {
        fetchMerchants();
      } else {
        alert(result.error || 'Failed to activate merchant');
      }
    } finally {
      setActionLoading(null);
    }
  };

  const handleSuspend = async (merchantId: number) => {
    setActionLoading(merchantId);
    try {
      const result = await apiAdminMerchantAction(merchantId, 'update', { status: 'suspended', isActive: false });
      if (result.success) {
        fetchMerchants();
      } else {
        alert(result.error || 'Failed to suspend merchant');
      }
    } finally {
      setActionLoading(null);
    }
  };

  const columns = [
    {
      key: 'businessName',
      header: 'Merchant',
      render: (merchant: AdminMerchant) => (
        <div>
          <p className="font-medium text-white">{merchant.businessName || 'Unnamed'}</p>
          <p className="text-xs text-gray-500 font-mono">{merchant.authAddress.slice(0, 10)}...{merchant.authAddress.slice(-8)}</p>
        </div>
      ),
    },
    {
      key: 'creditBalance',
      header: 'Credits',
      render: (merchant: AdminMerchant) => (
        <div>
          <p className={`font-medium ${merchant.creditBalance < 100 ? 'text-red-400' : 'text-white'}`}>
            {merchant.creditBalance.toLocaleString()} mainnet
          </p>
          <p className="text-xs text-gray-500">
            Used: {merchant.lifetimeCreditsUsed.toLocaleString()}
          </p>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (merchant: AdminMerchant) => <StatusBadge status={merchant.status as 'active' | 'pending' | 'suspended' | 'banned'} />,
    },
    {
      key: 'totalVolume',
      header: 'Volume',
      render: (merchant: AdminMerchant) => (
        <span className="text-sm text-gray-400">
          ${merchant.totalVolume?.toLocaleString() || '0'}
        </span>
      ),
    },
    {
      key: 'lastActiveAt',
      header: 'Last Active',
      render: (merchant: AdminMerchant) => (
        <span className="text-sm text-gray-400">
          {merchant.lastActiveAt 
            ? new Date(merchant.lastActiveAt).toLocaleDateString()
            : 'Never'}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      className: 'text-right',
      render: (merchant: AdminMerchant) => (
        <div className="flex items-center justify-end gap-2">
          <a
            href={`/admin/merchants/${merchant.id}`}
            className="px-3 py-1.5 text-xs bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors"
          >
            View
          </a>
          {merchant.status === 'pending' && (
            <button 
              onClick={(e) => { e.stopPropagation(); handleActivate(merchant.id); }}
              disabled={actionLoading === merchant.id}
              className="px-3 py-1.5 text-xs bg-cyan-400/20 text-cyan-400 hover:bg-cyan-400/30 rounded-lg transition-colors disabled:opacity-50"
            >
              {actionLoading === merchant.id ? '...' : 'Approve'}
            </button>
          )}
          {merchant.status === 'active' && (
            <>
              <button 
                onClick={(e) => { e.stopPropagation(); handleSuspend(merchant.id); }}
                disabled={actionLoading === merchant.id}
                className="px-3 py-1.5 text-xs bg-orange-500/20 text-orange-400 hover:bg-orange-500/30 rounded-lg transition-colors disabled:opacity-50"
              >
                {actionLoading === merchant.id ? '...' : 'Suspend'}
              </button>
              <button 
                onClick={(e) => { e.stopPropagation(); handleBan(merchant.id); }}
                disabled={actionLoading === merchant.id}
                className="px-3 py-1.5 text-xs bg-red-500/20 text-red-400 hover:bg-red-500/30 rounded-lg transition-colors disabled:opacity-50"
              >
                {actionLoading === merchant.id ? '...' : 'Ban'}
              </button>
            </>
          )}
          {merchant.status === 'suspended' && (
            <>
              <button 
                onClick={(e) => { e.stopPropagation(); handleActivate(merchant.id); }}
                disabled={actionLoading === merchant.id}
                className="px-3 py-1.5 text-xs bg-green-500/20 text-green-400 hover:bg-green-500/30 rounded-lg transition-colors disabled:opacity-50"
              >
                {actionLoading === merchant.id ? '...' : 'Activate'}
              </button>
              <button 
                onClick={(e) => { e.stopPropagation(); handleBan(merchant.id); }}
                disabled={actionLoading === merchant.id}
                className="px-3 py-1.5 text-xs bg-red-500/20 text-red-400 hover:bg-red-500/30 rounded-lg transition-colors disabled:opacity-50"
              >
                {actionLoading === merchant.id ? '...' : 'Ban'}
              </button>
            </>
          )}
          {merchant.status === 'banned' && (
            <button 
              onClick={(e) => { e.stopPropagation(); handleUnban(merchant.id); }}
              disabled={actionLoading === merchant.id}
              className="px-3 py-1.5 text-xs bg-green-500/20 text-green-400 hover:bg-green-500/30 rounded-lg transition-colors disabled:opacity-50"
            >
              {actionLoading === merchant.id ? '...' : 'Unban'}
            </button>
          )}
        </div>
      ),
    },
  ];

  const statusCounts = merchants.reduce((acc, m) => {
    acc[m.status] = (acc[m.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Merchants</h1>
          <p className="text-gray-400 mt-1">Manage merchant accounts and credits</p>
        </div>
        <div className="flex items-center gap-3">
          <Button 
            variant="outline" 
            size="sm" 
            icon={<RefreshIcon className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />}
            onClick={fetchMerchants}
            disabled={loading}
          >
            Refresh
          </Button>
          <Button variant="outline" size="sm" icon={<DownloadIcon className="w-4 h-4" />}>
            Export
          </Button>
        </div>
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="py-3">
            <p className="text-sm text-gray-400">Total Merchants</p>
            <p className="text-2xl font-bold text-white">{total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3">
            <p className="text-sm text-gray-400">Active</p>
            <p className="text-2xl font-bold text-green-400">
              {statusCounts['active'] || 0}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3">
            <p className="text-sm text-gray-400">Pending</p>
            <p className="text-2xl font-bold text-yellow-400">
              {statusCounts['pending'] || 0}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3">
            <p className="text-sm text-gray-400">Suspended/Banned</p>
            <p className="text-2xl font-bold text-red-400">
              {(statusCounts['suspended'] || 0) + (statusCounts['banned'] || 0)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent>
          <div className="flex items-center gap-4">
            <div className="flex-1 relative">
              <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input
                type="text"
                placeholder="Search by name, ID, or address..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-cyan-400/50 focus:border-cyan-400"
              />
            </div>
            <Select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              options={[
                { value: 'all', label: 'All Status' },
                { value: 'active', label: 'Active' },
                { value: 'pending', label: 'Pending' },
                { value: 'suspended', label: 'Suspended' },
                { value: 'banned', label: 'Banned' },
              ]}
              className="w-40"
            />
          </div>
        </CardContent>
      </Card>

      {/* Error State */}
      {error && (
        <Card>
          <CardContent>
            <div className="text-center py-4">
              <p className="text-red-400 mb-2">{error}</p>
              <button onClick={fetchMerchants} className="text-cyan-400 hover:text-cyan-300">
                Try again
              </button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Loading State */}
      {loading && (
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-400"></div>
        </div>
      )}

      {/* Table */}
      {!loading && !error && (
        <Table
          columns={columns}
          data={merchants}
          keyExtractor={(m) => m.id}
          onRowClick={(m) => window.location.href = `/admin/merchants/${m.id}`}
        />
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={setCurrentPage}
        />
      )}
    </div>
  );
}
