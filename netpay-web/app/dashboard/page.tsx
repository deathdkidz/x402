'use client';

import { useEffect, useState, useCallback } from 'react';
import { StatCard, Card, CardHeader, CardContent, CreditBalanceCard } from '@/components/ui';
import { StatusBadge } from '@/components/ui/Badge';
import { TransactionsIcon, RefreshIcon, ExternalLinkIcon, CopyIcon, CheckIcon } from '@/components/icons';
import { useAuth } from '@/lib/auth-context';

interface DashboardStats {
  creditBalance: number;
  lifetimeCreditsPurchased: number;
  lifetimeCreditsUsed: number;
  totalTransactions: number;
  completedTransactions: number;
  failedTransactions: number;
  pendingTransactions: number;
  totalVolume: number;
  avgTransaction: number;
  recentTransactions: number;
  recentVolume: number;
  successRate: number;
}

interface Transaction {
  id: number;
  payerAddress: string;
  amount: number;
  asset: string;
  network: string;
  status: 'pending' | 'preconfirmed' | 'completed' | 'failed';
  txHash: string | null;
  createdAt: string;
  resource: string | null;
}

interface VolumeData {
  date: string;
  count: number;
  volume: number;
}

export default function MerchantDashboard() {
  const { merchant } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [volumeByDay, setVolumeByDay] = useState<VolumeData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [copied, setCopied] = useState(false);

  const fetchDashboardData = useCallback(async () => {
    try {
      const res = await fetch('/api/dashboard/stats');
      if (!res.ok) throw new Error('Failed to fetch data');
      const data = await res.json();
      
      setStats(data.stats);
      setTransactions(data.recentTransactions);
      setVolumeByDay(data.volumeByDay);
    } catch (error) {
      console.error('Dashboard fetch error:', error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    fetchDashboardData();
  };

  const copyApiKey = async () => {
    if (merchant?.address) {
      await navigator.clipboard.writeText(merchant.address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
    
    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  };

  const mapStatus = (status: string): 'pending' | 'preconfirmed' | 'confirmed' | 'failed' => {
    if (status === 'completed') return 'confirmed';
    if (status === 'preconfirmed') return 'preconfirmed';
    if (status === 'failed') return 'failed';
    return 'pending';
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          <p className="text-gray-400 mt-1">
            Welcome back, {merchant?.businessName || `${merchant?.address.slice(0, 6)}...${merchant?.address.slice(-4)}`}
          </p>
        </div>
        <button 
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 rounded-lg text-sm text-gray-300 transition-colors"
        >
          <RefreshIcon className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Credit Balance Card */}
      <CreditBalanceCard
        balance={stats?.creditBalance || 0}
        lowBalanceThreshold={100}
        onPurchase={() => window.location.href = '/dashboard/credits'}
      />

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Settlements (7d)"
          value={stats?.recentTransactions || 0}
          subtitle={`${stats?.totalTransactions || 0} total`}
        />
        <StatCard
          title="Volume (7d)"
          value={`$${(stats?.recentVolume || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          subtitle={`$${(stats?.totalVolume || 0).toLocaleString()} total`}
        />
        <StatCard
          title="Success Rate"
          value={`${stats?.successRate || 0}%`}
        />
        <StatCard
          title="Credits Used"
          value={stats?.lifetimeCreditsUsed || 0}
          subtitle={`${stats?.lifetimeCreditsPurchased || 0} purchased`}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Transactions */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-white">Recent Transactions</h3>
                <a href="/dashboard/transactions" className="text-sm text-cyan-400 hover:text-cyan-300">
                  View all →
                </a>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-gray-800">
                {transactions.length === 0 ? (
                  <div className="px-4 py-8 text-center text-gray-500">
                    No transactions yet
                  </div>
                ) : (
                  transactions.map((tx) => (
                    <div key={tx.id} className="px-4 py-3 flex items-center justify-between hover:bg-gray-800/30">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-lg bg-gray-800 flex items-center justify-center">
                          <TransactionsIcon className="w-5 h-5 text-gray-400" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-white">${tx.amount.toFixed(2)}</p>
                          <p className="text-xs text-gray-500">
                            {tx.payerAddress.slice(0, 6)}...{tx.payerAddress.slice(-4)} • {tx.network}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <StatusBadge status={mapStatus(tx.status)} />
                        <p className="text-xs text-gray-500 w-20 text-right">{formatTimeAgo(tx.createdAt)}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions & Info */}
        <div className="space-y-4">
          {/* Wallet Address */}
          <Card>
            <CardHeader>
              <h3 className="font-semibold text-white">Wallet Address</h3>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="p-3 bg-gray-800/50 rounded-lg">
                <p className="text-xs text-gray-500 mb-1">Your Address</p>
                <p className="font-mono text-sm text-white truncate">
                  {merchant?.address}
                </p>
              </div>
              <button 
                onClick={copyApiKey}
                className="w-full px-3 py-2 text-xs bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                {copied ? (
                  <>
                    <CheckIcon className="w-4 h-4 text-green-400" />
                    Copied!
                  </>
                ) : (
                  <>
                    <CopyIcon className="w-4 h-4" />
                    Copy Address
                  </>
                )}
              </button>
            </CardContent>
          </Card>

          {/* Quick Links */}
          <Card>
            <CardHeader>
              <h3 className="font-semibold text-white">Quick Links</h3>
            </CardHeader>
            <CardContent className="space-y-2">
              <a 
                href="/dashboard/docs" 
                className="flex items-center justify-between p-3 bg-gray-800/50 hover:bg-gray-800 rounded-lg transition-colors"
              >
                <span className="text-sm text-gray-300">API Documentation</span>
                <ExternalLinkIcon className="w-4 h-4 text-gray-500" />
              </a>
              <a 
                href="/dashboard/credits" 
                className="flex items-center justify-between p-3 bg-gray-800/50 hover:bg-gray-800 rounded-lg transition-colors"
              >
                <span className="text-sm text-gray-300">Purchase Credits</span>
                <ExternalLinkIcon className="w-4 h-4 text-gray-500" />
              </a>
              <a 
                href="/dashboard/settings" 
                className="flex items-center justify-between p-3 bg-gray-800/50 hover:bg-gray-800 rounded-lg transition-colors"
              >
                <span className="text-sm text-gray-300">Webhook Settings</span>
                <ExternalLinkIcon className="w-4 h-4 text-gray-500" />
              </a>
            </CardContent>
          </Card>

          {/* Account Status */}
          <Card>
            <CardContent>
              <div className="text-center py-2">
                <p className="text-sm text-gray-400 mb-2">Account Status</p>
                <span className={`inline-flex px-3 py-1 rounded-full text-sm font-medium ${
                  merchant?.status === 'active' 
                    ? 'bg-green-400/10 text-green-400' 
                    : 'bg-yellow-400/10 text-yellow-400'
                }`}>
                  {merchant?.status || 'Unknown'}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Volume Chart */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-white">Settlement Volume (7 days)</h3>
          </div>
        </CardHeader>
        <CardContent>
          {volumeByDay.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-gray-500">
              No volume data yet
            </div>
          ) : (
            <div className="h-48 flex items-end justify-between gap-2">
              {volumeByDay.slice(-7).map((day, i) => {
                const maxVolume = Math.max(...volumeByDay.map(d => d.volume), 1);
                return (
                  <div key={i} className="flex-1 flex flex-col items-center gap-2">
                    <div 
                      className="w-full bg-cyan-400/20 rounded-t-lg hover:bg-cyan-400/30 transition-colors relative group"
                      style={{ height: `${Math.max((day.volume / maxVolume) * 100, 5)}%` }}
                    >
                      <div className="absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-1 bg-gray-800 rounded text-xs text-white opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                        ${day.volume.toFixed(2)}
                      </div>
                    </div>
                    <span className="text-xs text-gray-500">
                      {new Date(day.date).toLocaleDateString('en-US', { weekday: 'short' })}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
