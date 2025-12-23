'use client';

import { useState, useEffect } from 'react';
import { StatCard, Card, CardHeader, CardContent } from '@/components/ui';
import { StatusBadge } from '@/components/ui/Badge';
import {
  UsersIcon,
  TransactionsIcon,
  WalletIcon,
  AnalyticsIcon,
  RefreshIcon,
} from '@/components/icons';

// Type for admin dashboard stats
interface AdminDashboardStats {
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
  recentSettlements: Array<{
    id: number;
    merchantName: string;
    amount: number;
    network: string;
    status: string;
    createdAt: string;
  }>;
}

// Client-side API helper
async function apiGetAdminDashboard() {
  const sessionToken = localStorage.getItem('admin_session_token');
  if (!sessionToken) {
    return { success: false, error: 'Not authenticated' };
  }
  const res = await fetch(`/api/admin/dashboard?sessionToken=${sessionToken}`);
  return res.json();
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<AdminDashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDashboard = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await apiGetAdminDashboard();
      if (result.success && result.data) {
        setStats(result.data);
      } else {
        setError(result.error || 'Failed to load dashboard');
      }
    } catch (err) {
      setError('Failed to connect to API');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboard();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-400"></div>
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="space-y-6">
        <Card>
          <CardContent>
            <div className="text-center py-8">
              <p className="text-red-400 mb-4">{error || 'Failed to load dashboard'}</p>
              <button
                onClick={fetchDashboard}
                className="px-4 py-2 bg-cyan-400 text-black rounded-lg hover:bg-cyan-300 transition-colors"
              >
                Retry
              </button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = Math.floor((now.getTime() - date.getTime()) / 1000);
    if (diff < 60) return `${diff} sec ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} hr ago`;
    return date.toLocaleDateString();
  };

  const mapStatus = (status: string): 'confirmed' | 'pending' | 'failed' => {
    if (status === 'confirmed' || status === 'completed') return 'confirmed';
    if (status === 'pending' || status === 'processing') return 'pending';
    return 'failed';
  };
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Admin Dashboard</h1>
          <p className="text-gray-400 mt-1">Overview of the X402 protocol system</p>
        </div>
        <button 
          onClick={fetchDashboard}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm text-gray-300 transition-colors disabled:opacity-50"
        >
          <RefreshIcon className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Main Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Merchants"
          value={stats.totalMerchants}
          icon={<UsersIcon className="w-5 h-5" />}
          subtitle={`${stats.activeMerchants} active`}
        />
        <StatCard
          title="Settlements (24h)"
          value={stats.totalSettlements24h.toLocaleString()}
          icon={<TransactionsIcon className="w-5 h-5" />}
          subtitle={`${stats.successRate24h.toFixed(1)}% success rate`}
        />
        <StatCard
          title="Volume (24h)"
          value={`$${stats.totalVolume24h.toLocaleString()}`}
          icon={<WalletIcon className="w-5 h-5" />}
        />
        <StatCard
          title="Credits Used"
          value={stats.totalCreditsUsed.toLocaleString()}
          icon={<AnalyticsIcon className="w-5 h-5" />}
          subtitle={`${stats.totalCreditsPurchased.toLocaleString()} purchased`}
        />
      </div>

      {/* Secondary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-400">Active Merchants</p>
                <p className="text-2xl font-bold text-green-400">{stats.activeMerchants}</p>
              </div>
              <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center">
                <span className="text-2xl">✓</span>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-400">Pending Approval</p>
                <p className="text-2xl font-bold text-yellow-400">{stats.pendingMerchants}</p>
              </div>
              <div className="w-16 h-16 rounded-full bg-yellow-500/10 flex items-center justify-center">
                <span className="text-2xl">⏳</span>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-400">Suspended</p>
                <p className="text-2xl font-bold text-orange-400">{stats.suspendedMerchants}</p>
              </div>
              <div className="w-16 h-16 rounded-full bg-orange-500/10 flex items-center justify-center">
                <span className="text-2xl">⏸</span>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-400">Banned</p>
                <p className="text-2xl font-bold text-red-400">{stats.bannedMerchants}</p>
              </div>
              <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center">
                <span className="text-2xl">⚠</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Settlements */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-white">Recent Settlements</h3>
                <a href="/admin/settlements" className="text-sm text-cyan-400 hover:text-cyan-300">
                  View all →
                </a>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-gray-800">
                {stats.recentSettlements.length > 0 ? (
                  stats.recentSettlements.map((settlement) => (
                    <div key={settlement.id} className="px-4 py-3 flex items-center justify-between hover:bg-gray-800/30">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-lg bg-gray-800 flex items-center justify-center">
                          <TransactionsIcon className="w-5 h-5 text-gray-400" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-white">{settlement.merchantName || 'Unknown'}</p>
                          <p className="text-xs text-gray-500">#{settlement.id} • {settlement.network}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <p className="text-sm font-medium text-white">${settlement.amount.toFixed(2)}</p>
                        <StatusBadge status={mapStatus(settlement.status)} />
                        <p className="text-xs text-gray-500 w-20 text-right">{formatTime(settlement.createdAt)}</p>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="px-4 py-8 text-center text-gray-500">
                    No recent settlements
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Quick Stats Panel */}
        <div className="space-y-4">
          {/* 7 Day Stats */}
          <Card>
            <CardHeader>
              <h3 className="font-semibold text-white">7 Day Summary</h3>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-gray-400">Settlements</span>
                <span className="text-white font-medium">{stats.totalSettlements7d.toLocaleString()}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-400">Volume</span>
                <span className="text-white font-medium">${stats.totalVolume7d.toLocaleString()}</span>
              </div>
            </CardContent>
          </Card>

          {/* Quick Actions */}
          <Card>
            <CardHeader>
              <h3 className="font-semibold text-white">Quick Actions</h3>
            </CardHeader>
            <CardContent className="space-y-2">
              <a href="/admin/merchants" className="block w-full px-4 py-2 text-sm text-left bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors">
                View All Merchants
              </a>
              <a href="/admin/settlements" className="block w-full px-4 py-2 text-sm text-left bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors">
                View All Settlements
              </a>
              <a href="/admin/paymasters" className="block w-full px-4 py-2 text-sm text-left bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors">
                Manage Paymasters
              </a>
              <a href="/admin/audit" className="block w-full px-4 py-2 text-sm text-left bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors">
                View Audit Log
              </a>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
